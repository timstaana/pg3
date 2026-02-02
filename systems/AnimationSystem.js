// AnimationSystem.js - Sprite animation for player and NPCs

const AnimationSystem = (world, dt) => {
  // Animate players (input-based)
  const players = queryEntities(world, 'Animation', 'Velocity', 'Input', 'Player');

  players.forEach(entity => {
    const { Animation: anim, Velocity: { vel }, Input: input, Player: playerData } = entity;

    // Calculate horizontal speed (ignoring vertical component)
    // Optimize: use squared speed for comparison when possible
    const horizontalSpeedSq = vel.x * vel.x + vel.z * vel.z;
    const horizontalSpeed = Math.sqrt(horizontalSpeedSq);

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

  // Animate NPCs (velocity-based)
  const npcs = queryEntities(world, 'Animation', 'Velocity', 'NPC');

  npcs.forEach(entity => {
    const { Animation: anim, Velocity: { vel } } = entity;

    // Calculate horizontal speed
    const horizontalSpeedSq = vel.x * vel.x + vel.z * vel.z;
    const horizontalSpeed = Math.sqrt(horizontalSpeedSq);
    const isMoving = horizontalSpeed > 0.1;

    if (isMoving) {
      // Check if transitioning from idle to walking
      const wasIdle = anim.currentFrame === anim.idleFrame;
      if (wasIdle) {
        anim.currentFrame = anim.walkFrames[0];
        anim.frameTime = 0;
      }

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

  // Animate remote players (like local player: animate on turn or forward/backward)
  const remotePlayers = queryEntities(world, 'Animation', 'Transform', 'NetworkedPlayer');

  remotePlayers.forEach(entity => {
    const { Animation: anim, Transform: transform, NetworkedPlayer: netData } = entity;

    // Detect position movement (forward/backward)
    const currentPos = transform.pos;
    const targetPos = netData.targetPos;
    const distToTarget = p5.Vector.dist(currentPos, targetPos);
    const isMoving = distToTarget > 0.05; // Moving if more than 0.05 units from target

    // Detect rotation (turning)
    const currentYaw = transform.rot.y;
    const targetYaw = netData.targetYaw;
    let yawDiff = targetYaw - currentYaw;
    // Normalize angle difference
    if (yawDiff > 180) yawDiff -= 360;
    else if (yawDiff < -180) yawDiff += 360;
    const isTurning = Math.abs(yawDiff) > 1; // Turning if more than 1 degree off

    // Animate if moving OR turning (like local player)
    if (isMoving || isTurning) {
      // Check if transitioning from idle to walking
      const wasIdle = anim.currentFrame === 0;
      if (wasIdle) {
        anim.currentFrame = 0; // Start from first frame
        anim.frameTime = 0;
      }

      // Animate through all frames
      anim.frameTime += dt;
      const frameDuration = 1 / anim.framesPerSecond;

      if (anim.frameTime >= frameDuration) {
        anim.frameTime -= frameDuration;
        // Cycle through frames 0, 1, 2, 0, 1, 2...
        anim.currentFrame = (anim.currentFrame + 1) % anim.totalFrames;
      }
    } else {
      // Idle - stay on frame 0
      anim.currentFrame = 0;
      anim.frameTime = 0;
    }
  });
};
