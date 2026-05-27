// main.js - Simple 3D platformer

// ========== Physics & Player Constants ==========

const WORLD_SCALE      = 50;
const GRAVITY          = 30;
const MAX_SLOPE_DEG    = 50.0;
const MIN_GROUND_NY    = Math.cos(MAX_SLOPE_DEG * Math.PI / 180);
const GROUNDING_TOLERANCE = 0.001;
const COLLISION_CONFIG = { queryMargin: 0.5, downMargin: 2.0, upMargin: 2.0 };
const JUMP_HEIGHT      = 1.5;
const TERMINAL_VELOCITY = 20.0;
const PLAYER_MOVE_SPEED = 5.0;
const PLAYER_TURN_SPEED = 80.0;

const CAMERA_CONFIG = {
  distance:      5.0,
  minDistance:   2.0,
  height:        1.75,
  pitch:         10,
  lookAtYOffset: 1.5
};

// ========== Multiplayer Config ==========
// serverUrl: null = auto-detect from page URL (works for both local and deployed)

const MULTIPLAYER = {
  enabled:   true,
  serverUrl: null,
  room:      'basic'
};

// ========== Level Definition ==========
// pos = center of box, size = [width, height, depth]
// Platform reachability: jump height ≈ 1.5 units above player center.
// Player center on a surface = surfaceTop + 0.4 (collision radius).

const LEVEL_BOXES = [
  // Large floor
  { id: 'floor', pos: [0,    0,    0],   rot: [0, 0,   0], scale: 1, size: [24, 1,   24],  color: [65, 80,  95]  },
  // Step 1 — easy first jump from floor (top at 1.75, reachable from floor center 0.9 + 1.5 = 2.4)
  { id: 'p1',    pos: [0,    1.5, -7],   rot: [0, 0,   0], scale: 1, size: [6,  0.5,  4],  color: [75, 110, 75]  },
  // Step 2 — from p1 (reachable from p1 center 2.15 + 1.5 = 3.65 → need 3.15)
  { id: 'p2',    pos: [7,    2.5, -6],   rot: [0, 0,   0], scale: 1, size: [4,  0.5,  4],  color: [110, 75, 75]  },
  // Side platform — same height as p2, reachable from p1
  { id: 'p3',    pos: [-6,   2.5, -5],   rot: [0, 0,   0], scale: 1, size: [4,  0.5,  4],  color: [110, 110, 65] },
  // High platform — from p2 (center 3.15 + 1.5 = 4.65 → need 4.4)
  { id: 'p4',    pos: [2,    3.75,-12],  rot: [0, 0,   0], scale: 1, size: [5,  0.5,  5],  color: [75, 75,  120] },
  // Highest point — from p4 (center 4.4 + 1.5 = 5.9 → need 5.4)
  { id: 'p5',    pos: [-2,   4.75, -9],  rot: [0, 0,   0], scale: 1, size: [3,  0.5,  3],  color: [120, 75, 120] },
  // Tilted ramp (15° roll)
  { id: 'ramp',  pos: [10,   1.0,  5],   rot: [0, 0, -15], scale: 1, size: [8,  0.5,  6],  color: [100, 90, 65]  },
];

const SPAWN_POS = [0, 3, 0];
const SPAWN_YAW = 0;

// ========== Game State ==========

let world;
let collisionWorld;
let player;
let lastTime = 0;

let PLAYER_FRONT_TEX;
let PLAYER_BACK_TEX;
let fpsDiv;

// ========== Level Builder ==========

const buildLevel = () => {
  LEVEL_BOXES.forEach(box => {
    const pos   = createVector(...box.pos);
    const rot   = createVector(...box.rot);
    const scale = typeof box.scale === 'number'
      ? createVector(box.scale, box.scale, box.scale)
      : createVector(...box.scale);

    addBoxCollider(collisionWorld, pos, rot, scale, box.size);
    const aabb = computeBoxAABB(pos, rot, scale, box.size);

    createEntity(world, {
      Collider: {
        id: box.id,
        type: 'box',
        pos, rot, scale,
        size:  box.size,
        color: box.color || [80, 120, 160],
        aabb
      }
    });
  });

  // Create player entity
  const jumpSpeed = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
  const spawnPos  = createVector(...SPAWN_POS);

  player = createEntity(world, {
    Player: {
      radius:     0.4,
      grounded:   false,
      groundNormal: createVector(0, 1, 0),
      jumpSpeed,
      moveSpeed:  PLAYER_MOVE_SPEED,
      turnSpeed:  PLAYER_TURN_SPEED,
      spawnPos:   spawnPos.copy(),
      spawnYaw:   SPAWN_YAW
    },
    Transform: {
      pos:   spawnPos.copy(),
      rot:   createVector(0, SPAWN_YAW, 0),
      scale: createVector(1, 1, 1)
    },
    Velocity: {
      vel: createVector(0, 0, 0)
    },
    Input: {
      forward: 0,
      turn:    0,
      jump:    false
    },
    Animation: {
      currentFrame:    0,
      frameTime:       0,
      framesPerSecond: 6,
      totalFrames:     3,
      idleFrame:       0,
      walkFrames:      [1, 2]
    }
  });
};

// ========== Setup ==========

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);

  // Prevent iOS long-press / drag / zoom gestures on canvas
  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.style.touchAction            = 'none';
    canvas.style.userSelect             = 'none';
    canvas.style.webkitUserSelect       = 'none';
    canvas.style.webkitTouchCallout     = 'none';
    canvas.style.webkitTapHighlightColor = 'transparent';
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('dragstart',   e => e.preventDefault());
    canvas.addEventListener('touchstart',  e => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
  }

  // Simple FPS display
  fpsDiv = document.createElement('div');
  fpsDiv.style.cssText = [
    'position:fixed', 'top:8px', 'left:8px', 'color:#fff',
    'font:13px monospace', 'background:rgba(0,0,0,0.5)',
    'padding:4px 8px', 'border-radius:4px',
    'pointer-events:none', 'z-index:100'
  ].join(';');
  document.body.appendChild(fpsDiv);

  // Build world
  world          = createWorld();
  collisionWorld = createCollisionWorld();

  setupInputListeners();
  buildLevel();

  // Load player sprites
  PLAYER_FRONT_TEX = await new Promise((res, rej) =>
    loadImage('assets/player_front.png', res, rej)
  );
  PLAYER_BACK_TEX = await new Promise((res, rej) =>
    loadImage('assets/player_back.png', res, rej)
  );

  // Load alpha-cutout shader (for transparent sprite edges)
  try {
    alphaCutoutShader = await loadShader(
      'shaders/alphaCutout.vert',
      'shaders/alphaCutout.frag'
    );
  } catch (err) {
    console.warn('Shader load failed, sprites will have square edges:', err);
    alphaCutoutShader = null;
  }

  lastTime = millis() / 1000;

  // Connect multiplayer
  if (MULTIPLAYER.enabled) {
    let url = MULTIPLAYER.serverUrl;
    if (!url) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host  = window.location.hostname;
      const port  = window.location.port;
      url = port ? `${proto}//${host}:${port}` : `${proto}//${host}`;
    }
    enableMultiplayer(url, MULTIPLAYER.room);
  }
}

// ========== Game Loop ==========

function draw() {
  if (!world || !player) { background(20); return; }

  const now = millis() / 1000;
  const dt  = constrain(now - lastTime, 0, 0.033);
  lastTime  = now;

  TouchInputSystem(world, dt);
  InputSystem(world, dt);
  PlayerMotionSystem(world, dt);
  GravitySystem(world, dt);
  IntegrateSystem(world, dt);
  CollisionSystem(world, collisionWorld, dt);
  RespawnSystem(world, dt);
  NetworkSystem(world, dt);
  AnimationSystem(world, dt);
  CameraSystem(world, collisionWorld);
  RenderSystem(world, collisionWorld, dt);
  TouchJoystickRenderSystem(world, dt, getTouchState());

  // Update FPS counter every 30 frames
  if (frameCount % 30 === 0) {
    fpsDiv.textContent = `${round(frameRate())} fps`;
  }
}

// ========== Window Resize ==========

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
