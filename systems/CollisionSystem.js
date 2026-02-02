// CollisionSystem.js - Sphere-triangle collision resolution
// Multi-iteration solver with Mario-style slope walking

const MAX_ITERATIONS = 3;

const distanceToLineSegment = (point, a, b) => {
  const ab = p5.Vector.sub(b, a);
  const ap = p5.Vector.sub(point, a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.magSq()));
  const closestPoint = p5.Vector.add(a, ab.mult(t));
  return p5.Vector.dist(point, closestPoint);
};

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
      COLLISION_CONFIG,
      vel
    );

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let bestGround = null;
      let bestGroundY = -Infinity;
      let bestEdgeGround = null; // Fallback for edge contacts
      let bestEdgeGroundY = -Infinity;
      let steepestSlope = null;
      let steepestSlopeY = -Infinity;
      let hadCollision = false;

      candidates.forEach(tri => {
        // Backface culling: skip triangles facing away from player
        // Only apply to mesh colliders, not boxes (boxes are closed volumes)
        if (!tri.isBox) {
          const toPlayer = p5.Vector.sub(pos, tri.a);
          const isFrontFacing = toPlayer.dot(tri.normal) > 0;
          if (!isFrontFacing) return;
        }

        const groundCheckRadius = radius + GROUNDING_TOLERANCE;
        const contact = sphereVsTriangle(pos, groundCheckRadius, tri);

        if (!contact) return;

        if (contact.depth > GROUNDING_TOLERANCE) {
          hadCollision = true;
          const pushDepth = contact.depth - GROUNDING_TOLERANCE;
          pos.add(p5.Vector.mult(contact.normal, pushDepth));
        }

        if (contact.normal.y >= MIN_GROUND_NY) {
          // Check if contact is on the triangle surface, not on an edge/vertex
          // by checking distance to vertices AND edges
          const EDGE_THRESHOLD = radius * 0.3;

          // Check distance to vertices
          const toA = p5.Vector.dist(contact.point, tri.a);
          const toB = p5.Vector.dist(contact.point, tri.b);
          const toC = p5.Vector.dist(contact.point, tri.c);
          const isNearVertex = toA < EDGE_THRESHOLD || toB < EDGE_THRESHOLD || toC < EDGE_THRESHOLD;

          // Check distance to edges (line segments)
          const distToAB = distanceToLineSegment(contact.point, tri.a, tri.b);
          const distToBC = distanceToLineSegment(contact.point, tri.b, tri.c);
          const distToCA = distanceToLineSegment(contact.point, tri.c, tri.a);
          const isNearEdge = distToAB < EDGE_THRESHOLD || distToBC < EDGE_THRESHOLD || distToCA < EDGE_THRESHOLD;

          if (!isNearVertex && !isNearEdge) {
            // Prefer non-edge contacts
            if (contact.point.y > bestGroundY) {
              bestGround = contact;
              bestGroundY = contact.point.y;
            }
          } else if (contact.point.y > bestEdgeGroundY) {
            // Track edge contacts as fallback
            bestEdgeGround = contact;
            bestEdgeGroundY = contact.point.y;
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

      // Use non-edge ground if available, otherwise fall back to edge contact
      // This allows transitioning over mountain folds while avoiding edges when possible
      const groundContact = bestGround || bestEdgeGround;

      if (groundContact) {
        playerData.grounded = true;
        playerData.groundNormal = groundContact.normal.copy();

        // Smooth the ground normal to prevent rapid changes
        const NORMAL_SMOOTH = .1;
        if (!playerData.smoothedGroundNormal) {
          playerData.smoothedGroundNormal = groundContact.normal.copy();
        } else {
          playerData.smoothedGroundNormal.lerp(groundContact.normal, NORMAL_SMOOTH);
          playerData.smoothedGroundNormal.normalize();
        }

        playerData.steepSlope = null;
        projectVelocityOffSurface(vel, groundContact.normal);
      } else if (steepestSlope) {
        // On a steep slope - not grounded but should slide
        playerData.steepSlope = steepestSlope.normal.copy();
        playerData.smoothedGroundNormal = null;
      } else {
        playerData.steepSlope = null;
        playerData.smoothedGroundNormal = null;
      }

      if (!hadCollision) break;
    }
  });

  // Handle NPC collision (simpler than player - just grounding and basic collision)
  const npcs = queryEntities(world, 'NPC', 'Transform', 'Velocity');

  npcs.forEach(npc => {
    const { NPC: npcData, Transform: { pos }, Velocity: { vel } } = npc;
    const { radius } = npcData;

    npcData.grounded = false;

    const candidates = queryTrianglesNearPlayer(
      collisionWorld,
      pos,
      radius,
      COLLISION_CONFIG,
      vel
    );

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let bestGround = null;
      let bestGroundY = -Infinity;
      let hadCollision = false;

      candidates.forEach(tri => {
        // Backface culling for mesh colliders
        if (!tri.isBox) {
          const toNPC = p5.Vector.sub(pos, tri.a);
          const isFrontFacing = toNPC.dot(tri.normal) > 0;
          if (!isFrontFacing) return;
        }

        const groundCheckRadius = radius + GROUNDING_TOLERANCE;
        const contact = sphereVsTriangle(pos, groundCheckRadius, tri);

        if (!contact) return;

        if (contact.depth > GROUNDING_TOLERANCE) {
          hadCollision = true;
          const pushDepth = contact.depth - GROUNDING_TOLERANCE;
          pos.add(p5.Vector.mult(contact.normal, pushDepth));
        }

        // Track best ground contact
        if (contact.normal.y >= MIN_GROUND_NY && contact.point.y > bestGroundY) {
          bestGround = contact;
          bestGroundY = contact.point.y;
        } else {
          // Project velocity off non-ground surfaces
          projectVelocityOffSurface(vel, contact.normal);
        }
      });

      if (bestGround) {
        npcData.grounded = true;
        npcData.groundNormal = bestGround.normal.copy();
        projectVelocityOffSurface(vel, bestGround.normal);
      }

      if (!hadCollision) break;
    }
  });
};
