// CameraSystem.js — Third-person camera with portrait intro / idle mode
//
// Two camera configurations:
//   INTRO    — portrait close-up facing the player's front (start + idle)
//   GAMEPLAY — third-person behind the player (existing behaviour)
//
// cameraBlend (0 = intro, 1 = gameplay) drives everything:
//   • Arc angle  = yawRad + blend * PI   → always sweeps around the player,
//                                          never cuts through the middle.
//   • Distance, FOV, camera height, and lookAt Y all lerp with the same value.
//
// Any input snaps the mode to GAMEPLAY (fast blend → snappy feel).
// 30 s of no input switches to INTRO (slow blend → cinematic pull-around).

const SMOOTH         = 0.12;  // rig lerp each frame (smooths jitter)
const IDLE_TIMEOUT   = 30;    // seconds of no input before intro activates

const BLEND_TO_GAME  = 0.08;  // blend speed: intro → gameplay  (≈ 1 s arc)
const BLEND_TO_INTRO = 0.04;  // blend speed: gameplay → intro  (≈ 2 s arc)

// ── Portrait (intro) camera parameters ───────────────────────────────────────
const INTRO_DIST     = 2.2;       // close — fills the frame
const INTRO_CAM_Y    = 0.55;      // world units above player feet (below face)
const INTRO_LOOK_Y   = 0.95;      // look at face/head level
const INTRO_FOV      = Math.PI / 4.2;  // ≈ 43° telephoto — flattering portrait
const GAME_FOV       = Math.PI / 3;    // 60° normal gameplay

// ── Module state ─────────────────────────────────────────────────────────────

let cameraMode  = 'intro';  // 'intro' | 'gameplay'
let idleTimer   = 0;        // seconds since last input
let cameraBlend = 0;        // 0 = intro, 1 = gameplay

const cameraRig = {
  eyeX: 0, eyeY: 0, eyeZ: 0,
  initialized: false,
  camPosWorld: null,  // p5.Vector — read by RenderSystem for sprite facing
};

// ── Coordinate helper ─────────────────────────────────────────────────────────

const worldToP5 = (x, y, z) => createVector(
  x *  WORLD_SCALE,
  y * -WORLD_SCALE,
  z *  WORLD_SCALE
);

// ── System ────────────────────────────────────────────────────────────────────

const CameraSystem = (world, collisionWorld, dt) => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return;

  const { Transform: { pos: pp, rot }, Input: inp } = players[0];
  const cfg = CAMERA_CONFIG;

  // ── Idle / mode detection ─────────────────────────────────────────────────
  const hasInput = inp && (
    Math.abs(inp.forward) > 0.01 ||
    Math.abs(inp.turn)    > 0.01 ||
    inp.jump
  );

  if (hasInput) {
    idleTimer  = 0;
    cameraMode = 'gameplay';
  } else if (cameraMode === 'gameplay') {
    idleTimer += dt;
    if (idleTimer >= IDLE_TIMEOUT) cameraMode = 'intro';
  }

  // ── Blend toward target mode ──────────────────────────────────────────────
  const blendTarget = cameraMode === 'gameplay' ? 1 : 0;
  const blendRate   = cameraMode === 'gameplay' ? BLEND_TO_GAME : BLEND_TO_INTRO;
  cameraBlend      += (blendTarget - cameraBlend) * blendRate;

  const b  = cameraBlend;
  const bi = 1 - b;

  // ── Arc angle ─────────────────────────────────────────────────────────────
  // intro  → camera is at yawRad          (directly in front of player)
  // game   → camera is at yawRad + PI     (directly behind player)
  // blend drives a smooth 180° arc: yawRad + blend*PI
  // The camera always swings around the outside — never cuts through.
  const yawRad  = radians(-rot.y);
  const arcAngle = yawRad + b * PI;

  // ── Shared pitch (gameplay) ───────────────────────────────────────────────
  const pitchRad = radians(cfg.pitch);
  const cosPitch = cos(pitchRad);
  const sinPitch = sin(pitchRad);

  // ── Idle sway ─────────────────────────────────────────────────────────────
  // Three overlapping sine waves at prime-ish frequencies give an organic,
  // non-repeating feel.  All amplitudes are in world units and scaled by bi
  // so the motion fades out completely when the gameplay camera is active.
  const t = millis() * 0.001; // seconds
  const swayY = bi * (0.022 * Math.sin(t * 1.3) + 0.010 * Math.sin(t * 2.1));
  const swayR = bi *  0.04  * Math.sin(t * 0.7);   // subtle in/out drift
  const swayA = bi *  0.006 * Math.sin(t * 0.45);  // micro angular wander

  // ── Camera position ───────────────────────────────────────────────────────

  // Portrait: close, fixed height slightly below the face (camera looks up a
  // little — flattering).  No pitch-arm formula, just a direct world height.
  const aspect   = width / height;
  const gameDist = cfg.distance * Math.max(1, Math.sqrt(1 / aspect));
  const dist     = (INTRO_DIST + swayR) * bi + gameDist * b;

  const introY = pp.y + INTRO_CAM_Y;
  const gameY  = pp.y + gameDist * sinPitch + cfg.height;
  const camY   = introY * bi + gameY * b + swayY;

  const camX = pp.x + sin(arcAngle + swayA) * dist * cosPitch;
  const camZ = pp.z + cos(arcAngle + swayA) * dist * cosPitch;

  // ── Rig smooth ────────────────────────────────────────────────────────────
  // In intro mode the portrait tracks the player instantly (s=1 = snap) so
  // there is no "drift into position" on load or after idle.  Gameplay uses
  // the normal SMOOTH lerp for a floaty follow feel.  The first frame always
  // snaps regardless.
  const s  = !cameraRig.initialized ? 1 : (bi * 1.0 + b * SMOOTH);
  const si = 1 - s;
  cameraRig.eyeX        = cameraRig.eyeX * si + camX * s;
  cameraRig.eyeY        = cameraRig.eyeY * si + camY * s;
  cameraRig.eyeZ        = cameraRig.eyeZ * si + camZ * s;
  cameraRig.initialized = true;

  // Expose world-space eye position for RenderSystem sprite facing
  if (!cameraRig.camPosWorld)
    cameraRig.camPosWorld = createVector(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);
  else
    cameraRig.camPosWorld.set(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);

  // ── LookAt Y and FOV ─────────────────────────────────────────────────────
  // Portrait aims at the face; gameplay aims at the chest (existing offset).
  const lookAtY = INTRO_LOOK_Y * bi + cfg.lookAtYOffset * b;
  const fov     = INTRO_FOV    * bi + GAME_FOV           * b;

  const eye    = worldToP5(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);
  const lookAt = worldToP5(pp.x, pp.y + lookAtY, pp.z);

  perspective(fov, width / height, 10, 50000);
  camera(eye.x, eye.y, eye.z, lookAt.x, lookAt.y, lookAt.z, 0, 1, 0);
};
