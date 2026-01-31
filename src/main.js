// main.js - Entry point for minimal ECS 3D platformer

// ========== Global State ==========

let world;
let collisionWorld;
let player;
let lastTime = 0;

// ========== p5.js Setup ==========

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);

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
  if (!player || !collisionWorld) return;

  // Draw 2D overlay
  push();
  camera(); // Reset to 2D view
  fill(255);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(14);

  const fps = Math.round(1.0 / dt);
  const playerPos = player.Transform.pos;
  const grounded = player.Player.grounded;

  text(`FPS: ${fps}`, -width / 2 + 10, -height / 2 + 10);
  text(`Pos: (${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)})`, -width / 2 + 10, -height / 2 + 30);
  text(`Grounded: ${grounded}`, -width / 2 + 10, -height / 2 + 50);
  text(`Triangles: ${collisionWorld.tris.length}`, -width / 2 + 10, -height / 2 + 70);

  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
