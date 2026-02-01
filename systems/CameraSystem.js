// CameraSystem.js - Third-person camera with collision avoidance

const SMOOTH = 0.12;

const cameraRig = {
  distance: 5.0,         // Boom arm length
  minDistance: 2.0,      // Minimum distance when blocked
  height: 1.5,           // Camera height above player
  pitch: 10,             // Downward angle in degrees (like Lakitu looking down at Mario)
  lookAtYOffset: 1.2,    // Look at player's upper body
  eye: null,
  center: null,
  initialized: false
};

const worldToP5 = (pos) => createVector(
  pos.x * WORLD_SCALE,
  -pos.y * WORLD_SCALE,
  pos.z * WORLD_SCALE
);

// Raycast to check for obstacles between two points (optimized)
const raycastObstacle = (from, to, collisionWorld, checkRadius = 0.3) => {
  const dir = p5.Vector.sub(to, from);
  const maxDist = dir.mag();

  if (maxDist < 0.001) return null;

  dir.normalize();

  // Use AABB to quickly filter triangles near the ray
  const rayMin = createVector(
    Math.min(from.x, to.x) - checkRadius,
    Math.min(from.y, to.y) - checkRadius,
    Math.min(from.z, to.z) - checkRadius
  );
  const rayMax = createVector(
    Math.max(from.x, to.x) + checkRadius,
    Math.max(from.y, to.y) + checkRadius,
    Math.max(from.z, to.z) + checkRadius
  );

  // Only check triangles that overlap the ray bounding box
  const candidates = collisionWorld.tris.filter(tri => {
    const aabb = tri.aabb;
    return !(aabb.maxX < rayMin.x || aabb.minX > rayMax.x ||
             aabb.maxY < rayMin.y || aabb.minY > rayMax.y ||
             aabb.maxZ < rayMin.z || aabb.minZ > rayMax.z);
  });

  // Reduce samples for better performance
  const steps = Math.min(8, Math.ceil(maxDist * 1.5));

  // Reuse point vector to avoid allocations in hot loop
  const point = createVector(0, 0, 0);

  for (const tri of candidates) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const offset = maxDist * t;

      // Optimize: reuse point vector instead of allocating new one
      point.x = from.x + dir.x * offset;
      point.y = from.y + dir.y * offset;
      point.z = from.z + dir.z * offset;

      const closest = closestPointOnTriangle(point, tri.a, tri.b, tri.c);
      const dist = p5.Vector.dist(point, closest);

      if (dist < checkRadius) {
        return {
          hit: true,
          distance: offset
        };
      }
    }
  }

  return null;
};

// Check for obstacles above the player (optimized)
const checkOverhead = (playerPos, collisionWorld, checkHeight = 2.5, checkRadius = 1.0) => {
  // Use AABB to filter candidates quickly
  const candidates = collisionWorld.tris.filter(tri => {
    // Only check ceiling-like triangles
    const isCeiling = tri.normal.y < -0.1 || tri.normal.y > 0.5;
    if (!isCeiling) return false;

    // Quick AABB check using precomputed bounds
    const aabb = tri.aabb;
    if (aabb.maxY < playerPos.y || aabb.minY > playerPos.y + checkHeight) return false;

    // Check horizontal overlap
    return !(aabb.maxX < playerPos.x - checkRadius || aabb.minX > playerPos.x + checkRadius ||
             aabb.maxZ < playerPos.z - checkRadius || aabb.minZ > playerPos.z + checkRadius);
  });

  // Early exit if no candidates
  if (candidates.length === 0) return false;

  const topY = playerPos.y + checkHeight;

  // Reduce samples for better performance
  const steps = 4;
  // Reuse point vector to avoid allocations
  const point = createVector(playerPos.x, playerPos.y, playerPos.z);

  for (const tri of candidates) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Optimize: calculate lerp manually to reuse vector
      point.y = playerPos.y + (topY - playerPos.y) * t;

      const closest = closestPointOnTriangle(point, tri.a, tri.b, tri.c);
      const distToTri = p5.Vector.dist(point, closest);

      if (distToTri < checkRadius) {
        return true;
      }
    }
  }

  return false;
};

const CameraSystem = (world, collisionWorld, dt) => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return;

  const player = players[0];
  const playerPos = player.Transform.pos;
  const playerYaw = player.Transform.rot.y;

  // Mario 64 style: Camera on a boom arm behind player
  // Boom arm extends backward from player's facing direction
  const yawRad = radians(-playerYaw);
  const pitchRad = radians(cameraRig.pitch);

  // Calculate boom arm position (distance back, height up, with pitch angle)
  const horizontalDist = cameraRig.distance * cos(pitchRad);
  const verticalOffset = cameraRig.distance * sin(pitchRad) + cameraRig.height;

  // Desired camera position: behind and above player
  const desiredX = playerPos.x - sin(yawRad) * horizontalDist;
  const desiredY = playerPos.y + verticalOffset;
  const desiredZ = playerPos.z - cos(yawRad) * horizontalDist;

  // Raycast from player to camera to check for obstacles
  const playerCenter = createVector(playerPos.x, playerPos.y + cameraRig.lookAtYOffset, playerPos.z);
  const desiredCamPos = createVector(desiredX, desiredY, desiredZ);
  const obstacle = raycastObstacle(playerCenter, desiredCamPos, collisionWorld, 0.5);

  // If blocked, pull camera closer (shorten boom arm)
  let finalX = desiredX;
  let finalY = desiredY;
  let finalZ = desiredZ;

  if (obstacle && obstacle.hit) {
    const blockedDist = obstacle.distance * 0.9; // Pull slightly in front of obstacle
    const adjustedDist = Math.max(cameraRig.minDistance, blockedDist);
    const ratio = adjustedDist / cameraRig.distance;

    finalX = playerPos.x - sin(yawRad) * horizontalDist * ratio;
    finalY = playerPos.y + verticalOffset * ratio;
    finalZ = playerPos.z - cos(yawRad) * horizontalDist * ratio;
  }

  // Look-at point: slightly above player's position
  const lookAtX = playerPos.x;
  const lookAtY = playerPos.y + cameraRig.lookAtYOffset;
  const lookAtZ = playerPos.z;

  // Smooth camera movement (Lakitu lag)
  if (!cameraRig.initialized) {
    cameraRig.eye = { x: finalX, y: finalY, z: finalZ };
    cameraRig.center = { x: lookAtX, y: lookAtY, z: lookAtZ };
    cameraRig.initialized = true;
  } else {
    cameraRig.eye.x = lerp(cameraRig.eye.x, finalX, SMOOTH);
    cameraRig.eye.y = lerp(cameraRig.eye.y, finalY, SMOOTH);
    cameraRig.eye.z = lerp(cameraRig.eye.z, finalZ, SMOOTH);
    cameraRig.center.x = lerp(cameraRig.center.x, lookAtX, SMOOTH);
    cameraRig.center.y = lerp(cameraRig.center.y, lookAtY, SMOOTH);
    cameraRig.center.z = lerp(cameraRig.center.z, lookAtZ, SMOOTH);
  }

  // Store for use by other systems
  cameraRig.camPosWorld = createVector(cameraRig.eye.x, cameraRig.eye.y, cameraRig.eye.z);
  cameraRig.lookAtWorld = createVector(cameraRig.center.x, cameraRig.center.y, cameraRig.center.z);

  // Apply to p5 camera
  const eyeP5 = worldToP5(cameraRig.camPosWorld);
  const centerP5 = worldToP5(cameraRig.lookAtWorld);

  camera(
    eyeP5.x, eyeP5.y, eyeP5.z,
    centerP5.x, centerP5.y, centerP5.z,
    0, 1, 0
  );
};
