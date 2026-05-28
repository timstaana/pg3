// AnimationSystem.js — Sprite frame cycling for player and remote players
//
// Optimisation: walk-frame index stored as anim._wi (integer counter) so
// advancing to the next frame is O(1) modulo arithmetic instead of indexOf().

const AnimationSystem = (world, dt) => {
  // ── Local player — driven by input
  const players = queryEntities(world, 'Animation', 'Velocity', 'Input', 'Player');

  for (const entity of players) {
    const { Animation: anim, Velocity: { vel }, Input: input, Player: pd } = entity;

    if (input.turn || input.forward) {
      // Kick off walk cycle immediately when transitioning from idle
      if (anim.currentFrame === anim.idleFrame) {
        anim._wi          = 0;
        anim.currentFrame = anim.walkFrames[0];
        anim.frameTime    = 0;
      }

      // Scale animation speed with actual horizontal speed
      const hSpeed  = Math.sqrt(vel.x*vel.x + vel.z*vel.z);
      const fps     = (input.turn && hSpeed < 0.1)
        ? anim.framesPerSecond
        : anim.framesPerSecond * Math.max(hSpeed / pd.moveSpeed, 0.5);

      anim.frameTime += dt;
      const frameDur  = 1 / fps;
      if (anim.frameTime >= frameDur) {
        anim.frameTime -= frameDur;
        // O(1) index advance — no indexOf scan
        anim._wi          = ((anim._wi ?? 0) + 1) % anim.walkFrames.length;
        anim.currentFrame = anim.walkFrames[anim._wi];
      }

      anim.bobPhase = ((anim.bobPhase || 0) + dt * fps * Math.PI) % (Math.PI * 2);
    } else {
      anim.currentFrame = anim.idleFrame;
      anim.frameTime    = 0;
      anim._wi          = 0;
      anim.bobPhase     = 0;
    }
  }

  // ── Remote (networked) players — driven by movement flags from NetworkSystem
  const remote = queryEntities(world, 'Animation', 'NetworkedPlayer');

  for (const entity of remote) {
    const { Animation: anim, NetworkedPlayer: nd } = entity;

    if (nd.isMoving || nd.isTurning) {
      if (anim.currentFrame === 0) { anim.currentFrame = 1; anim.frameTime = 0; }
      anim.frameTime += dt;
      const frameDur  = 1 / anim.framesPerSecond;
      if (anim.frameTime >= frameDur) {
        anim.frameTime   -= frameDur;
        anim.currentFrame = anim.currentFrame === 1 ? 2 : 1;
      }
      anim.bobPhase = ((anim.bobPhase || 0) + dt * anim.framesPerSecond * Math.PI) % (Math.PI * 2);
    } else {
      anim.currentFrame = 0;
      anim.frameTime    = 0;
      anim.bobPhase     = 0;
    }
  }
};
