// PlayerMotionSystem.js - Input to velocity conversion
// Applies movement speed and jump mechanics

const PlayerMotionSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  players.forEach(player => {
    const { Input: input, Velocity: { vel }, Player: playerData, Transform: { rot } } = player;

    // Tank controls: rotate player with turn input
    rot.y += input.turn * playerData.turnSpeed * dt;

    // Calculate slope-based speed modifier
    let speedMod = 1.0;

    if (input.forward !== 0 && (playerData.grounded || playerData.steepSlope)) {
      const normal = playerData.grounded ? playerData.groundNormal : playerData.steepSlope;

      if (normal) {
        // Calculate player's forward direction
        const yawRad = radians(-rot.y);
        const forwardX = sin(yawRad);
        const forwardZ = cos(yawRad);

        // Project normal onto horizontal plane to get slope direction
        const slopeX = -normal.x;
        const slopeZ = -normal.z;
        const slopeMag = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

        if (slopeMag > 0.01) {
          // Calculate dot product to see if moving uphill or downhill
          const dot = (forwardX * slopeX + forwardZ * slopeZ) / slopeMag;
          const slopeAngle = Math.acos(Math.max(0, Math.min(1, normal.y)));

          // Moving uphill (against slope direction)
          if (dot * input.forward > 0) {
            // Steeper slopes = more slowdown (Death Stranding style)
            // Use quadratic falloff for more dramatic slowdown on steep slopes
            const slopeFactor = 1.0 - Math.pow(slopeAngle / (Math.PI / 2), 1.5);
            speedMod = Math.max(0.2, slopeFactor); // Minimum 20% speed
          } else {
            // Moving downhill - maintain full speed or slight boost
            speedMod = 1.0;
          }
        }
      }
    }

    // Move forward/backward in the direction player is facing
    const yawRad = radians(-rot.y);
    // Optimize: calculate velocity components directly without allocating vector
    const sinYaw = sin(yawRad);
    const cosYaw = cos(yawRad);
    const speed = input.forward * (playerData.moveSpeed * speedMod);

    vel.x = sinYaw * speed;
    vel.z = cosYaw * speed;

    // Track jump state: can jump when grounded or on a slope, but only once until grounded again
    const canJumpFrom = playerData.grounded || playerData.steepSlope;

    // Reset jump availability when grounded
    if (playerData.grounded) {
      playerData.hasJumped = false;
    }

    // Allow jumping if: has jump input, can jump from current surface, and hasn't jumped yet
    if (input.jump && canJumpFrom && !playerData.hasJumped) {
      // Always jump straight up with consistent height
      vel.y = playerData.jumpSpeed;

      playerData.hasJumped = true;
      playerData.grounded = false;
    }
  });
};
