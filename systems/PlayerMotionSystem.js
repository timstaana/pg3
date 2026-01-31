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

    vel.x = forwardDir.x * input.forward * playerData.moveSpeed;
    vel.z = forwardDir.z * input.forward * playerData.moveSpeed;

    if (input.jump && playerData.grounded) {
      vel.y = playerData.jumpSpeed;
      playerData.grounded = false;
    }
  });
};
