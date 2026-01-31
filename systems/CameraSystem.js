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

// Raycast to check for obstacles between two points
const raycastObstacle = (from, to, collisionWorld, checkRadius = 0.3) => {
  const dir = p5.Vector.sub(to, from);
  const maxDist = dir.mag();

  if (maxDist < 0.001) return null;

  dir.normalize();

  // Check collision triangles along the ray
  for (const tri of collisionWorld.tris) {
    // Skip if triangle is too far from ray path
    const midPoint = p5.Vector.add(from, p5.Vector.mult(dir, maxDist * 0.5));
    const triCenter = p5.Vector.add(tri.a, p5.Vector.add(tri.b, tri.c)).div(3);
    if (p5.Vector.dist(midPoint, triCenter) > maxDist + 2) continue;

    // Sample points along the ray
    const steps = Math.ceil(maxDist * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = p5.Vector.add(from, p5.Vector.mult(dir, maxDist * t));

      // Check if point is close to triangle
      const closest = closestPointOnTriangle(point, tri.a, tri.b, tri.c);
      const dist = p5.Vector.dist(point, closest);

      if (dist < checkRadius) {
        return {
          hit: true,
          distance: maxDist * t
        };
      }
    }
  }

  return null;
};

// Check for obstacles above the player
const checkOverhead = (playerPos, collisionWorld, checkHeight = 2.5, checkRadius = 1.0) => {
  const topPoint = createVector(playerPos.x, playerPos.y + checkHeight, playerPos.z);

  for (const tri of collisionWorld.tris) {
    // Check for ceiling triangles
    // Note: Ceiling normals may be flipped upward during preprocessing
    // So we check for both upward (flipped) and downward facing triangles
    const isCeiling = tri.normal.y < -0.1 || tri.normal.y > 0.5;
    if (!isCeiling) continue;

    // Quick AABB check - is triangle in the vertical column above player?
    const triMinY = Math.min(tri.a.y, tri.b.y, tri.c.y);
    const triMaxY = Math.max(tri.a.y, tri.b.y, tri.c.y);

    if (triMaxY < playerPos.y || triMinY > playerPos.y + checkHeight) continue;

    // Check horizontal distance to triangle
    const triCenter = p5.Vector.add(tri.a, p5.Vector.add(tri.b, tri.c)).div(3);
    const horizontalDist = dist(playerPos.x, playerPos.z, triCenter.x, triCenter.z);
    if (horizontalDist > checkRadius + 3) continue;

    // Sample vertical ray above player
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const point = p5.Vector.lerp(playerPos, topPoint, t);

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
