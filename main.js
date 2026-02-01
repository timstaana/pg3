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
let JUMP_HEIGHT;
let SLOPE_SPEED_FACTOR;
let PLAYER_MOVE_SPEED;
let PLAYER_TURN_SPEED;
let CAMERA_CONFIG;

// Player textures
let PLAYER_FRONT_TEX;
let PLAYER_BACK_TEX;

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
  JUMP_HEIGHT = config.physics.jumpHeight;
  SLOPE_SPEED_FACTOR = config.physics.slopeSpeedFactor;
  PLAYER_MOVE_SPEED = config.player.moveSpeed;
  PLAYER_TURN_SPEED = config.player.turnSpeed;
  CAMERA_CONFIG = config.camera;

  world = createWorld();
  collisionWorld = createCollisionWorld();

  setupInputListeners();

  // Load player textures
  PLAYER_FRONT_TEX = await new Promise((resolve, reject) => {
    loadImage('assets/player_front.png', resolve, reject);
  });
  PLAYER_BACK_TEX = await new Promise((resolve, reject) => {
    loadImage('assets/player_back.png', resolve, reject);
  });

  const levelPath = `levels/${config.defaultLevel}/${config.defaultLevel}.json`;
  const result = await loadLevel(levelPath, world, collisionWorld);
  player = result.player;

  // Load alpha cutout shader (with error handling for p5.js v2)
  try {
    alphaCutoutShader = loadShader('shaders/alphaCutout.vert', 'shaders/alphaCutout.frag');
    console.log('Shader loaded successfully');
  } catch (err) {
    console.warn('Shader failed to load, rendering without alpha cutout:', err);
    alphaCutoutShader = null;
  }

  console.log('Setup complete!');
  console.log(`Entities: ${world.entities.length}`);
  console.log(`Triangles: ${collisionWorld.tris.length}`);

  lastTime = millis() / 1000;

  initCanvasOverlay();

  debugTextEntity = createEntity(world, {
    CanvasOverlay: {
      x: 10,
      y: 10,
      text: ['FPS: --', 'Pos: --', 'Grounded: --', 'Slope: --', 'Triangles: --'],
      fontSize: 14,
      color: 'white',
      bgColor: 'rgba(0, 0, 0, 0.7)',
      padding: 10
    }
  });
}

// ========== Game Loop ==========

const runSystems = (dt) => {
  TouchInputSystem(world, dt);
  InputSystem(world, dt);
  PlayerMotionSystem(world, dt);
  GravitySystem(world, dt);
  IntegrateSystem(world, dt);
  CollisionSystem(world, collisionWorld, dt);
  AnimationSystem(world, dt);
  CameraSystem(world, collisionWorld, dt);
  RenderSystem(world, dt);
  CanvasOverlaySystem(world, dt);
  TouchJoystickRenderSystem(world, dt, getTouchState());
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

let debugUpdateCounter = 0;
const DEBUG_UPDATE_INTERVAL = 3; // Update debug text every N frames

const updateDebugInfo = (dt) => {
  if (!player || !collisionWorld || !debugTextEntity) return;

  // Throttle debug updates to every N frames for performance
  debugUpdateCounter++;
  if (debugUpdateCounter < DEBUG_UPDATE_INTERVAL) return;
  debugUpdateCounter = 0;

  const fps = round(1 / dt);
  const { Transform: { pos }, Player: playerData } = player;

  // Calculate slope angle from current normal
  let slopeAngle = 0;
  let slopeType = '--';

  if (playerData.grounded && playerData.groundNormal) {
    slopeAngle = Math.acos(playerData.groundNormal.y) * 180 / Math.PI;
    slopeType = 'Ground';
  } else if (playerData.steepSlope) {
    slopeAngle = Math.acos(playerData.steepSlope.y) * 180 / Math.PI;
    slopeType = 'Steep';
  }

  debugTextEntity.CanvasOverlay.text = [
    `FPS: ${fps}`,
    `Pos: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`,
    `Grounded: ${playerData.grounded}`,
    `Slope: ${slopeAngle.toFixed(1)}° (${slopeType})`,
    `Triangles: ${collisionWorld.tris.length}`,
    `Normal: ${playerData.smoothedGroundNormal?.y}`,
    `Normal: ${playerData.steepSlope?.y}`,
    // `SpeedMul: ${(playerData.slopeSpeedMul ?? 1).toFixed(2)}`,
  ];
};

// ========== Window Events ==========

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resizeCanvasOverlay();
  clearTextGraphicsCache();
}
