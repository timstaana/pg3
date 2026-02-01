// GravitySystem.js - Gravity application
// Applies downward acceleration when not grounded

const GravitySystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Velocity', 'Input');

  players.forEach(player => {
    const { Player: playerData, Velocity: { vel },  Input: input } = player;

    if (!playerData.grounded) {
      // Apply normal gravity when not grounded
      vel.y -= GRAVITY * dt;

      // Clamp to terminal velocity to prevent tunneling through geometry
      if (vel.y < -TERMINAL_VELOCITY) {
        vel.y = -TERMINAL_VELOCITY;
      }
    }

  });
};
