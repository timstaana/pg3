// CameraSystem.js - Mario 64 style orbit camera

// Camera rig state
const cameraRig = {
  yaw: 0,
  pitch: 30,
  distance: 8.0,
  height: 2.0,
  targetPos: vec3(0, 0, 0),
  currentPos: vec3(0, 0, 0),
  smoothSpeed: 8.0
};

function CameraSystem(world, dt) {
  const players = queryEntities(world, 'Player', 'Transform');

  if (players.length === 0) return;

  const player = players[0];
  const playerPos = player.Transform.pos;

  // Update target position (smooth follow)
  cameraRig.targetPos = vec3Copy(playerPos);

  // Lerp current position towards target
  cameraRig.currentPos = vec3Lerp(
    cameraRig.currentPos,
    cameraRig.targetPos,
    Math.min(1.0, cameraRig.smoothSpeed * dt)
  );

  // Calculate camera position from orbit parameters
  const yawRad = degToRad(cameraRig.yaw);
  const pitchRad = degToRad(cameraRig.pitch);

  const offsetX = Math.sin(yawRad) * Math.cos(pitchRad) * cameraRig.distance;
  const offsetY = Math.sin(pitchRad) * cameraRig.distance + cameraRig.height;
  const offsetZ = Math.cos(yawRad) * Math.cos(pitchRad) * cameraRig.distance;

  const camPosWorld = vec3Add(cameraRig.currentPos, vec3(offsetX, offsetY, offsetZ));
  const lookAtWorld = vec3Add(cameraRig.currentPos, vec3(0, cameraRig.height * 0.5, 0));

  // Convert to p5 units for rendering
  const camPos = vec3Mul(camPosWorld, WORLD_SCALE);
  const lookAt = vec3Mul(lookAtWorld, WORLD_SCALE);

  // Set p5 camera -1 y to flip vertically
  camera(
    camPos.x, camPos.y, camPos.z,
    lookAt.x, lookAt.y, lookAt.z,
    0, -1, 0
  );
}
