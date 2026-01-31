// PlayerMotionSystem.js - Input to velocity conversion
// Applies movement speed and jump mechanics

const PlayerMotionSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  players.forEach(player => {
    const { Input: input, Velocity: { vel }, Player: playerData } = player;

    vel.x = input.move.x * playerData.moveSpeed;
    vel.z = input.move.z * playerData.moveSpeed;

    if (input.jump && playerData.grounded) {
      vel.y = playerData.jumpSpeed;
      playerData.grounded = false;
    }
  });
};
