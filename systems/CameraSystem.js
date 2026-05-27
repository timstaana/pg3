// CameraSystem.js — Simple third-person follow camera
//
// Eye position is smoothed (SMOOTH lerp) to avoid jitter.
// LookAt snaps directly to player so there's no lag in where the camera points.
// Camera distance scales with screen aspect ratio so the character stays
// roughly the same visual size on portrait (mobile) vs landscape screens.

const SMOOTH = 0.12;

const cameraRig = {
  eyeX: 0, eyeY: 0, eyeZ: 0,
  initialized: false,
  camPosWorld: null,  // p5.Vector — read by RenderSystem for sprite facing
};

const worldToP5 = (x, y, z) => createVector(
  x *  WORLD_SCALE,
  y * -WORLD_SCALE,
  z *  WORLD_SCALE
);

const CameraSystem = (world) => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return;

  const { Transform: { pos: pp, rot } } = players[0];
  const cfg = CAMERA_CONFIG;

  // Portrait screens show less horizontal content, so pull back proportionally.
  // sqrt keeps the scale change gentle: a 9:16 phone gives ~1.33× distance.
  const aspect = width / height;
  const dist   = cfg.distance * Math.max(1, Math.sqrt(1 / aspect));

  const yawRad   = radians(-rot.y);
  const pitchRad = radians(cfg.pitch);
  const cosPitch = cos(pitchRad);
  const sinPitch = sin(pitchRad);

  // Desired eye position: behind and above the player along the boom arm
  const camX = pp.x - sin(yawRad) * dist * cosPitch;
  const camY = pp.y + dist * sinPitch + cfg.height;
  const camZ = pp.z - cos(yawRad) * dist * cosPitch;

  // Smooth eye, snap lookAt — no lag in where the camera points
  if (!cameraRig.initialized) {
    cameraRig.eyeX       = camX;
    cameraRig.eyeY       = camY;
    cameraRig.eyeZ       = camZ;
    cameraRig.initialized = true;
  } else {
    const s = SMOOTH, si = 1 - s;
    cameraRig.eyeX = cameraRig.eyeX * si + camX * s;
    cameraRig.eyeY = cameraRig.eyeY * si + camY * s;
    cameraRig.eyeZ = cameraRig.eyeZ * si + camZ * s;
  }

  // Update world-space eye position used by RenderSystem sprite facing
  if (!cameraRig.camPosWorld)
    cameraRig.camPosWorld = createVector(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);
  else
    cameraRig.camPosWorld.set(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);

  const eye    = worldToP5(cameraRig.eyeX, cameraRig.eyeY, cameraRig.eyeZ);
  const lookAt = worldToP5(pp.x, pp.y + cfg.lookAtYOffset, pp.z);

  // Explicit perspective so near/far clip planes don't shift with window size.
  // Units are p5-space (world × WORLD_SCALE=50): near=10→0.2wu, far=50000→1000wu.
  perspective(PI / 3, width / height, 10, 50000);
  camera(eye.x, eye.y, eye.z, lookAt.x, lookAt.y, lookAt.z, 0, 1, 0);
};
