// PlayerMotionSystem.js - Input to velocity conversion
// Applies movement speed and jump mechanics

const PlayerMotionSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  players.forEach(player => {
    const { Input: input, Velocity: { vel }, Player: playerData, Transform: { rot } } = player;

    // Tank controls: rotate player with turn input
    rot.y += input.turn * playerData.turnSpeed * dt;

    // Move forward/backward in the direction player is facing
    const yawRad = radians(-rot.y);
    const forwardDir = createVector(sin(yawRad), 0, cos(yawRad));

    // Calculate slope-based speed adjustment
    let slopeMultiplier = 1.0;
    if (playerData.grounded && SLOPE_SPEED_FACTOR > 0 && input.forward !== 0) {
      // Calculate steepness from ground normal Y component
      // 1.0 = flat, MIN_GROUND_NY (~0.707 for 45deg) = max slope
      const steepness = 1.0 - playerData.groundNormal.y;
      const maxSteepness = 1.0 - MIN_GROUND_NY;
      const normalizedSteepness = constrain(steepness / maxSteepness, 0, 1);

      // Get horizontal component of ground normal to determine direction
      const groundNormalHorizontal = createVector(
        playerData.groundNormal.x,
        0,
        playerData.groundNormal.z
      );

      const horizontalMag = groundNormalHorizontal.mag();
      if (horizontalMag > 0.001 && normalizedSteepness > 0.01) {
        groundNormalHorizontal.normalize();

        // Determine if moving uphill or downhill
        // Negative = uphill, Positive = downhill
        const slopeDirection = -forwardDir.dot(groundNormalHorizontal) * input.forward;

        // Apply penalty when going uphill
        if (slopeDirection > 0) {
          slopeMultiplier = 1.0 - (normalizedSteepness * SLOPE_SPEED_FACTOR);
          slopeMultiplier = constrain(slopeMultiplier, 0.3, 1.0);
        }
      }
    }

    vel.x = forwardDir.x * input.forward * playerData.moveSpeed * slopeMultiplier;
    vel.z = forwardDir.z * input.forward * playerData.moveSpeed * slopeMultiplier;

    if (input.jump && playerData.grounded) {
      vel.y = playerData.jumpSpeed;
      playerData.grounded = false;
    }
  });
};
