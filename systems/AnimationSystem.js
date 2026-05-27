// AnimationSystem.js - Sprite frame animation for player and remote players

const AnimationSystem = (world, dt) => {
  // Local player: animate based on input
  const players = queryEntities(world, 'Animation', 'Velocity', 'Input', 'Player');

  players.forEach(entity => {
    const { Animation: anim, Velocity: { vel }, Input: input, Player: pd } = entity;

    if (input.turn || input.forward) {
      const wasIdle = anim.currentFrame === anim.idleFrame;
      if (wasIdle) {
        anim.currentFrame = anim.walkFrames[0];
        anim.frameTime    = 0;
      }

      const hSpeed  = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      const fps     = input.turn && hSpeed < 0.1
        ? anim.framesPerSecond
        : anim.framesPerSecond * Math.max(hSpeed / pd.moveSpeed, 0.5);

      anim.frameTime += dt;
      if (anim.frameTime >= 1 / fps) {
        anim.frameTime -= 1 / fps;
        const idx = anim.walkFrames.indexOf(anim.currentFrame);
        anim.currentFrame = anim.walkFrames[
          idx >= 0 ? (idx + 1) % anim.walkFrames.length : 0
        ];
      }
    } else {
      anim.currentFrame = anim.idleFrame;
      anim.frameTime    = 0;
    }
  });

  // Remote players: animate based on movement flags set by NetworkSystem
  const remote = queryEntities(world, 'Animation', 'NetworkedPlayer');

  remote.forEach(entity => {
    const { Animation: anim, NetworkedPlayer: nd } = entity;

    if (nd.isMoving || nd.isTurning) {
      anim.frameTime += dt;
      const frameDur = 1 / anim.framesPerSecond;
      if (anim.frameTime >= frameDur) {
        anim.frameTime   -= frameDur;
        anim.currentFrame = (anim.currentFrame + 1) % anim.totalFrames;
      }
    } else {
      anim.currentFrame = 0;
      anim.frameTime    = 0;
    }
  });
};
