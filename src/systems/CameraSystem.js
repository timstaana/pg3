// CameraSystem.js - Mario 64 style orbit camera

// Helper: Convert world coordinates to p5 coordinates (negate Y, scale)
function worldToP5Camera(worldPos) {
  return {
    x: worldPos.x * WORLD_SCALE,
    y: -worldPos.y * WORLD_SCALE, // Negate Y to flip from Y-up to Y-down
    z: worldPos.z * WORLD_SCALE
  };
}

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

  // Calculate camera position from orbit parameters
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

  // Convert to p5 units for rendering (with Y negation)
  const camPos = worldToP5Camera(camPosWorld);
  const lookAt = worldToP5Camera(lookAtWorld);

  // Set p5 camera (up vector negated to match flipped Y)
  camera(
    camPos.x, camPos.y, camPos.z,
    lookAt.x, lookAt.y, lookAt.z,
    0, 1, 0
  );
}
