// AnimationSystem.js - Sprite animation for player

const AnimationSystem = (world, dt) => {
  const entities = queryEntities(world, 'Animation', 'Velocity', 'Input');

  entities.forEach(entity => {
    const { Animation: anim, Velocity: { vel }, Input: input } = entity;

    // Determine if moving or turning
    const speed = vel.mag();
    const isTurning = Math.abs(input.turn) > 0.01;
    const isMoving = speed > 0.1 || isTurning;

    // Set animation frames based on state
    if (isMoving) {
      // Walking animation
      anim.frameTime += dt;
      const frameDuration = 1 / anim.framesPerSecond;

      if (anim.frameTime >= frameDuration) {
        anim.frameTime -= frameDuration;

        // Loop through walk frames
        const walkIndex = anim.walkFrames.indexOf(anim.currentFrame);
        if (walkIndex >= 0) {
          const nextIndex = (walkIndex + 1) % anim.walkFrames.length;
          anim.currentFrame = anim.walkFrames[nextIndex];
        } else {
          anim.currentFrame = anim.walkFrames[0];
        }
      }
    } else {
      // Idle
      anim.currentFrame = anim.idleFrame;
      anim.frameTime = 0;
    }
  });
};
