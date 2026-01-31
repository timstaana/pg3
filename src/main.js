// main.js - Entry point for minimal ECS 3D platformer

// ========== Global State ==========

let world;
let collisionWorld;
let player;
let lastTime = 0;
let debugUIGraphics; // 2D graphics buffer for debug text

// ========== p5.js Setup ==========

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);

  // Create 2D graphics buffer for debug UI
  debugUIGraphics = createGraphics(400, 120);
  debugUIGraphics.textFont('monospace');
  debugUIGraphics.textSize(14);

  // Initialize ECS world
  world = createWorld();
  collisionWorld = createCollisionWorld();

  // Setup input listeners
  setupInputListeners();

  // Load level
  const result = await loadLevel('data/level.json', world, collisionWorld);
  player = result.player;

  console.log('Setup complete!');
  console.log(`World entities: ${world.entities.length}`);
  console.log(`Collision triangles: ${collisionWorld.tris.length}`);

  lastTime = millis() / 1000.0;
}

// ========== p5.js Draw Loop ==========

function draw() {
  // Wait for setup to complete
  if (!world || !player) {
    background(20);
    return;
  }

  // Calculate delta time
  const currentTime = millis() / 1000.0;
  const dt = currentTime - lastTime;
  lastTime = currentTime;

  // Clamp dt for stability
  const clampedDt = Math.min(dt, 0.033); // Max ~30 FPS

  // ========== Run Systems (in order) ==========

  // 1. Input
  InputSystem(world, clampedDt);

  // 2. Player Motion
  PlayerMotionSystem(world, clampedDt);

  // 3. Gravity
  GravitySystem(world, clampedDt);

  // 4. Integrate
  IntegrateSystem(world, clampedDt);

  // 5. Collision (most important)
  CollisionSystem(world, collisionWorld, clampedDt);

  // 6. Camera
  CameraSystem(world, clampedDt);

  // 7. Render
  RenderSystem(world, clampedDt);

  // Debug info
  drawDebugInfo(dt);
}

// ========== Debug UI ==========

function drawDebugInfo(dt) {
  if (!player || !collisionWorld || !debugUIGraphics) return;

  const fps = Math.round(1.0 / dt);
  const playerPos = player.Transform.pos;
  const grounded = player.Player.grounded;

  // Render text to 2D graphics buffer
  debugUIGraphics.clear();
  debugUIGraphics.fill(255);
  debugUIGraphics.noStroke();
  debugUIGraphics.textAlign(LEFT, TOP);

  debugUIGraphics.text(`FPS: ${fps}`, 10, 10);
  debugUIGraphics.text(`Pos: (${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)})`, 10, 30);
  debugUIGraphics.text(`Grounded: ${grounded}`, 10, 50);
  debugUIGraphics.text(`Triangles: ${collisionWorld.tris.length}`, 10, 70);

  // Display the graphics buffer as a texture on a plane in 3D space
  push();
  // Position in top-left corner of screen
  translate(-width / 2 + 200, -height / 2 + 60, 0);
  noStroke();
  texture(debugUIGraphics);
  plane(400, 120);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  // Recreate debug UI graphics buffer
  if (debugUIGraphics) {
    debugUIGraphics.remove();
  }
  debugUIGraphics = createGraphics(400, 120);
  debugUIGraphics.textFont('monospace');
  debugUIGraphics.textSize(14);
}
