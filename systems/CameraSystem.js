// CameraSystem.js - Third-person camera with collision avoidance

const SMOOTH = 0.12;

const cameraRig = {
  distance: 8.0,
  minDistance: 1.5,
  height: 2.0,
  heightCrouch: 1.0,
  lookAtYOffset: 1.0,
  eye: null,
  center: null,
  currentDistance: 8.0,
  currentHeight: 2.0,
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
const checkOverhead = (playerPos, collisionWorld, checkHeight = 3.0, checkRadius = 0.5) => {
  const topPoint = createVector(playerPos.x, playerPos.y + checkHeight, playerPos.z);

  for (const tri of collisionWorld.tris) {
    // Only check downward-facing triangles (ceilings)
    if (tri.normal.y > -0.3) continue;

    // Check if triangle is roughly above player
    const triCenter = p5.Vector.add(tri.a, p5.Vector.add(tri.b, tri.c)).div(3);
    if (triCenter.y < playerPos.y || triCenter.y > playerPos.y + checkHeight) continue;

    const horizontalDist = dist(playerPos.x, playerPos.z, triCenter.x, triCenter.z);
    if (horizontalDist > checkRadius + 2) continue;

    // Sample vertical line
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
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
  const tgt = player.Transform.pos;
  const playerYaw = player.Transform.rot.y;

  // Check for overhead obstacles
  const hasOverhead = checkOverhead(tgt, collisionWorld);
  const targetHeight = hasOverhead ? cameraRig.heightCrouch : cameraRig.height;

  // Convert player yaw to radians (player's facing direction)
  const yawRad = radians(-playerYaw);
  const sinYaw = sin(yawRad);
  const cosYaw = cos(yawRad);

  // Calculate desired camera position behind player
  // Camera looks from behind the player in the direction they're facing
  let dx = tgt.x - sinYaw * cameraRig.distance;
  let dy = tgt.y + targetHeight;
  let dz = tgt.z - cosYaw * cameraRig.distance;

  // Raycast to check for obstacles
  const desiredCamPos = createVector(dx, dy, dz);
  const rayOrigin = createVector(tgt.x, tgt.y + targetHeight * 0.5, tgt.z);
  const obstacle = raycastObstacle(rayOrigin, desiredCamPos, collisionWorld);

  // Adjust distance if there's an obstacle
  let actualDistance = cameraRig.distance;
  if (obstacle && obstacle.hit) {
    actualDistance = Math.max(cameraRig.minDistance, obstacle.distance * 0.8);
    dx = tgt.x - sinYaw * actualDistance;
    dz = tgt.z - cosYaw * actualDistance;
  }

  // Smooth distance and height transitions
  cameraRig.currentDistance = lerp(cameraRig.currentDistance, actualDistance, SMOOTH);
  cameraRig.currentHeight = lerp(cameraRig.currentHeight, targetHeight, SMOOTH);

  // Initialize or smooth camera position
  if (!cameraRig.initialized) {
    cameraRig.eye = { x: dx, y: dy, z: dz };
    cameraRig.center = { x: tgt.x, y: tgt.y + cameraRig.lookAtYOffset, z: tgt.z };
    cameraRig.initialized = true;
  } else {
    cameraRig.eye.x = lerp(cameraRig.eye.x, dx, SMOOTH);
    cameraRig.eye.y = lerp(cameraRig.eye.y, dy, SMOOTH);
    cameraRig.eye.z = lerp(cameraRig.eye.z, dz, SMOOTH);
    cameraRig.center.x = lerp(cameraRig.center.x, tgt.x, SMOOTH);
    cameraRig.center.y = lerp(cameraRig.center.y, tgt.y + cameraRig.lookAtYOffset, SMOOTH);
    cameraRig.center.z = lerp(cameraRig.center.z, tgt.z, SMOOTH);
  }

  // Store for use by other systems (like text renderer)
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
