// CollisionSystem.js - Sphere-triangle collision resolution
// Multi-iteration solver with Mario-style slope walking

const MAX_ITERATIONS = 3;

const projectVelocityOffSurface = (vel, normal) => {
  const velDotNormal = vel.dot(normal);
  if (velDotNormal < 0) {
    vel.sub(p5.Vector.mult(normal, velDotNormal));
  }
};

const CollisionSystem = (world, collisionWorld, dt) => {
  const players = queryEntities(world, 'Player', 'Transform', 'Velocity');

  players.forEach(player => {
    const { Player: playerData, Transform: { pos }, Velocity: { vel } } = player;
    const { radius } = playerData;

    playerData.grounded = false;

    const candidates = queryTrianglesNearPlayer(
      collisionWorld,
      pos,
      radius,
      COLLISION_CONFIG
    );

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let bestGround = null;
      let bestGroundY = -Infinity;
      let steepestSlope = null;
      let steepestSlopeY = -Infinity;
      let hadCollision = false;

      candidates.forEach(tri => {
        const groundCheckRadius = radius + GROUNDING_TOLERANCE;
        const contact = sphereVsTriangle(pos, groundCheckRadius, tri);

        if (!contact) return;

        if (contact.depth > GROUNDING_TOLERANCE) {
          hadCollision = true;
          const pushDepth = contact.depth - GROUNDING_TOLERANCE;
          pos.add(p5.Vector.mult(contact.normal, pushDepth));
        }

        if (contact.normal.y >= MIN_GROUND_NY) {
          if (contact.point.y > bestGroundY) {
            bestGround = contact;
            bestGroundY = contact.point.y;
          }
        } else {
          // Track steep slope contacts for sliding
          if (contact.normal.y > 0.1 && contact.point.y > steepestSlopeY) {
            steepestSlope = contact;
            steepestSlopeY = contact.point.y;
          }
          projectVelocityOffSurface(vel, contact.normal);
        }
      });

      if (bestGround) {
        playerData.grounded = true;
        playerData.groundNormal = bestGround.normal.copy();
        playerData.steepSlope = null;
        projectVelocityOffSurface(vel, bestGround.normal);
      } else if (steepestSlope) {
        // On a steep slope - not grounded but should slide
        playerData.steepSlope = steepestSlope.normal.copy();
      } else {
        playerData.steepSlope = null;
      }

      if (!hadCollision) break;
    }
  });
};
