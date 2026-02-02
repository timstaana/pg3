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
let TERMINAL_VELOCITY;
let SLOPE_SPEED_FACTOR;
let PLAYER_MOVE_SPEED;
let PLAYER_TURN_SPEED;
let CAMERA_CONFIG;
let INTERACTION_CONFIG;
let LIGHTBOX_CONFIG;

// Player textures
let PLAYER_FRONT_TEX;
let PLAYER_BACK_TEX;

// NPC avatar textures (map of avatarId -> {front, back})
let NPC_AVATAR_TEXTURES = {};

// Asset streaming registry
const ASSET_REGISTRY = {
  loadQueue: [],              // Priority queue of {entity, assetType, priority}
  activeLoads: new Set(),     // Currently loading URLs to prevent duplicates
  maxConcurrentLoads: 1,      // Limit parallel fetches (lower = less stuttering)
  frameCounter: 0,            // Global frame counter for LRU tracking
  levelDir: '',               // Current level directory for asset paths
  lastLoadFrame: 0,           // Last frame when a load was started
  loadCooldown: 60            // Wait N frames between starting new loads (1 second at 60fps)
};

// Asset streaming configuration
const STREAMING_CONFIG = {
  maxRenderDistance: 50.0,      // Existing from CULLING_CONFIG
  preloadDistance: 60.0,        // Load before entering view
  unloadDistance: 100.0,        // Unload when far away
  priorityUpdateInterval: 30,   // Frames between priority recalculation
  unloadFrameThreshold: 300     // Unload after ~5 seconds unseen (at 60fps)
};

// ========== Loading Screen ==========

let loadingScreen = null;
let loadingFrame = 0;

const createLoadingScreen = () => {
  loadingScreen = document.createElement('div');
  loadingScreen.id = 'loading-screen';
  Object.assign(loadingScreen.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '9999',
    fontFamily: 'monospace',
    color: '#fff',
    fontSize: '20px'
  });

  const loadingText = document.createElement('div');
  loadingText.id = 'loading-text';
  loadingText.textContent = 'Loading...';

  const loadingBar = document.createElement('div');
  loadingBar.id = 'loading-bar';
  loadingBar.style.marginTop = '20px';
  loadingBar.textContent = '[          ]';

  loadingScreen.appendChild(loadingText);
  loadingScreen.appendChild(loadingBar);
  document.body.appendChild(loadingScreen);

  // Animate loading bar
  const animateLoader = () => {
    if (!loadingScreen || !loadingScreen.parentElement) return;

    loadingFrame++;
    const frames = ['[/         ]', '[ -        ]', '[  \\       ]', '[   |      ]',
                    '[    /     ]', '[     -    ]', '[      \\   ]', '[       |  ]',
                    '[        / ]', '[         -]', '[        \\ ]', '[       |  ]'];
    const bar = document.getElementById('loading-bar');
    if (bar) {
      bar.textContent = frames[loadingFrame % frames.length];
    }
    setTimeout(animateLoader, 100);
  };
  animateLoader();
};

const removeLoadingScreen = () => {
  if (loadingScreen && loadingScreen.parentElement) {
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      if (loadingScreen && loadingScreen.parentElement) {
        document.body.removeChild(loadingScreen);
        loadingScreen = null;
      }
    }, 500);
  }
};

// ========== Initialization ==========

async function setup() {
  createLoadingScreen();

  createCanvas(windowWidth, windowHeight, WEBGL);

  // Prevent iOS from treating canvas as an image
  const canvas = document.querySelector('canvas');
  if (canvas) {
    // CSS properties to prevent image-like behavior
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.webkitTouchCallout = 'none';
    canvas.style.webkitTapHighlightColor = 'transparent';
    canvas.style.webkitUserDrag = 'none';
    canvas.style.userDrag = 'none';

    // Prevent context menu and drag events (don't interfere with touch/pointer events)
    // TouchInputSystem handles pointer events with its own preventDefault
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dragstart', (e) => e.preventDefault());

    // Prevent iOS long-press image save menu
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // Only prevent multi-touch zoom
      }
    }, { passive: false });
  }

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
  TERMINAL_VELOCITY = config.physics.terminalVelocity;
  SLOPE_SPEED_FACTOR = config.physics.slopeSpeedFactor;
  PLAYER_MOVE_SPEED = config.player.moveSpeed;
  PLAYER_TURN_SPEED = config.player.turnSpeed;
  CAMERA_CONFIG = config.camera;
  INTERACTION_CONFIG = config.interaction;
  LIGHTBOX_CONFIG = config.lightbox;

  world = createWorld();
  collisionWorld = createCollisionWorld();

  setupInputListeners();

  const levelPath = `levels/${config.defaultLevel}/${config.defaultLevel}.json`;
  const result = await loadLevel(levelPath, world, collisionWorld);
  player = result.player;

  // Load player textures (support level-specific player configuration)
  const levelDir = levelPath.substring(0, levelPath.lastIndexOf('/'));
  const levelData = result.levelData;

  // Check if level defines custom player configuration with multiple avatars
  const playerConfig = levelData.player || {};
  let frontSpritePath = 'assets/player_front.png';
  let backSpritePath = 'assets/player_back.png';

  if (playerConfig.avatars && playerConfig.avatars.length > 0) {
    // Support multiple avatar options
    // For now, use the selected avatar or default to first one
    const selectedId = playerConfig.selectedAvatar || playerConfig.avatars[0].id;
    const avatar = playerConfig.avatars.find(a => a.id === selectedId) || playerConfig.avatars[0];

    frontSpritePath = `${levelDir}/${avatar.front}`;
    backSpritePath = `${levelDir}/${avatar.back}`;
    console.log(`Loading avatar: ${avatar.name || avatar.id} (${selectedId})`);
  }

  console.log(`Loading player sprites: front=${frontSpritePath}, back=${backSpritePath}`);

  PLAYER_FRONT_TEX = await new Promise((resolve, reject) => {
    loadImage(frontSpritePath, resolve, reject);
  });
  PLAYER_BACK_TEX = await new Promise((resolve, reject) => {
    loadImage(backSpritePath, resolve, reject);
  });

  // Load NPC avatar textures (load all avatars defined in level)
  if (playerConfig.avatars && playerConfig.avatars.length > 0) {
    console.log(`Loading ${playerConfig.avatars.length} NPC avatar(s)...`);
    for (const avatar of playerConfig.avatars) {
      const frontPath = `${levelDir}/${avatar.front}`;
      const backPath = `${levelDir}/${avatar.back}`;

      NPC_AVATAR_TEXTURES[avatar.id] = {
        front: await new Promise((resolve, reject) => loadImage(frontPath, resolve, reject)),
        back: await new Promise((resolve, reject) => loadImage(backPath, resolve, reject))
      };
      console.log(`Loaded NPC avatar: ${avatar.id} (${avatar.name || 'unnamed'})`);
    }
  }

  // Always add default avatar using player textures
  NPC_AVATAR_TEXTURES['default'] = {
    front: PLAYER_FRONT_TEX,
    back: PLAYER_BACK_TEX
  };

  // Load alpha cutout shader (with error handling for p5.js v2)
  // p5.js v2 returns Promises from loadShader, so we need to await them
  try {
    alphaCutoutShader = await loadShader('shaders/alphaCutout.vert', 'shaders/alphaCutout.frag');
    console.log('Alpha cutout shader loaded successfully');
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

  // Initialize multiplayer if enabled
  if (config.multiplayer && config.multiplayer.enabled) {
    console.log('Multiplayer enabled - connecting to server...');

    // Auto-detect server URL from current page URL (unless manually specified)
    let serverUrl = config.multiplayer.serverUrl;
    if (!serverUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = window.location.hostname;
      const port = window.location.port;

      // Only add port if explicitly set (for local dev like localhost:8080)
      // On Fly.io, no port is needed (uses standard HTTPS/WSS ports)
      serverUrl = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
      console.log(`Auto-detected server URL: ${serverUrl}`);
    }

    // Use level name as room (default behavior if room not specified)
    const room = config.multiplayer.room || config.defaultLevel || 'default';
    console.log(`Joining multiplayer room: "${room}"`);
    enableMultiplayer(serverUrl, room);
  }

  // Remove loading screen
  removeLoadingScreen();
}

// ========== Game Loop ==========

const runSystems = (dt) => {
  TouchInputSystem(world, dt);
  InputSystem(world, dt);
  PlayerMotionSystem(world, dt);
  ScriptSystem(world, dt); // Process entity scripts
  GravitySystem(world, dt);
  IntegrateSystem(world, dt);
  CollisionSystem(world, collisionWorld, dt);
  RespawnSystem(world, dt);
  NetworkSystem(world, dt); // Multiplayer networking (before animation for movement flags)
  AnimationSystem(world, dt);
  InteractionSystem(world);
  DialogueSystem(world, dt); // NPC dialogue and interactions
  LightboxSystem(world, dt);
  AssetStreamingSystem(world, dt); // Progressive asset loading
  CameraSystem(world, collisionWorld);
  RenderSystem(world, collisionWorld, dt);
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

  const debugLines = [
    `FPS: ${fps}`,
    `Pos: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`,
    `Grounded: ${playerData.grounded}`,
    `Slope: ${slopeAngle.toFixed(1)}° (${slopeType})`,
    `Triangles: ${collisionWorld.tris.length}`,
  ];

  // Add network stats if multiplayer active
  if (typeof getNetworkState === 'function') {
    const netState = getNetworkState();
    if (netState.connected) {
      debugLines.push('');
      debugLines.push('=== NETWORK ===');
      debugLines.push(`Status: ✓ Connected`);
      debugLines.push(`Players: ${netState.remotePlayers.size}`);

      if (netState.reconnecting) {
        debugLines.push(`Reconnecting (${netState.reconnectAttempt}/${netState.maxReconnectAttempts})`);
      }
    } else if (netState.reconnecting) {
      debugLines.push('');
      debugLines.push('=== NETWORK ===');
      debugLines.push('Status: Reconnecting...');
    }
  }

  debugTextEntity.CanvasOverlay.text = debugLines;
};

// ========== Window Events ==========

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resizeCanvasOverlay();
  clearTextGraphicsCache();
}
