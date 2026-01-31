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
    if (playerData.grounded && playerData.smoothedGroundNormal && SLOPE_SPEED_FACTOR > 0 && input.forward !== 0) {
      // Use smoothed normal for stable slope detection
      const normal = playerData.smoothedGroundNormal;

      // Calculate steepness using absolute Y to handle any normal orientation
      const absY = Math.abs(normal.y);
      const steepness = 1.0 - absY;
      const maxSteepness = 1.0 - MIN_GROUND_NY;
      const normalizedSteepness = constrain(steepness / maxSteepness, 0, 1);

      // Get horizontal component of ground normal to determine direction
      const groundNormalHorizontal = createVector(
        normal.x,
        0,
        normal.z
      );

      const horizontalMag = groundNormalHorizontal.mag();
      if (horizontalMag > 0.001 && normalizedSteepness > 0.01) {
        groundNormalHorizontal.normalize();

        // Check dot product to determine if moving uphill or downhill
        const dot = forwardDir.dot(groundNormalHorizontal);
        const isUphill = dot < -0.05;
        const isDownhill = dot > 0.05;

        if (isUphill) {
          // Slow down when going uphill
          slopeMultiplier = 1.0 - (normalizedSteepness * SLOPE_SPEED_FACTOR);
          slopeMultiplier = constrain(slopeMultiplier, 0.3, 1.0);
        } else if (isDownhill) {
          // Speed up when going downhill - more aggressive on steeper slopes
          const downhillBoost = normalizedSteepness * SLOPE_SPEED_FACTOR * 2;
          slopeMultiplier = 1.0 + downhillBoost;
          slopeMultiplier = constrain(slopeMultiplier, 1.0, 2.5);
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
