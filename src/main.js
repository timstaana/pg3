// main.js - Entry point for minimal ECS 3D platformer

// ========== Global State ==========

let world;
let collisionWorld;
let player;
let lastTime = 0;
let debugTextEntity; // Debug overlay entity

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

  // Initialize 2D canvas overlay
  initCanvasOverlay();

  // Create debug overlay entity
  debugTextEntity = createEntity(world, {
    CanvasOverlay: {
      x: 10,
      y: 10,
      text: ['FPS: --', 'Pos: --', 'Grounded: --', 'Triangles: --'],
      fontSize: 14,
      color: 'white',
      bgColor: 'rgba(0, 0, 0, 0.7)',
      padding: 10
    }
  });
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

  // 8. Canvas overlay (2D HUD)
  CanvasOverlaySystem(world, clampedDt);

  // Debug info
  drawDebugInfo(dt);
}

// ========== Debug UI ==========

function drawDebugInfo(dt) {
  if (!player || !collisionWorld || !debugTextEntity) return;

  const fps = Math.round(1.0 / dt);
  const playerPos = player.Transform.pos;
  const grounded = player.Player.grounded;

  // Update canvas overlay debug text
  debugTextEntity.CanvasOverlay.text = [
    `FPS: ${fps}`,
    `Pos: (${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)})`,
    `Grounded: ${grounded}`,
    `Triangles: ${collisionWorld.tris.length}`
  ];

  // Example: Draw world-space text above a platform (using old system)
  drawWorldText(
    ['Platform 1'],
    vec3(6, 3, -2), // Position in world coordinates
    200, 40,
    {
      bgColor: [100, 50, 150, 200],
      billboard: true
    }
  );
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resizeCanvasOverlay();
  clearTextGraphicsCache();
}
