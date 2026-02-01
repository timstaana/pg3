// PlayerMotionSystem.js - Input to velocity conversion
// Applies movement speed and jump mechanics

const PlayerMotionSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  players.forEach(player => {
    const { Input: input, Velocity: { vel }, Player: playerData, Transform: { rot } } = player;

    // Tank controls: rotate player with turn input
    rot.y += input.turn * playerData.turnSpeed * dt;

    // Calculate speed modifier based on surface
    let speedMod = 1.0; // Default speed when airborne or on flat ground

    if (playerData.grounded && playerData.groundNormal && input.forward) {
      speedMod = playerData.groundNormal.y;
    } else if (playerData.steepSlope?.y) {
      speedMod = playerData.steepSlope.y * 1.3;
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
      vel.y = playerData.jumpSpeed;
      playerData.hasJumped = true;
      playerData.grounded = false;
    }
  });
};
