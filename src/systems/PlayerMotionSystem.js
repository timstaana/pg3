// PlayerMotionSystem.js - Apply input to player velocity

function PlayerMotionSystem(world, dt) {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  for (let player of players) {
    const input = player.Input;
    const vel = player.Velocity.vel;
    const playerData = player.Player;
    const transform = player.Transform;

    // Apply XZ movement from input
    const moveSpeed = playerData.moveSpeed;

    // Apply movement in world space (relative to camera yaw would go here if needed)
    vel.x = input.move.x * moveSpeed;
    vel.z = input.move.z * moveSpeed;

    // Jump
    if (input.jump && playerData.grounded) {
      vel.y = playerData.jumpSpeed;
      playerData.grounded = false;
    }
  }
}
