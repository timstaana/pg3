// main.js - p5.js 3D Platformer with ECS Architecture
// Game loop orchestrator and system execution

// ========== Game State ==========

let world;
let collisionWorld;
let player;
let lastTime = 0;
let debugTextEntity;

// Global config constants (loaded from JSON)
let WORLD_SCALE;
let GRAVITY;
let MAX_SLOPE_DEG;
let MIN_GROUND_NY;
let GROUNDING_TOLERANCE;
let COLLISION_CONFIG;

// ========== Initialization ==========

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);

  // Load configuration
  const configResponse = await fetch('config.json');
  const config = await configResponse.json();

  WORLD_SCALE = config.world.scale;
  GRAVITY = config.physics.gravity;
  MAX_SLOPE_DEG = config.physics.maxSlopeDeg;
  MIN_GROUND_NY = Math.cos(MAX_SLOPE_DEG * Math.PI / 180);
  GROUNDING_TOLERANCE = config.physics.groundingTolerance;
  COLLISION_CONFIG = config.collision;

  world = createWorld();
  collisionWorld = createCollisionWorld();

  setupInputListeners();

  const levelPath = `levels/${config.defaultLevel}/${config.defaultLevel}.json`;
  const result = await loadLevel(levelPath, world, collisionWorld);
  player = result.player;

  console.log('Setup complete!');
  console.log(`Entities: ${world.entities.length}`);
  console.log(`Triangles: ${collisionWorld.tris.length}`);

  lastTime = millis() / 1000;

  initCanvasOverlay();

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

// ========== Game Loop ==========

const runSystems = (dt) => {
  InputSystem(world, dt);
  PlayerMotionSystem(world, dt);
  GravitySystem(world, dt);
  IntegrateSystem(world, dt);
  CollisionSystem(world, collisionWorld, dt);
  CameraSystem(world, dt);
  RenderSystem(world, dt);
  CanvasOverlaySystem(world, dt);
};

function draw() {
  if (!world || !player) {
    background(20);
    return;
  }

  const currentTime = millis() / 1000;
  const dt = currentTime - lastTime;
  lastTime = currentTime;

  const clampedDt = constrain(dt, 0, 0.033);

  runSystems(clampedDt);
  updateDebugInfo(dt);
}

// ========== Debug Info ==========

const updateDebugInfo = (dt) => {
  if (!player || !collisionWorld || !debugTextEntity) return;

  const fps = round(1 / dt);
  const { Transform: { pos }, Player: { grounded } } = player;

  debugTextEntity.CanvasOverlay.text = [
    `FPS: ${fps}`,
    `Pos: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`,
    `Grounded: ${grounded}`,
    `Triangles: ${collisionWorld.tris.length}`
  ];
};

// ========== Window Events ==========

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resizeCanvasOverlay();
  clearTextGraphicsCache();
}
