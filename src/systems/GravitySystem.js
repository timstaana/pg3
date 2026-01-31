// GravitySystem.js - Apply gravity to non-grounded entities

function GravitySystem(world, dt) {
  const players = queryEntities(world, 'Player', 'Velocity');

  for (let player of players) {
    const playerData = player.Player;
    const vel = player.Velocity.vel;

    if (!playerData.grounded) {
      vel.y -= GRAVITY * dt;
    }
  }
}
