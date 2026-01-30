// Game Constants
const TILE_SIZE = 32;
const COLS = 30;
const ROWS = 22;
const CANVAS_WIDTH = COLS * TILE_SIZE;
const CANVAS_HEIGHT = ROWS * TILE_SIZE;

// Tile IDs
const TILE_GRASS = 0;
const TILE_PATH = 1; // Dirt
const TILE_CASTLE = 2; // Stone
const TILE_WALL = 3; // Wall

// Assets
const ASSETS = {
    grass: new Image(),
    dirt: new Image(),
    stone: new Image(),
    wall: new Image(),
    towers: new Image(), // Keep old towers for now, or just use colored boxes if broken
    goblin: new Image(),
    orc: new Image(),
    skeleton: new Image(),
    wolf: new Image() // Wolf sprite sheet
};

// Game State
let canvas, ctx;
let gameLoopId;
let lastTime = 0;
let gameState = {
    running: false,
    gold: 300,
    lives: 20,
    wave: 0,
    time: 0,
    map: [], // 2D array for tiles
    slots: [], // Array of {c, r, state} where state: 'locked', 'empty', 'tower'
    towers: [],
    enemies: [],
    projectiles: [],
    menu: { visible: false, x: 0, y: 0, target: null }
};

// Tower Definitions
const TOWERS = {
    'archer': { name: 'Archer', cost: 50, range: 100, damage: 10, speed: 1.0, color: '#d4af37' },
    'cannon': { name: 'Cannon', cost: 120, range: 150, damage: 30, speed: 2.0, color: '#333' },
    'mage':   { name: 'Mage',   cost: 200, range: 120, damage: 2, speed: 0.1, color: '#00ccff' },
    'barracks': { name: 'Knight', cost: 80, range: 0, damage: 0, speed: 0, color: '#b33939' }
};

const SLOT_UNLOCK_COST = 50;
const CASTLE_POS = { c: 15, r: 11 };

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    
    // Disable smoothing for pixel art look
    ctx.imageSmoothingEnabled = false;

    // Load Assets
    ASSETS.grass.src = 'assets/grass.png';
    ASSETS.dirt.src = 'assets/dirt.png';
    ASSETS.stone.src = 'assets/stone.png';
    ASSETS.wall.src = 'assets/wall.png';
    ASSETS.goblin.src = 'assets/goblin.png';
    ASSETS.orc.src = 'assets/orc.png';
    ASSETS.skeleton.src = 'assets/skeleton.png';
    ASSETS.wolf.src = 'assets/wolf_run.png'; // Wolf sprite sheet (3 frames)
    ASSETS.towers.src = 'assets/towers.png'; // Legacy

    // UI Listeners
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', resetGame);
    document.getElementById('retry-btn').addEventListener('click', resetGame);
    
    // Canvas Interaction
    canvas.addEventListener('click', handleGridClick);

    // Initial Render - wait a bit for assets or just go
    setTimeout(() => {
        initMap();
        draw();
    }, 500);
});

function startGame() {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    if (!gameState.running) {
        initGame();
        gameState.running = true;
        requestAnimationFrame(gameLoop);
    }
}

function initGame() {
    gameState.gold = 300;
    gameState.lives = 20;
    gameState.wave = 1;
    gameState.towers = [];
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.slots = [];
    gameState.menu.visible = false;
    
    initMap(); // Generate the tile map
    generateMapSlots(); // Generate build slots
    
    updateUI();
}

function initMap() {
    // 1. Fill with Grass
    gameState.map = new Array(ROWS).fill(0).map(() => new Array(COLS).fill(TILE_GRASS));

    // 2. Draw Path (Row 11)
    for (let c = 0; c < COLS; c++) {
        gameState.map[11][c] = TILE_PATH;
    }

    // 3. Draw Castle Area
    for (let r = CASTLE_POS.r - 1; r <= CASTLE_POS.r + 1; r++) {
        for (let c = CASTLE_POS.c - 1; c <= CASTLE_POS.c + 1; c++) {
            gameState.map[r][c] = TILE_CASTLE;
        }
    }
}

function generateMapSlots() {
    // Define Paths (Simple lines for logic)
    for (let c = 1; c < COLS - 1; c++) {
        // Skip the castle area center
        if (Math.abs(c - CASTLE_POS.c) < 2) continue;
        
        // Add slots above and below path
        gameState.slots.push({ c: c, r: 10, state: 'locked' });
        gameState.slots.push({ c: c, r: 12, state: 'locked' });
        
        // Randomly add some more for variety
        if (Math.random() > 0.7) gameState.slots.push({ c: c, r: 9, state: 'locked' });
        if (Math.random() > 0.7) gameState.slots.push({ c: c, r: 13, state: 'locked' });
    }
    
    // Unlock a few near castle for free
    gameState.slots.forEach(s => {
        if (Math.abs(s.c - CASTLE_POS.c) < 4) s.state = 'empty';
    });
}

function resetGame() {
    document.getElementById('game-over').classList.add('hidden');
    initGame();
    gameState.running = true;
    requestAnimationFrame(gameLoop);
}

// Core Game Loop
function gameLoop(timestamp) {
    if (!gameState.running) return;

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(dt);
    draw();

    gameLoopId = requestAnimationFrame(gameLoop);
}

function update(dt) {
    gameState.time += dt;

    // Spawning
    if (gameState.enemies.length < gameState.wave * 5 && Math.random() < 0.02) {
        spawnEnemy();
    }
    
    // Wave Management (every 30s)
    if (Math.floor(gameState.time) > gameState.wave * 30) {
        gameState.wave++;
        updateUI();
    }

    // Update Enemies
    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        let enemy = gameState.enemies[i];
        moveEnemy(enemy);
        
        if (enemy.reachedEnd) {
            gameState.lives--;
            gameState.enemies.splice(i, 1);
            updateUI();
            if (gameState.lives <= 0) gameOver();
        } else if (enemy.hp <= 0) {
            gameState.gold += enemy.bounty;
            gameState.enemies.splice(i, 1);
            updateUI();
        }
    }

    // Update Towers
    gameState.towers.forEach(tower => updateTower(tower));

    // Update Projectiles
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        updateProjectile(gameState.projectiles[i], i);
    }
}

function draw() {
    // 1. Background (Tile Map)
    if (gameState.map.length > 0) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const tileId = gameState.map[r][c];
                const x = c * TILE_SIZE;
                const y = r * TILE_SIZE;
                
                let img = ASSETS.grass;
                if (tileId === TILE_PATH) img = ASSETS.dirt;
                if (tileId === TILE_CASTLE) img = ASSETS.stone;
                if (tileId === TILE_WALL) img = ASSETS.wall;

                if (img && img.complete) {
                    ctx.drawImage(img, x, y, TILE_SIZE, TILE_SIZE);
                } else {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }
    
    // 2. Draw Slots
    gameState.slots.forEach(slot => {
        const x = slot.c * TILE_SIZE;
        const y = slot.r * TILE_SIZE;
        
        if (slot.state === 'locked') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = '#555';
            ctx.strokeRect(x+2, y+2, TILE_SIZE-4, TILE_SIZE-4);
            // Lock icon
            ctx.fillStyle = '#888';
            ctx.fillText('🔒', x + 8, y + 20);
        } else if (slot.state === 'empty') {
            ctx.fillStyle = 'rgba(212, 175, 55, 0.2)'; // Gold tint
            ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = '#d4af37';
            ctx.strokeRect(x+2, y+2, TILE_SIZE-4, TILE_SIZE-4);
        }
    });

    // 4. Draw Towers
    gameState.towers.forEach(tower => {
        const x = tower.c * TILE_SIZE;
        const y = tower.r * TILE_SIZE;
        
        // Fallback: Colored Box
        ctx.fillStyle = tower.def.color;
        ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        
        // Upgrade Level
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.fillText('Lv' + tower.level, x + 2, y + 30);
    });

    // 5. Draw Castle
    const cx = CASTLE_POS.c * TILE_SIZE;
    const cy = CASTLE_POS.r * TILE_SIZE;
    ctx.fillStyle = '#b33939';
    ctx.fillRect(cx - 16, cy - 16, 64, 64); // Big castle
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(cx - 16, cy - 16, 64, 64);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('KEEP', cx + 16, cy + 5);

    // 6. Enemies
    gameState.enemies.forEach(enemy => {
        let img = ASSETS.goblin;
        let isAnimated = false;
        let frameCount = 1;
        
        if (enemy.type === 1) img = ASSETS.orc;
        if (enemy.type === 2) img = ASSETS.skeleton;
        if (enemy.type === 3) {
            img = ASSETS.wolf;
            isAnimated = true;
            frameCount = 3; // Wolf has 3 frames
        }

        if (img && img.complete) {
            if (isAnimated) {
                // Animated sprite: calculate frame based on time
                const frameWidth = img.width / frameCount;
                const frameIndex = Math.floor(gameState.time * 8) % frameCount; // 8 fps animation
                const sx = frameIndex * frameWidth;
                ctx.drawImage(img, sx, 0, frameWidth, img.height, enemy.x - 16, enemy.y - 16, 32, 32);
            } else {
                ctx.drawImage(img, enemy.x - 16, enemy.y - 16, 32, 32);
            }
        } else {
            ctx.fillStyle = '#f00';
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, 10, 0, Math.PI*2);
            ctx.fill();
        }

        // HP Bar
        ctx.fillStyle = 'red';
        ctx.fillRect(enemy.x - 10, enemy.y - 20, 20, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(enemy.x - 10, enemy.y - 20, 20 * (enemy.hp / enemy.maxHp), 4);
    });

    // 7. Projectiles
    ctx.fillStyle = '#fff';
    gameState.projectiles.forEach(proj => {
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

// Logic Helpers
function handleGridClick(e) {
    if (!gameState.running) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);

    // Hide previous menu
    hideMenu();

    // Check Slots
    const slot = gameState.slots.find(s => s.c === c && s.r === r);
    const tower = gameState.towers.find(t => t.c === c && t.r === r);

    if (tower) {
        showMenu(x, y, 'tower', tower);
    } else if (slot) {
        if (slot.state === 'locked') {
            showMenu(x, y, 'locked', slot);
        } else if (slot.state === 'empty') {
            showMenu(x, y, 'build', slot);
        }
    }
}

function showMenu(x, y, type, target) {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');
    gameState.menu.visible = true;

    if (type === 'locked') {
        const btn = document.createElement('div');
        btn.className = 'menu-option';
        btn.innerHTML = `Unlock Slot (${SLOT_UNLOCK_COST}g)`;
        btn.onclick = () => {
            if (gameState.gold >= SLOT_UNLOCK_COST) {
                gameState.gold -= SLOT_UNLOCK_COST;
                target.state = 'empty';
                updateUI();
                hideMenu();
            }
        };
        menu.appendChild(btn);
    } else if (type === 'build') {
        const title = document.createElement('div');
        title.className = 'menu-title';
        title.innerText = 'Build Tower';
        menu.appendChild(title);

        for (let key in TOWERS) {
            const def = TOWERS[key];
            const btn = document.createElement('div');
            btn.className = 'menu-option';
            btn.innerHTML = `${def.name} (${def.cost}g)`;
            if (gameState.gold < def.cost) btn.classList.add('disabled');
            
            btn.onclick = () => {
                if (gameState.gold >= def.cost) {
                    gameState.gold -= def.cost;
                    target.state = 'tower'; // Mark slot as occupied
                    gameState.towers.push({
                        c: target.c,
                        r: target.r,
                        type: key,
                        def: def,
                        level: 1,
                        cooldown: 0,
                        damage: def.damage,
                        range: def.range
                    });
                    updateUI();
                    hideMenu();
                }
            };
            menu.appendChild(btn);
        }
    } else if (type === 'tower') {
         const title = document.createElement('div');
        title.className = 'menu-title';
        title.innerText = `${target.def.name} Lv${target.level}`;
        menu.appendChild(title);

        const upgradeCost = Math.floor(target.def.cost * 0.5 * target.level);
        const btn = document.createElement('div');
        btn.className = 'menu-option';
        btn.innerHTML = `Upgrade (+Dmg) (${upgradeCost}g)`;
        
        if (gameState.gold < upgradeCost) btn.classList.add('disabled');

        btn.onclick = () => {
            if (gameState.gold >= upgradeCost) {
                gameState.gold -= upgradeCost;
                target.level++;
                target.damage *= 1.5;
                updateUI();
                hideMenu();
            }
        };
        menu.appendChild(btn);
    }
}

function hideMenu() {
    document.getElementById('context-menu').classList.add('hidden');
    gameState.menu.visible = false;
}

function spawnEnemy() {
    // Pick side: 0 = Left, 1 = Right
    const side = Math.random() < 0.5 ? 0 : 1;
    const startX = side === 0 ? 0 : CANVAS_WIDTH;
    const startY = 11 * TILE_SIZE + TILE_SIZE/2; // Center of path row

    // Determine Enemy Type based on Wave
    let type = 0; // Goblin (Weak)
    if (gameState.wave >= 4) type = 1; // Orc (Medium)
    if (gameState.wave >= 6) type = 3; // Wolf (Fast)
    if (gameState.wave >= 8) type = 2; // Skeleton (Hard)
    
    // Mix it up slightly
    if (gameState.wave >= 4 && Math.random() < 0.3) type = 0;
    if (gameState.wave >= 6 && Math.random() < 0.3) type = 1;
    if (gameState.wave >= 8 && Math.random() < 0.3) type = 3;

    // Adjust stats based on type
    let baseSpeed = 1.0 + (gameState.wave * 0.1);
    let baseHp = 20 * Math.pow(1.3, gameState.wave);
    let baseBounty = 5 + gameState.wave;
    
    // Wolf (type 3): Faster, less HP
    if (type === 3) {
        baseSpeed *= 1.8;
        baseHp *= 0.7;
        baseBounty *= 1.2;
    }
    
    gameState.enemies.push({
        x: startX,
        y: startY,
        side: side,
        speed: baseSpeed,
        maxHp: baseHp,
        hp: baseHp,
        bounty: baseBounty,
        reachedEnd: false,
        type: type,
        frameOffset: Math.floor(Math.random() * 4) // Random start frame
    });
}

function moveEnemy(enemy) {
    // Move towards center (Castle)
    const targetX = CASTLE_POS.c * TILE_SIZE + TILE_SIZE/2;
    const targetY = CASTLE_POS.r * TILE_SIZE + TILE_SIZE/2;

    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 5) {
        enemy.reachedEnd = true;
    } else {
        enemy.x += (dx / dist) * enemy.speed;
        enemy.y += (dy / dist) * enemy.speed;
    }
}

function updateTower(tower) {
    if (tower.cooldown > 0) tower.cooldown--;

    // Find target
    let target = null;
    let minRange = 9999;

    gameState.enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - (tower.c * TILE_SIZE + TILE_SIZE/2), enemy.y - (tower.r * TILE_SIZE + TILE_SIZE/2));
        if (dist < tower.range && dist < minRange) {
            minRange = dist;
            target = enemy;
        }
    });

    if (target && tower.cooldown <= 0) {
        gameState.projectiles.push({
            x: tower.c * TILE_SIZE + TILE_SIZE/2,
            y: tower.r * TILE_SIZE + TILE_SIZE/2,
            target: target,
            speed: 5,
            damage: tower.damage,
            color: tower.def.color
        });
        tower.cooldown = 60 / tower.def.speed; 
    }
}

function updateProjectile(proj, index) {
    if (gameState.enemies.indexOf(proj.target) === -1) {
        gameState.projectiles.splice(index, 1);
        return;
    }

    const dx = proj.target.x - proj.x;
    const dy = proj.target.y - proj.y;
    const dist = Math.hypot(dx, dy);

    if (dist < proj.speed) {
        proj.target.hp -= proj.damage;
        gameState.projectiles.splice(index, 1);
    } else {
        proj.x += (dx / dist) * proj.speed;
        proj.y += (dy / dist) * proj.speed;
    }
}

function updateUI() {
    document.getElementById('gold-display').innerText = Math.floor(gameState.gold);
    document.getElementById('lives-display').innerText = gameState.lives;
    document.getElementById('wave-display').innerText = gameState.wave;
}

function gameOver() {
    gameState.running = false;
    document.getElementById('game-over').classList.remove('hidden');
}
