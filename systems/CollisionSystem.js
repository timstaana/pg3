// CollisionSystem.js — Sphere-triangle collision with slope walking
//
// Optimisations vs original:
//  · Backface-cull dot product inlined (no p5.Vector.sub allocation)
//  · pos push inlined (no p5.Vector.mult allocation)
//  · vel projection inlined (no p5.Vector.mult allocation)
//  · Vertex proximity: squared distance, no sqrt, no vector alloc
//  · Edge proximity: zero-alloc squared-distance helper replaces distanceToLineSegment
//  · Inner triangle loop uses for…of (avoids forEach closure allocation)

const MAX_ITERATIONS = 3;

// Squared distance from point (px,py,pz) to segment [a, b] — no allocations
const _distSqToSeg = (px, py, pz, a, b) => {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
  const ab2 = abx*abx + aby*aby + abz*abz;
  const t   = ab2 < 1e-10 ? 0 : Math.max(0, Math.min(1, (apx*abx + apy*aby + apz*abz) / ab2));
  const ex  = apx - abx*t, ey = apy - aby*t, ez = apz - abz*t;
  return ex*ex + ey*ey + ez*ez;
};

const CollisionSystem = (world, collisionWorld, dt) => {
  const players = queryEntities(world, 'Player', 'Transform', 'Velocity');

  for (const player of players) {
    const { Player: pd, Transform: { pos }, Velocity: { vel } } = player;
    const { radius } = pd;
    const edgeThreshSq = (radius * 0.3) ** 2;

    pd.grounded = false;

    const candidates = queryTrianglesNearPlayer(
      collisionWorld, pos, radius, COLLISION_CONFIG, vel
    );

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let bestGround      = null, bestGroundY    = -Infinity;
      let bestEdgeGround  = null, bestEdgeGroundY = -Infinity;
      let steepestSlope   = null, steepestSlopeY  = -Infinity;
      let hadCollision    = false;

      for (const tri of candidates) {
        // ── Backface culling (mesh tris only) — inlined, no vector alloc
        if (!tri.isBox) {
          const dx = pos.x - tri.a.x, dy = pos.y - tri.a.y, dz = pos.z - tri.a.z;
          if (dx*tri.normal.x + dy*tri.normal.y + dz*tri.normal.z <= 0) continue;
        }

        const contact = sphereVsTriangle(pos, radius + GROUNDING_TOLERANCE, tri);
        if (!contact) continue;

        if (contact.depth > GROUNDING_TOLERANCE) {
          hadCollision = true;
          const d = contact.depth - GROUNDING_TOLERANCE;
          // Inlined pos.add(contact.normal * d) — no p5.Vector.mult alloc
          pos.x += contact.normal.x * d;
          pos.y += contact.normal.y * d;
          pos.z += contact.normal.z * d;
        }

        if (contact.normal.y >= MIN_GROUND_NY) {
          // ── Edge/vertex proximity test — all squared distance, no sqrt, no alloc
          const cx = contact.point.x, cy = contact.point.y, cz = contact.point.z;

          const dAx = cx-tri.a.x, dAy = cy-tri.a.y, dAz = cz-tri.a.z;
          const dBx = cx-tri.b.x, dBy = cy-tri.b.y, dBz = cz-tri.b.z;
          const dCx = cx-tri.c.x, dCy = cy-tri.c.y, dCz = cz-tri.c.z;
          const nearVertex =
            dAx*dAx + dAy*dAy + dAz*dAz < edgeThreshSq ||
            dBx*dBx + dBy*dBy + dBz*dBz < edgeThreshSq ||
            dCx*dCx + dCy*dCy + dCz*dCz < edgeThreshSq;

          const nearEdge = !nearVertex && (
            _distSqToSeg(cx, cy, cz, tri.a, tri.b) < edgeThreshSq ||
            _distSqToSeg(cx, cy, cz, tri.b, tri.c) < edgeThreshSq ||
            _distSqToSeg(cx, cy, cz, tri.c, tri.a) < edgeThreshSq
          );

          if (!nearVertex && !nearEdge) {
            if (contact.point.y > bestGroundY)  { bestGround     = contact; bestGroundY     = contact.point.y; }
          } else {
            if (contact.point.y > bestEdgeGroundY) { bestEdgeGround = contact; bestEdgeGroundY = contact.point.y; }
          }
        } else {
          // ── Steep slope: slide — inlined vel projection, no alloc
          const dot = vel.dot(contact.normal);
          if (dot < 0) {
            vel.x -= contact.normal.x * dot;
            vel.y -= contact.normal.y * dot;
            vel.z -= contact.normal.z * dot;
          }
          if (contact.normal.y > 0.1 && contact.point.y > steepestSlopeY) {
            steepestSlope = contact; steepestSlopeY = contact.point.y;
          }
        }
      }

      const groundContact = bestGround || bestEdgeGround;

      if (groundContact) {
        pd.grounded     = true;
        pd.groundNormal = groundContact.normal.copy();
        pd.steepSlope   = null;

        if (!pd.smoothedGroundNormal) {
          pd.smoothedGroundNormal = groundContact.normal.copy();
        } else {
          pd.smoothedGroundNormal.lerp(groundContact.normal, 0.1);
          pd.smoothedGroundNormal.normalize();
        }

        // Inlined vel projection off ground normal — no alloc
        const dot = vel.dot(groundContact.normal);
        if (dot < 0) {
          vel.x -= groundContact.normal.x * dot;
          vel.y -= groundContact.normal.y * dot;
          vel.z -= groundContact.normal.z * dot;
        }
      } else if (steepestSlope) {
        pd.steepSlope           = steepestSlope.normal.copy();
        pd.smoothedGroundNormal = null;
      } else {
        pd.steepSlope           = null;
        pd.smoothedGroundNormal = null;
      }

      if (!hadCollision) break;
    }
  }
};
