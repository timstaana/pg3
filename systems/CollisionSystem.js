// CollisionSystem.js - Sphere-triangle collision resolution
// Multi-iteration solver with slope walking

const MAX_ITERATIONS = 3;

const distanceToLineSegment = (point, a, b) => {
  const ab = p5.Vector.sub(b, a);
  const ap = p5.Vector.sub(point, a);
  const t  = Math.max(0, Math.min(1, ap.dot(ab) / ab.magSq()));
  return p5.Vector.dist(point, p5.Vector.add(a, ab.mult(t)));
};

const projectVelocityOffSurface = (vel, normal) => {
  const dot = vel.dot(normal);
  if (dot < 0) vel.sub(p5.Vector.mult(normal, dot));
};

const CollisionSystem = (world, collisionWorld, dt) => {
  const players = queryEntities(world, 'Player', 'Transform', 'Velocity');

  players.forEach(player => {
    const { Player: pd, Transform: { pos }, Velocity: { vel } } = player;
    const { radius } = pd;

    pd.grounded = false;

    const candidates = queryTrianglesNearPlayer(
      collisionWorld, pos, radius, COLLISION_CONFIG, vel
    );

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let bestGround     = null;
      let bestGroundY    = -Infinity;
      let bestEdgeGround = null;
      let bestEdgeGroundY = -Infinity;
      let steepestSlope  = null;
      let steepestSlopeY = -Infinity;
      let hadCollision   = false;

      candidates.forEach(tri => {
        // Backface culling for mesh colliders (boxes are always double-sided)
        if (!tri.isBox) {
          const toPlayer = p5.Vector.sub(pos, tri.a);
          if (toPlayer.dot(tri.normal) <= 0) return;
        }

        const contact = sphereVsTriangle(pos, radius + GROUNDING_TOLERANCE, tri);
        if (!contact) return;

        if (contact.depth > GROUNDING_TOLERANCE) {
          hadCollision = true;
          pos.add(p5.Vector.mult(contact.normal, contact.depth - GROUNDING_TOLERANCE));
        }

        if (contact.normal.y >= MIN_GROUND_NY) {
          // Distinguish face contacts from edge/vertex contacts
          const EDGE_THRESH = radius * 0.3;
          const nearVertex =
            p5.Vector.dist(contact.point, tri.a) < EDGE_THRESH ||
            p5.Vector.dist(contact.point, tri.b) < EDGE_THRESH ||
            p5.Vector.dist(contact.point, tri.c) < EDGE_THRESH;
          const nearEdge =
            distanceToLineSegment(contact.point, tri.a, tri.b) < EDGE_THRESH ||
            distanceToLineSegment(contact.point, tri.b, tri.c) < EDGE_THRESH ||
            distanceToLineSegment(contact.point, tri.c, tri.a) < EDGE_THRESH;

          if (!nearVertex && !nearEdge) {
            if (contact.point.y > bestGroundY) {
              bestGround  = contact;
              bestGroundY = contact.point.y;
            }
          } else if (contact.point.y > bestEdgeGroundY) {
            bestEdgeGround  = contact;
            bestEdgeGroundY = contact.point.y;
          }
        } else {
          if (contact.normal.y > 0.1 && contact.point.y > steepestSlopeY) {
            steepestSlope  = contact;
            steepestSlopeY = contact.point.y;
          }
          projectVelocityOffSurface(vel, contact.normal);
        }
      });

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

        projectVelocityOffSurface(vel, groundContact.normal);
      } else if (steepestSlope) {
        pd.steepSlope           = steepestSlope.normal.copy();
        pd.smoothedGroundNormal = null;
      } else {
        pd.steepSlope           = null;
        pd.smoothedGroundNormal = null;
      }

      if (!hadCollision) break;
    }
  });
};
