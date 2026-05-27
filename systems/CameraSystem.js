// CameraSystem.js — Third-person boom-arm camera with obstacle avoidance
//
// Optimisation: obstacle proximity uses squared distance (no sqrt / no p5.Vector.dist alloc).

const SMOOTH       = 0.12;
const SMOOTH_INV   = 1 - SMOOTH; // lerp complement, precomputed

const cameraRig = {
  eye:         null,
  center:      null,
  initialized: false,
  camPosWorld: null,
  lookAtWorld: null,
};

const worldToP5 = (pos) => createVector(
  pos.x *  WORLD_SCALE,
  pos.y * -WORLD_SCALE,
  pos.z *  WORLD_SCALE
);

// Returns the distance along the ray where geometry comes within checkRadius,
// or null if the arm is clear.
const raycastObstacle = (from, to, collisionWorld, checkRadius) => {
  const dir     = p5.Vector.sub(to, from);
  const maxDist = dir.mag();
  if (maxDist < 0.001) return null;
  dir.normalize();

  // Broad-phase AABB filter — avoids testing distant triangles
  const pad    = checkRadius;
  const rayMin = createVector(Math.min(from.x, to.x) - pad, Math.min(from.y, to.y) - pad, Math.min(from.z, to.z) - pad);
  const rayMax = createVector(Math.max(from.x, to.x) + pad, Math.max(from.y, to.y) + pad, Math.max(from.z, to.z) + pad);

  const candidates = collisionWorld.tris.filter(({ aabb }) =>
    !(aabb.maxX < rayMin.x || aabb.minX > rayMax.x ||
      aabb.maxY < rayMin.y || aabb.minY > rayMax.y ||
      aabb.maxZ < rayMin.z || aabb.minZ > rayMax.z)
  );

  const steps         = Math.min(8, Math.ceil(maxDist * 1.5));
  const checkRadiusSq = checkRadius * checkRadius; // hoist outside inner loop
  const pt            = createVector(0, 0, 0);     // reused scratch vector

  for (const tri of candidates) {
    for (let i = 0; i <= steps; i++) {
      const offset = maxDist * (i / steps);
      pt.x = from.x + dir.x * offset;
      pt.y = from.y + dir.y * offset;
      pt.z = from.z + dir.z * offset;

      const cl = closestPointOnTriangle(pt, tri.a, tri.b, tri.c);

      // Inlined squared-distance check — avoids sqrt and p5.Vector.dist alloc
      const dx = pt.x - cl.x, dy = pt.y - cl.y, dz = pt.z - cl.z;
      if (dx*dx + dy*dy + dz*dz < checkRadiusSq) {
        return { hit: true, distance: offset };
      }
    }
  }

  return null;
};

const CameraSystem = (world, collisionWorld) => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return;

  const { Transform: { pos: pp, rot } } = players[0];
  const cfg      = CAMERA_CONFIG;
  const yawRad   = radians(-rot.y);
  const pitchRad = radians(cfg.pitch);
  const cosPitch = cos(pitchRad);
  const sinPitch = sin(pitchRad);
  const hDist    = cfg.distance * cosPitch;
  const vOff     = cfg.distance * sinPitch + cfg.height;

  // Desired camera position
  let camX = pp.x - sin(yawRad) * hDist;
  let camY = pp.y + vOff;
  let camZ = pp.z - cos(yawRad) * hDist;

  // Retract arm if geometry blocks it
  const pivot = createVector(pp.x, pp.y + cfg.lookAtYOffset, pp.z);
  const obs   = raycastObstacle(pivot, createVector(camX, camY, camZ), collisionWorld, 0.5);

  if (obs && obs.hit) {
    const d  = Math.max(cfg.minDistance, obs.distance * 0.9);
    camX = pp.x - sin(yawRad) * d * cosPitch;
    camY = pp.y + d * sinPitch + cfg.height;
    camZ = pp.z - cos(yawRad) * d * cosPitch;
  }

  const lookX = pp.x;
  const lookY = pp.y + cfg.lookAtYOffset;
  const lookZ = pp.z;

  if (!cameraRig.initialized) {
    cameraRig.eye    = { x: camX,  y: camY,  z: camZ  };
    cameraRig.center = { x: lookX, y: lookY, z: lookZ };
    cameraRig.initialized = true;
  } else {
    cameraRig.eye.x    = cameraRig.eye.x    * SMOOTH_INV + camX  * SMOOTH;
    cameraRig.eye.y    = cameraRig.eye.y    * SMOOTH_INV + camY  * SMOOTH;
    cameraRig.eye.z    = cameraRig.eye.z    * SMOOTH_INV + camZ  * SMOOTH;
    cameraRig.center.x = cameraRig.center.x * SMOOTH_INV + lookX * SMOOTH;
    cameraRig.center.y = cameraRig.center.y * SMOOTH_INV + lookY * SMOOTH;
    cameraRig.center.z = cameraRig.center.z * SMOOTH_INV + lookZ * SMOOTH;
  }

  cameraRig.camPosWorld = createVector(cameraRig.eye.x,    cameraRig.eye.y,    cameraRig.eye.z);
  cameraRig.lookAtWorld = createVector(cameraRig.center.x, cameraRig.center.y, cameraRig.center.z);

  const eye    = worldToP5(cameraRig.camPosWorld);
  const center = worldToP5(cameraRig.lookAtWorld);
  camera(eye.x, eye.y, eye.z, center.x, center.y, center.z, 0, 1, 0);
};
