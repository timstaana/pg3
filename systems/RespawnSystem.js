// RespawnSystem.js - Handles player respawning when falling out of bounds
// Teleports player back to spawn if they fall below death plane

const DEATH_PLANE_Y = -25; // Y position below which player respawns

const RespawnSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Transform', 'Velocity');

  players.forEach(player => {
    const { Player: playerData, Transform: { pos, rot }, Velocity: { vel } } = player;

    // Check if player fell below death plane
    if (pos.y < DEATH_PLANE_Y) {
      // Teleport to spawn position
      pos.x = playerData.spawnPos.x;
      pos.y = playerData.spawnPos.y;
      pos.z = playerData.spawnPos.z;

      // Reset rotation to spawn yaw
      rot.y = playerData.spawnYaw;
      rot.x = 0;
      rot.z = 0;

      // Reset velocity
      vel.x = 0;
      vel.y = 0;
      vel.z = 0;

      // Reset grounding state
      playerData.grounded = false;
      playerData.steepSlope = null;
      playerData.smoothedGroundNormal = null;

      // Reset jump timers
      playerData.hasJumped = false;
      playerData.coyoteTimer = 0;
      playerData.jumpBufferTimer = 0;

      // Reset camera to instantly cut to new position
      if (typeof cameraRig !== 'undefined') {
        cameraRig.initialized = false;
      }
    }
  });
};
