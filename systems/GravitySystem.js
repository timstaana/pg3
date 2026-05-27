// GravitySystem.js - Applies downward acceleration when airborne

const GravitySystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Velocity');

  players.forEach(player => {
    const { Player: pd, Velocity: { vel } } = player;
    if (!pd.grounded) {
      vel.y -= GRAVITY * dt;
      if (vel.y < -TERMINAL_VELOCITY) vel.y = -TERMINAL_VELOCITY;
    }
  });
};
