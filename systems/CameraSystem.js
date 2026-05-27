// CameraSystem.js — Third-person camera with portrait intro / idle / skin modes
//
// Three camera configurations:
//   INTRO    — portrait close-up facing the player's front (start + idle)
//   GAMEPLAY — third-person behind the player
//   SKIN     — full-body front shot while skin panel is open (uiState.skinPreview)
//
// cameraBlend (0=intro, 1=gameplay) drives the intro↔gameplay arc.
// skinBlend   (0=off,   1=skin)    overlays the skin preview on top.
//
// Arc rule: arcAngle = yawRad + cameraBlend * PI — always swings around the
// outside of the player, never cuts through.

const SMOOTH         = 0.12;
const IDLE_TIMEOUT   = 30;           // seconds
const BLEND_TO_GAME  = 0.08;
const BLEND_TO_INTRO = 0.04;

// ── Portrait (intro) params ───────────────────────────────────────────────────
const INTRO_DIST   = 2.2;
const INTRO_CAM_Y  = 0.55;
const INTRO_LOOK_Y = 0.95;
const INTRO_FOV    = Math.PI / 4.2;
const GAME_FOV     = Math.PI / 3;

// ── Skin preview params ───────────────────────────────────────────────────────
// Full-body, face-on, horizontal camera.
const SKIN_DIST    = 3.0;    // world units in front of player
const SKIN_CAM_Y   = 0.35;   // body centre height (sprite spans −0.4 → +1.1)
const SKIN_LOOK_Y  = 0.35;   // look at body centre
const SKIN_FOV     = Math.PI / 3;
const SKIN_BLEND   = 0.12;   // blend rate in/out

// ── Module state ──────────────────────────────────────────────────────────────

let cameraMode  = 'intro';
let idleTimer   = 0;
let cameraBlend = 0;   // 0 = intro, 1 = gameplay
let skinBlend   = 0;   // 0 = off,   1 = skin preview active

const cameraRig = {
  eyeX: 0, eyeY: 0, eyeZ: 0,
  initialized: false,
  camPosWorld: null,
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

  // ── Skin preview blend (independent layer, evaluated first) ───────────────
  const wantSkin = typeof uiState !== 'undefined' && uiState.skinPreview;
  skinBlend += ((wantSkin ? 1 : 0) - skinBlend) * SKIN_BLEND;

  // ── Idle / mode detection (paused while skin panel is open) ───────────────
  if (!wantSkin) {
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
  }

  // ── Intro ↔ Gameplay blend ────────────────────────────────────────────────
  const blendTarget = cameraMode === 'gameplay' ? 1 : 0;
  const blendRate   = cameraMode === 'gameplay' ? BLEND_TO_GAME : BLEND_TO_INTRO;
  cameraBlend      += (blendTarget - cameraBlend) * blendRate;

  const b  = cameraBlend;
  const bi = 1 - b;

  // ── Arc angle: sweeps around the outside of the player ───────────────────
  const yawRad  = radians(-rot.y);
  const arcAngle = yawRad + b * PI;

  // ── Shared pitch params ───────────────────────────────────────────────────
  const pitchRad = radians(cfg.pitch);
  const cosPitch = cos(pitchRad);
  const sinPitch = sin(pitchRad);

  // ── Idle sway (scales to zero in gameplay and skin modes) ─────────────────
  const ts    = millis() * 0.001;
  const swayScale = bi * (1 - skinBlend);   // only in intro, not skin
  const swayY = swayScale * (0.022 * Math.sin(ts * 1.3) + 0.010 * Math.sin(ts * 2.1));
  const swayR = swayScale *  0.04  * Math.sin(ts * 0.7);
  const swayA = swayScale *  0.006 * Math.sin(ts * 0.45);

  // ── Normal camera target (intro ↔ gameplay arc) ───────────────────────────
  const aspect   = width / height;
  const gameDist = cfg.distance * Math.max(1, Math.sqrt(1 / aspect));
  const dist     = (INTRO_DIST + swayR) * bi + gameDist * b;

  const introY = pp.y + INTRO_CAM_Y;
  const gameY  = pp.y + gameDist * sinPitch + cfg.height;

  const normalX = pp.x + sin(arcAngle + swayA) * dist * cosPitch;
  const normalY = introY * bi + gameY * b + swayY;
  const normalZ = pp.z + cos(arcAngle + swayA) * dist * cosPitch;

  // ── Skin preview target (full-body, face-on, horizontal) ──────────────────
  // Camera sits in front of the player at body-centre height, looking straight
  // across — wide enough to see feet-to-head with comfortable margins.
  const skinX = pp.x + sin(yawRad) * SKIN_DIST;
  const skinY = pp.y + SKIN_CAM_Y;
  const skinZ = pp.z + cos(yawRad) * SKIN_DIST;

  // ── Blend skin preview over normal target ─────────────────────────────────
  const sb  = skinBlend;
  const sbi = 1 - sb;
  const camX = normalX * sbi + skinX * sb;
  const camY = normalY * sbi + skinY * sb;
  const camZ = normalZ * sbi + skinZ * sb;

  // ── Rig smooth ────────────────────────────────────────────────────────────
  // Intro: instant tracking (no drift-in).  Gameplay: SMOOTH.  Skin: SMOOTH
  // (camera moves to skin position, not teleports).
  const s  = !cameraRig.initialized ? 1
           : sb > 0.01              ? SMOOTH            // skin transition
           :                          bi * 1.0 + b * SMOOTH;
  const si = 1 - s;
  cameraRig.eyeX        = cameraRig.eyeX * si + camX * s;
  cameraRig.eyeY        = cameraRig.eyeY * si + camY * s;
  cameraRig.eyeZ        = cameraRig.eyeZ * si + camZ * s;
  cameraRig.initialized = true;

  if (!cameraRig.camPosWorld)
    cameraRig.camPosWorld = createVector(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);
  else
    cameraRig.camPosWorld.set(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);

  // ── LookAt Y and FOV (blend across all three modes) ──────────────────────
  const normalLookY = INTRO_LOOK_Y * bi + cfg.lookAtYOffset * b;
  const lookAtY     = normalLookY  * sbi + SKIN_LOOK_Y * sb;

  const normalFOV = INTRO_FOV * bi + GAME_FOV * b;
  const fov       = normalFOV * sbi + SKIN_FOV * sb;

  const eye    = worldToP5(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);
  const lookAt = worldToP5(pp.x, pp.y + lookAtY, pp.z);

  perspective(fov, width / height, 10, 50000);
  camera(eye.x, eye.y, eye.z, lookAt.x, lookAt.y, lookAt.z, 0, 1, 0);

};
