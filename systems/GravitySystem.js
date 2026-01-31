// GravitySystem.js - Gravity application
// Applies downward acceleration when not grounded

const GravitySystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Velocity');

  players.forEach(player => {
    const { Player: playerData, Velocity: { vel } } = player;

    if (!playerData.grounded) {
      if (playerData.steepSlope) {
        // On a steep slope - apply sliding force
        const gravityVec = createVector(0, -GRAVITY * dt, 0);

        // Project gravity onto the slope plane
        const normalDotGrav = playerData.steepSlope.dot(gravityVec);
        const slideForce = p5.Vector.sub(gravityVec, p5.Vector.mult(playerData.steepSlope, normalDotGrav));

        vel.add(slideForce);
      } else {
        // In air - normal gravity
        vel.y -= GRAVITY * dt;
      }
    }
  });
};
