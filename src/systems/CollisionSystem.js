// CollisionSystem.js - Resolve player vs static environment collision

function CollisionSystem(world, collisionWorld, dt) {
  const players = queryEntities(world, 'Player', 'Transform', 'Velocity');

  for (let player of players) {
    const playerData = player.Player;
    const transform = player.Transform;
    const vel = player.Velocity.vel;

    const pos = transform.pos;
    const radius = playerData.radius;

    // Reset grounded state
    playerData.grounded = false;

    // Query nearby triangles using broadphase
    const candidates = queryTrianglesNearPlayer(
      collisionWorld,
      pos,
      radius,
      COLLISION_CONFIG
    );

    // Collision resolution with multiple iterations for stability
    const MAX_ITERATIONS = 3;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let bestGround = null;
      let bestGroundY = -Infinity;
      let hadCollision = false;

      for (let tri of candidates) {
        const contact = sphereVsTriangle(pos, radius, tri);

        if (!contact) continue;

        hadCollision = true;

        // Push out of penetration
        pos.x += contact.normal.x * contact.depth;
        pos.y += contact.normal.y * contact.depth;
        pos.z += contact.normal.z * contact.depth;

        // Check if this is ground
        if (contact.normal.y >= MIN_GROUND_NY) {
          // This is a walkable surface
          if (contact.point.y > bestGroundY) {
            bestGround = contact;
            bestGroundY = contact.point.y;
          }
        } else {
          // Wall or steep slope - remove velocity into surface
          const velDotNormal = vec3Dot(vel, contact.normal);
          if (velDotNormal < 0) {
            vel.x -= contact.normal.x * velDotNormal;
            vel.y -= contact.normal.y * velDotNormal;
            vel.z -= contact.normal.z * velDotNormal;
          }
        }
      }

      // Apply grounding
      if (bestGround) {
        playerData.grounded = true;
        playerData.groundNormal = vec3Copy(bestGround.normal);

        // Remove downward velocity when grounded
        if (vel.y < 0) {
          vel.y = 0;
        }

        // Prevent sliding: project velocity along ground plane
        const velDotNormal = vec3Dot(vel, bestGround.normal);
        if (velDotNormal < 0) {
          vel.x -= bestGround.normal.x * velDotNormal;
          vel.y -= bestGround.normal.y * velDotNormal;
          vel.z -= bestGround.normal.z * velDotNormal;
        }
      }

      // Early exit if no collisions
      if (!hadCollision) break;
    }
  }
}
