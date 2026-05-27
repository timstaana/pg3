// CameraSystem.js - Third-person camera with collision avoidance (boom arm)

const SMOOTH = 0.12;

const cameraRig = {
  eye:         null,
  center:      null,
  initialized: false,
  camPosWorld: null,
  lookAtWorld: null
};

const worldToP5 = (pos) => createVector(
  pos.x *  WORLD_SCALE,
  pos.y * -WORLD_SCALE,
  pos.z *  WORLD_SCALE
);

// Sweep the boom arm toward the camera to detect obstructing geometry
const raycastObstacle = (from, to, collisionWorld, checkRadius = 0.3) => {
  const dir     = p5.Vector.sub(to, from);
  const maxDist = dir.mag();
  if (maxDist < 0.001) return null;
  dir.normalize();

  // Broad-phase: only test tris whose AABB overlaps the ray sweep
  const pad    = checkRadius;
  const rayMin = createVector(
    Math.min(from.x, to.x) - pad,
    Math.min(from.y, to.y) - pad,
    Math.min(from.z, to.z) - pad
  );
  const rayMax = createVector(
    Math.max(from.x, to.x) + pad,
    Math.max(from.y, to.y) + pad,
    Math.max(from.z, to.z) + pad
  );

  const candidates = collisionWorld.tris.filter(({ aabb }) =>
    !(aabb.maxX < rayMin.x || aabb.minX > rayMax.x ||
      aabb.maxY < rayMin.y || aabb.minY > rayMax.y ||
      aabb.maxZ < rayMin.z || aabb.minZ > rayMax.z)
  );

  const steps = Math.min(8, Math.ceil(maxDist * 1.5));
  const pt    = createVector(0, 0, 0);

  for (const tri of candidates) {
    for (let i = 0; i <= steps; i++) {
      const offset = maxDist * (i / steps);
      pt.x = from.x + dir.x * offset;
      pt.y = from.y + dir.y * offset;
      pt.z = from.z + dir.z * offset;

      const closest = closestPointOnTriangle(pt, tri.a, tri.b, tri.c);
      if (p5.Vector.dist(pt, closest) < checkRadius) {
        return { hit: true, distance: offset };
      }
    }
  }

  return null;
};

const CameraSystem = (world, collisionWorld) => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return;

  const { Transform: { pos: playerPos, rot } } = players[0];
  const cfg      = CAMERA_CONFIG;
  const yawRad   = radians(-rot.y);
  const pitchRad = radians(cfg.pitch);
  const hDist    = cfg.distance * cos(pitchRad);
  const vOff     = cfg.distance * sin(pitchRad) + cfg.height;

  // Desired boom-arm camera position
  let camX = playerPos.x - sin(yawRad) * hDist;
  let camY = playerPos.y + vOff;
  let camZ = playerPos.z - cos(yawRad) * hDist;

  // Pull camera in if wall blocks the arm
  const pivotPos = createVector(playerPos.x, playerPos.y + cfg.lookAtYOffset, playerPos.z);
  const obs      = raycastObstacle(pivotPos, createVector(camX, camY, camZ), collisionWorld, 0.5);

  if (obs && obs.hit) {
    const d    = Math.max(cfg.minDistance, obs.distance * 0.9);
    camX = playerPos.x - sin(yawRad) * d * cos(pitchRad);
    camY = playerPos.y + d * sin(pitchRad) + cfg.height;
    camZ = playerPos.z - cos(yawRad) * d * cos(pitchRad);
  }

  const lookX = playerPos.x;
  const lookY = playerPos.y + cfg.lookAtYOffset;
  const lookZ = playerPos.z;

  // Initialise instantly on first frame; smooth thereafter
  if (!cameraRig.initialized) {
    cameraRig.eye    = { x: camX,  y: camY,  z: camZ  };
    cameraRig.center = { x: lookX, y: lookY, z: lookZ };
    cameraRig.initialized = true;
  } else {
    cameraRig.eye.x = lerp(cameraRig.eye.x, camX,  SMOOTH);
    cameraRig.eye.y = lerp(cameraRig.eye.y, camY,  SMOOTH);
    cameraRig.eye.z = lerp(cameraRig.eye.z, camZ,  SMOOTH);
    cameraRig.center.x = lerp(cameraRig.center.x, lookX, SMOOTH);
    cameraRig.center.y = lerp(cameraRig.center.y, lookY, SMOOTH);
    cameraRig.center.z = lerp(cameraRig.center.z, lookZ, SMOOTH);
  }

  cameraRig.camPosWorld = createVector(cameraRig.eye.x,    cameraRig.eye.y,    cameraRig.eye.z);
  cameraRig.lookAtWorld = createVector(cameraRig.center.x, cameraRig.center.y, cameraRig.center.z);

  const eye    = worldToP5(cameraRig.camPosWorld);
  const center = worldToP5(cameraRig.lookAtWorld);

  camera(eye.x, eye.y, eye.z, center.x, center.y, center.z, 0, 1, 0);
};
