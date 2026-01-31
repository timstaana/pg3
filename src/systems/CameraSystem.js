// CameraSystem.js - Mario 64 style orbit camera with Y-up coordinates

// Camera rig state
const cameraRig = {
  yaw: 0,
  pitch: 30,
  distance: 8.0,
  height: 2.0,
  targetPos: null,
  currentPos: null,
  smoothSpeed: 8.0,
  // Current camera transform (updated each frame)
  camPosWorld: null,
  lookAtWorld: null,
  initialized: false
};

function CameraSystem(world, dt) {
  const players = queryEntities(world, 'Player', 'Transform');

  if (players.length === 0) return;

  const player = players[0];
  const playerPos = player.Transform.pos;

  // Initialize camera rig vectors on first run
  if (!cameraRig.initialized) {
    cameraRig.targetPos = createVector(0, 0, 0);
    cameraRig.currentPos = createVector(0, 0, 0);
    cameraRig.camPosWorld = createVector(0, 0, 0);
    cameraRig.lookAtWorld = createVector(0, 0, 0);
    cameraRig.initialized = true;
  }

  // Update target position (smooth follow)
  cameraRig.targetPos = playerPos.copy();

  // Lerp current position towards target
  cameraRig.currentPos = p5.Vector.lerp(
    cameraRig.currentPos,
    cameraRig.targetPos,
    Math.min(1.0, cameraRig.smoothSpeed * dt)
  );

  // Calculate camera position from orbit parameters (Y-up coordinates)
  const yawRad = radians(cameraRig.yaw);
  const pitchRad = radians(cameraRig.pitch);

  const offsetX = Math.sin(yawRad) * Math.cos(pitchRad) * cameraRig.distance;
  const offsetY = Math.sin(pitchRad) * cameraRig.distance + cameraRig.height;
  const offsetZ = Math.cos(yawRad) * Math.cos(pitchRad) * cameraRig.distance;

  const camPosWorld = p5.Vector.add(cameraRig.currentPos, createVector(offsetX, offsetY, offsetZ));
  const lookAtWorld = p5.Vector.add(cameraRig.currentPos, createVector(0, cameraRig.height * 0.5, 0));

  // Store for other systems to access
  cameraRig.camPosWorld = camPosWorld.copy();
  cameraRig.lookAtWorld = lookAtWorld.copy();

  // Set p5 camera with Y-flip to convert from Y-up to Y-down
  const camX = camPosWorld.x * WORLD_SCALE;
  const camY = -camPosWorld.y * WORLD_SCALE; // Flip Y
  const camZ = camPosWorld.z * WORLD_SCALE;

  const lookX = lookAtWorld.x * WORLD_SCALE;
  const lookY = -lookAtWorld.y * WORLD_SCALE; // Flip Y
  const lookZ = lookAtWorld.z * WORLD_SCALE;

  // Set p5 camera (up vector is positive Y in p5's Y-down space)
  camera(
    camX, camY, camZ,
    lookX, lookY, lookZ,
    0, 1, 0
  );
}
