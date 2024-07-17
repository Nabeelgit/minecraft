// Game variables
let scene, camera, renderer, world, player, inventory;
let dayNightCycle, weather;
let keys = {}; // Move this to the top

// Initialize the game
function init() {
    // Set up Three.js scene, camera, and renderer
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Create world
    world = new World();
    world.generate();

    // Create player
    player = new Player();

    // Set up inventory
    inventory = new Inventory();

    // Set up day/night cycle
    dayNightCycle = new DayNightCycle();

    // Set up weather
    weather = new Weather();

    // Initialize keys object
    keys = {
        KeyW: false,
        KeyS: false,
        KeyA: false,
        KeyD: false,
        Space: false,
        ShiftLeft: false,
        MouseLeft: false
    };

    // Add crosshair
    addCrosshair();

    // Set up event listeners
    setupEventListeners();

    // Set up pointer lock
    document.body.addEventListener('click', () => {
        if (document.pointerLockElement !== document.body) {
            document.body.requestPointerLock();
        }
    });

    // Start game loop
    gameLoop();
}

// Add crosshair
function addCrosshair() {
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    crosshair.style.position = 'absolute';
    crosshair.style.top = '50%';
    crosshair.style.left = '50%';
    crosshair.style.width = '20px';
    crosshair.style.height = '20px';
    crosshair.style.backgroundColor = 'transparent';
    crosshair.style.border = '2px solid gray';
    crosshair.style.borderRadius = '50%';
    crosshair.style.transform = 'translate(-50%, -50%)';
    crosshair.style.pointerEvents = 'none';
    document.body.appendChild(crosshair);
}

// Game loop
function gameLoop() {
    const delta = 1 / 60; // Assume 60 FPS, you might want to calculate actual delta time
    requestAnimationFrame(gameLoop);

    // Handle continuous movement
    const moveDirection = new THREE.Vector3();
    if (keys.KeyW) moveDirection.z -= 1;
    if (keys.KeyS) moveDirection.z += 1;
    if (keys.KeyA) moveDirection.x -= 1;
    if (keys.KeyD) moveDirection.x += 1;
    if (moveDirection.length() > 0) {
        player.move(moveDirection);
    }

    // Handle jumping
    if (keys.Space) {
        player.jump();
    }

    // Update game state
    player.update(delta);
    dayNightCycle.update();
    weather.update();

    // Apply friction to slow down the player
    player.velocity.x *= 0.9;
    player.velocity.z *= 0.9;

    // Render the scene
    renderer.render(scene, camera);
}

// World class
class World {
    constructor() {
        this.blocks = new Map();
        this.terrainMap = new Map();
    }

    generate() {
        // Generate terrain with hills and water
        // This is a simplified version, you'd need a more complex algorithm for realistic terrain
        for (let x = -10; x < 10; x++) {
            for (let z = -10; z < 10; z++) {
                let y = Math.floor(Math.sin(x / 5) * Math.cos(z / 5) * 3);
                this.addBlock(x, y, z, y < 0 ? 'water' : 'grass');
                this.terrainMap.set(`${x},${z}`, y);
            }
        }
    }

    addBlock(x, y, z, type) {
        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshBasicMaterial({ 
            color: type === 'water' ? 0x0000ff : 0x00ff00,
            transparent: true,
            opacity: 1
        });
        const block = new THREE.Mesh(geometry, material);
        block.position.set(x, y, z);
        block.userData.type = type;
        block.userData.health = 100; // Full health
        scene.add(block);
        this.blocks.set(`${x},${y},${z}`, block);
    }

    getBlock(x, y, z) {
        return this.blocks.get(`${x},${y},${z}`);
    }

    removeBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        const block = this.blocks.get(key);
        if (block) {
            scene.remove(block);
            this.blocks.delete(key);
        }
    }

    getTerrainHeight(x, z) {
        const roundedX = Math.round(x);
        const roundedZ = Math.round(z);
        return this.terrainMap.get(`${roundedX},${roundedZ}`) || 0;
    }
}

// Player class
class Player {
    constructor() {
        this.position = new THREE.Vector3(0, 10, 0); // Start a bit higher
        this.velocity = new THREE.Vector3();
        this.speed = 0.1;
        this.gravity = -9.8;
        this.jumpForce = 5;
        this.isOnGround = false;
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        camera.position.copy(this.position);
        this.inventory = new Inventory();
        this.breakingBlock = null;
        this.breakingProgress = 0;
        this.clickCount = 0;
    }

    update(delta) {
        // Apply gravity
        if (!this.isOnGround) {
            this.velocity.y += this.gravity * delta;
        }

        // Update position
        this.position.add(this.velocity.clone().multiplyScalar(delta));

        // Ground collision check
        const groundY = world.getTerrainHeight(this.position.x, this.position.z);
        if (this.position.y < groundY + 1) { // +1 to stand on top of blocks
            this.position.y = groundY + 1;
            this.velocity.y = 0;
            this.isOnGround = true;
        } else {
            this.isOnGround = false;
        }

        // Update camera
        camera.position.copy(this.position);
        camera.rotation.copy(this.rotation);
    }

    move(direction) {
        direction.applyEuler(this.rotation);
        direction.y = 0; // Prevent flying
        direction.normalize();
        this.velocity.add(direction.multiplyScalar(this.speed));
    }

    jump() {
        if (this.isOnGround) {
            this.velocity.y = this.jumpForce;
            this.isOnGround = false;
        }
    }

    attemptBreakBlock() {
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(camera.quaternion);
        const raycaster = new THREE.Raycaster(this.position, direction);
        const intersects = raycaster.intersectObjects(Array.from(world.blocks.values()));

        if (intersects.length > 0) {
            const block = intersects[0].object;
            if (block.userData.type === 'grass') {
                if (this.breakingBlock !== block) {
                    this.resetBreakingProgress();
                    this.breakingBlock = block;
                }

                this.clickCount++;
                this.breakingProgress = (this.clickCount / 5) * 100;
                block.material.opacity = 1 - (this.breakingProgress / 100);

                if (this.clickCount >= 5) {
                    this.breakBlock(block);
                }
            }
        } else {
            this.resetBreakingProgress();
        }
    }

    breakBlock(block) {
        const position = block.position;
        world.removeBlock(position.x, position.y, position.z);
        this.inventory.addItem('grass');
        this.resetBreakingProgress();
    }

    resetBreakingProgress() {
        if (this.breakingBlock) {
            this.breakingBlock.material.opacity = 1; // Reset opacity if not broken
        }
        this.breakingBlock = null;
        this.breakingProgress = 0;
        this.clickCount = 0;
    }

    rotate(x, y) {
        this.rotation.y -= x * 0.01;
        this.rotation.x -= y * 0.01;
        this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
    }
}

// Inventory class
class Inventory {
    constructor() {
        this.items = {};
    }

    addItem(item) {
        if (this.items[item]) {
            this.items[item]++;
        } else {
            this.items[item] = 1;
        }
        console.log(`Added ${item} to inventory. Total: ${this.items[item]}`);
    }

    removeItem(item) {
        const index = this.items.indexOf(item);
        if (index > -1) {
            this.items.splice(index, 1);
        }
    }
}

// DayNightCycle class
class DayNightCycle {
    constructor() {
        this.time = 0;
        this.dayDuration = 300; // 5 minutes per day
    }

    update() {
        this.time += 1 / 60; // Assume 60 FPS
        if (this.time >= this.dayDuration) {
            this.time = 0;
        }

        // Update scene lighting based on time
        const lightIntensity = Math.sin(this.time / this.dayDuration * Math.PI);
        scene.background = new THREE.Color(lightIntensity / 2, lightIntensity / 2, lightIntensity);
    }
}

// Weather class
class Weather {
    constructor() {
        this.currentWeather = 'clear';
        this.weatherDuration = 0;
    }

    update() {
        if (this.weatherDuration <= 0) {
            this.changeWeather();
        }
        this.weatherDuration--;

        // Implement weather effects (e.g., particle systems for rain or snow)
    }

    changeWeather() {
        const weathers = ['clear', 'rain', 'snow'];
        this.currentWeather = weathers[Math.floor(Math.random() * weathers.length)];
        this.weatherDuration = Math.random() * 600 + 300; // 5-15 minutes
    }
}

// Set up event listeners
function setupEventListeners() {
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('click', onMouseClick, false);
    document.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = true;
        }
    });
    document.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = false;
        }
    });
}

// Event handlers
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    if (keys.hasOwnProperty(event.code)) {
        keys[event.code] = true;
    }
}

function onMouseDown(event) {
    if (event.button === 0) { // Left mouse button
        keys.MouseLeft = true;
    }
}

function onMouseMove(event) {
    if (document.pointerLockElement === document.body) {
        player.rotate(event.movementX, event.movementY);
    }
}

function onMouseUp(event) {
    if (event.button === 0) { // Left mouse button
        keys.MouseLeft = false;
    }
}

function onMouseClick(event) {
    if (document.pointerLockElement === document.body) {
        player.attemptBreakBlock();
    } else {
        document.body.requestPointerLock();
    }
}

// Start the game
init();