// CameraSystem.js

const cameraRig = {
  yaw: 0,
  pitch: 30,
  distance: 8.0,
  height: 2.0,
  targetPos: null,
  currentPos: null,
  smoothSpeed: 8.0,
  camPosWorld: null,
  lookAtWorld: null,
  initialized: false
};

const initializeCameraRig = () => {
  cameraRig.targetPos = createVector(0, 0, 0);
  cameraRig.currentPos = createVector(0, 0, 0);
  cameraRig.camPosWorld = createVector(0, 0, 0);
  cameraRig.lookAtWorld = createVector(0, 0, 0);
  cameraRig.initialized = true;
};

const calculateCameraOffset = (yaw, pitch, distance, height) => {
  const yawRad = radians(yaw);
  const pitchRad = radians(pitch);

  return createVector(
    sin(yawRad) * cos(pitchRad) * distance,
    sin(pitchRad) * distance + height,
    cos(yawRad) * cos(pitchRad) * distance
  );
};

const worldToP5 = (pos) => createVector(
  pos.x * WORLD_SCALE,
  -pos.y * WORLD_SCALE,
  pos.z * WORLD_SCALE
);

const CameraSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return;

  if (!cameraRig.initialized) initializeCameraRig();

  const playerPos = players[0].Transform.pos;
  cameraRig.targetPos = playerPos.copy();

  cameraRig.currentPos = p5.Vector.lerp(
    cameraRig.currentPos,
    cameraRig.targetPos,
    constrain(cameraRig.smoothSpeed * dt, 0, 1)
  );

  const offset = calculateCameraOffset(
    cameraRig.yaw,
    cameraRig.pitch,
    cameraRig.distance,
    cameraRig.height
  );

  cameraRig.camPosWorld = p5.Vector.add(cameraRig.currentPos, offset);
  cameraRig.lookAtWorld = p5.Vector.add(
    cameraRig.currentPos,
    createVector(0, cameraRig.height * 0.5, 0)
  );

  const camP5 = worldToP5(cameraRig.camPosWorld);
  const lookP5 = worldToP5(cameraRig.lookAtWorld);

  camera(
    camP5.x, camP5.y, camP5.z,
    lookP5.x, lookP5.y, lookP5.z,
    0, 1, 0
  );
};
