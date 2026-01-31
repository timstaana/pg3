// AnimationSystem.js - Sprite animation for player

const AnimationSystem = (world, dt) => {
  const entities = queryEntities(world, 'Animation', 'Velocity', 'Input', 'Player');

  entities.forEach(entity => {
    const { Animation: anim, Velocity: { vel }, Input: input, Player: playerData } = entity;

    // Calculate horizontal speed (ignoring vertical component)
    const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

    // Set animation frames based on state
    if (input.turn || input.forward) {
      // Check if transitioning from idle to walking
      const wasIdle = anim.currentFrame === anim.idleFrame;
      if (wasIdle) {
        // Start walking animation immediately
        anim.currentFrame = anim.walkFrames[0];
        anim.frameTime = 0;
      }

      // Use full speed when turning, scaled speed when moving forward
      let scaledFPS;
      if (input.turn && horizontalSpeed < 0.1) {
        // Turning in place - use full speed
        scaledFPS = anim.framesPerSecond;
      } else {
        // Moving - scale animation speed based on actual movement speed
        const speedRatio = horizontalSpeed / playerData.moveSpeed;
        scaledFPS = anim.framesPerSecond * Math.max(speedRatio, 0.5); // Min 50% speed
      }

      // Walking animation
      anim.frameTime += dt;
      const frameDuration = 1 / scaledFPS;

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
