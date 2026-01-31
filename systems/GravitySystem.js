// GravitySystem.js - Gravity application
// Applies downward acceleration when not grounded

const GravitySystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Velocity');

  players.forEach(player => {
    const { Player: playerData, Velocity: { vel } } = player;

    if (!playerData.grounded) {
      vel.y -= GRAVITY * dt;
    }
  });
};
