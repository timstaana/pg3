// PlayerMotionSystem.js - Input to velocity conversion
// Applies movement speed and jump mechanics
let speedMod

const PlayerMotionSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  players.forEach(player => {
    const { Input: input, Velocity: { vel }, Player: playerData, Transform: { rot } } = player;

    // Tank controls: rotate player with turn input
    rot.y += input.turn * playerData.turnSpeed * dt;

    

    if (playerData.grounded && playerData.groundNormal && input.forward) {
      speedMod = (playerData.groundNormal?.y*1);
    } else if (playerData.steepSlope?.y) {
      speedMod = (playerData.steepSlope?.y*1.3);
    }

    // Move forward/backward in the direction player is facing
    const yawRad = radians(-rot.y);
    const forwardDir = createVector(sin(yawRad), 0, cos(yawRad));

    vel.x = forwardDir.x * input.forward * (playerData.moveSpeed * speedMod);
    vel.z = forwardDir.z * input.forward * (playerData.moveSpeed * speedMod);

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
