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
const PLAYER_RADIUS     = 0.3;

const CAMERA_CONFIG = {
  distance:      5.0,
  minDistance:   2.0,
  height:        1.75,
  pitch:         10,
  lookAtYOffset: 0.55  // sprite spans pos.y−0.4 → pos.y+1.1; centre ≈ 0.35
};

// ========== Multiplayer Config ==========
// serverUrl: null = auto-detect from page URL (works for both local and deployed)

const MULTIPLAYER = {
  enabled:   true,
  serverUrl: null,
  room:      'basic'
};

const SPAWN_POS = [0, 0.1, 0];
const SPAWN_YAW = 0;

// ========== OBJ Model Definition ==========
// Drop Blender exports here — they get collision + rendering automatically.
//
// Blender export steps:
//   File › Export › Wavefront (.obj)
//   ✓ Triangulate Faces   ✓ Include UVs
//   Forward Axis: -Z      Up Axis: Y   (default)
//   Export the .obj and the .png texture into the assets/ folder.
//
// Fields:
//   src       – path to .obj (required)
//   texture   – path to PNG/JPG (optional; omit for generated tile texture)
//   pos       – [x, y, z] world position
//   rot       – [x, y, z] Euler degrees  (optional, default [0,0,0])
//   scale     – uniform number or [x,y,z] (optional, default 1)
//   collision – true (default) = player can walk on the mesh

const LEVEL_MODELS = [
  // Placeholder level — replace with your own Blender export
  { src: 'assets/world.obj', pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, collision: true },
];

// ========== Game State ==========

let world;
let collisionWorld;
let player;
let lastTime = 0;

let PLAYER_FRONT_TEX;
let PLAYER_BACK_TEX;

// All skin textures keyed by skin id — populated in setup(), used by RenderSystem
// for remote players so each player shows their own chosen skin.
const SKIN_TEXTURES = {}; // { skinId: { front: p5.Image, back: p5.Image } }
let fpsDiv;

// ========== Level Builder ==========

const buildLevel = () => {
  // Create player entity — level geometry loaded separately via loadModels()
  const jumpSpeed = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
  const spawnPos  = createVector(...SPAWN_POS);

  player = createEntity(world, {
    Player: {
      radius:     PLAYER_RADIUS,
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

// ========== OBJ Model Loader ==========

// Procedural tile texture — used when a model has no texture file.
// Generates a 128×128 grid pattern as a p5.Graphics (valid WEBGL texture).
const makeTileTexture = () => {
  const g = createGraphics(128, 128);
  g.background(60, 80, 100);
  g.stroke(90, 115, 140);
  g.strokeWeight(1);
  for (let i = 0; i < 128; i += 16) {
    g.line(i, 0, i, 128);
    g.line(0, i, 128, i);
  }
  return g;
};

const loadModels = async () => {
  for (const def of LEVEL_MODELS) {
    const pos   = createVector(...def.pos);
    const rot   = createVector(...(def.rot   || [0, 0, 0]));
    const scale = typeof def.scale === 'number'
      ? createVector(def.scale, def.scale, def.scale)
      : createVector(...(def.scale || [1, 1, 1]));

    try {
      const { vertices, uvs, faces } = parseOBJ(
        await (await fetch(def.src)).text()
      );

      // Add mesh to the collision world so the player can walk on it
      if (def.collision !== false) {
        addMeshCollider(
          collisionWorld, vertices,
          faces.map(f => [f[0].vertex, f[1].vertex, f[2].vertex]),
          pos, rot, scale
        );
      }

      // Texture: load from path, generate tile pattern, or null for grey shading
      const tex = def.texture
        ? await new Promise((res, rej) => loadImage(def.texture, res, rej))
        : makeTileTexture();

      // Build a p5.Geometry once — reused every frame for fast rendering
      const geo = new p5.Geometry();
      faces.forEach(face => {
        face.forEach(f => {
          const v = vertices[f.vertex];
          geo.vertices.push(createVector(v.x, v.y, v.z));
          if (uvs.length) {
            const uv = f.uv >= 0 ? uvs[f.uv] : createVector(0, 0);
            geo.uvs.push(uv.x, 1 - uv.y); // flip V for p5.js convention
          }
        });
        const n = geo.vertices.length;
        geo.faces.push([n - 3, n - 2, n - 1]);
      });
      geo.computeNormals();

      createEntity(world, { Model: { pos, rot, scale, geo, tex } });
      console.log(`Model: ${def.src} (${faces.length} tris)`);
    } catch (err) {
      console.warn(`Model failed: ${def.src}`, err);
    }
  }
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
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
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
  await loadModels(); // no-op when LEVEL_MODELS is empty

  // Set up UI overlay (skin + emote buttons)
  setupUI((emoteId) => {
    const ps = queryEntities(world, 'Player', 'Transform');
    if (ps.length > 0) {
      const pos = ps[0].Transform.pos;
      const wx = pos.x, wy = pos.y + 1.3, wz = pos.z;
      spawnEmote(wx, wy, wz, emoteId);
      sendEmote(wx, wy, wz, emoteId);
    }
  });

  // Load emote textures (must run after p5 canvas is created)
  await loadEmoteTextures();

  // Pre-load all skin textures so remote players can display their chosen skin
  for (const skin of SKINS) {
    const [front, back] = await Promise.all([
      new Promise((res, rej) => loadImage(skin.front, res, rej)),
      new Promise((res, rej) => loadImage(skin.back,  res, rej)),
    ]);
    SKIN_TEXTURES[skin.id] = { front, back };
  }

  // Initialise local player textures from the default skin
  const defaultSkin = SKIN_TEXTURES[SKINS[0].id];
  PLAYER_FRONT_TEX = defaultSkin.front;
  PLAYER_BACK_TEX  = defaultSkin.back;

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
  CameraSystem(world, collisionWorld, dt);
  RenderSystem(world, collisionWorld, dt);
  EmoteSystem(dt);
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
