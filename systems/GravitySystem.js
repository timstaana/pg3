// GravitySystem.js - Gravity application
// Applies downward acceleration when not grounded

const GravitySystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Velocity', 'Input');

  players.forEach(player => {
    const { Player: playerData, Velocity: { vel },  Input: input } = player;

    if (!playerData.grounded) {
      // Apply normal gravity when not grounded
      vel.y -= GRAVITY * dt;
    }

    // if (playerData.grounded && playerData.groundNormal && input.turn) {
    //   vel.y -= (GRAVITY * ((1-playerData.groundNormal?.y)+1)) * dt;
    // } else if (playerData.steepSlope?.y) {
    //   vel.y -= (GRAVITY * ((1-playerData.steepSlope?.y)+1)) * dt;
    // }

  });
};
