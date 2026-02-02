// GravitySystem.js - Gravity application
// Applies downward acceleration when not grounded

const GravitySystem = (world, dt) => {
  // Apply gravity to players
  const players = queryEntities(world, 'Player', 'Velocity');

  players.forEach(player => {
    const { Player: playerData, Velocity: { vel } } = player;

    if (!playerData.grounded) {
      // Apply normal gravity when not grounded
      vel.y -= GRAVITY * dt;

      // Clamp to terminal velocity to prevent tunneling through geometry
      if (vel.y < -TERMINAL_VELOCITY) {
        vel.y = -TERMINAL_VELOCITY;
      }
    }
  });

  // Apply gravity to NPCs
  const npcs = queryEntities(world, 'NPC', 'Velocity');

  npcs.forEach(npc => {
    const { NPC: npcData, Velocity: { vel } } = npc;

    if (!npcData.grounded) {
      // Apply normal gravity when not grounded
      vel.y -= GRAVITY * dt;

      // Clamp to terminal velocity to prevent tunneling through geometry
      if (vel.y < -TERMINAL_VELOCITY) {
        vel.y = -TERMINAL_VELOCITY;
      }
    }
  });
};
