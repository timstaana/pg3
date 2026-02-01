// PlayerMotionSystem.js - Input to velocity conversion
// Applies movement speed and jump mechanics

const COYOTE_TIME = 0.1; // Seconds after leaving ground where jump is still allowed
const JUMP_BUFFER_TIME = 0.15; // Seconds to buffer jump input before landing

const PlayerMotionSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  players.forEach(player => {
    const { Input: input, Velocity: { vel }, Player: playerData, Transform: { rot } } = player;

    // Tank controls: rotate player with turn input
    rot.y += input.turn * playerData.turnSpeed * dt;

    // Calculate slope-based speed modifier
    let speedMod = 1.0;

    if (input.forward !== 0 && (playerData.grounded || playerData.steepSlope)) {
      const normal = playerData.grounded ? playerData.groundNormal : playerData.steepSlope;

      if (normal) {
        // Calculate player's forward direction
        const yawRad = radians(-rot.y);
        const forwardX = sin(yawRad);
        const forwardZ = cos(yawRad);

        // Project normal onto horizontal plane to get slope direction
        const slopeX = -normal.x;
        const slopeZ = -normal.z;
        const slopeMag = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

        if (slopeMag > 0.01) {
          // Calculate dot product to see if moving uphill or downhill
          const dot = (forwardX * slopeX + forwardZ * slopeZ) / slopeMag;
          const slopeAngle = Math.acos(Math.max(0, Math.min(1, normal.y)));

          // Moving uphill (against slope direction)
          if (dot * input.forward > 0) {
            // Steeper slopes = more slowdown (Death Stranding style)
            // Use quadratic falloff for more dramatic slowdown on steep slopes
            const slopeFactor = 1.0 - Math.pow(slopeAngle / (Math.PI / 2), 1.5);
            speedMod = Math.max(0.2, slopeFactor); // Minimum 20% speed
          } else {
            // Moving downhill - maintain full speed or slight boost
            speedMod = 1.0;
          }
        }
      }
    }

    // Move forward/backward in the direction player is facing
    const yawRad = radians(-rot.y);
    // Optimize: calculate velocity components directly without allocating vector
    const sinYaw = sin(yawRad);
    const cosYaw = cos(yawRad);
    const speed = input.forward * (playerData.moveSpeed * speedMod);

    vel.x = sinYaw * speed;
    vel.z = cosYaw * speed;

    // Initialize timers if they don't exist
    if (playerData.coyoteTimer === undefined) playerData.coyoteTimer = 0;
    if (playerData.jumpBufferTimer === undefined) playerData.jumpBufferTimer = 0;

    // Update coyote time: reset when grounded, decay when airborne
    if (playerData.grounded || playerData.steepSlope) {
      playerData.coyoteTimer = COYOTE_TIME;
      playerData.hasJumped = false;
    } else {
      playerData.coyoteTimer = Math.max(0, playerData.coyoteTimer - dt);
    }

    // Update jump buffer: set when jump pressed, decay over time
    if (input.jump && !playerData.wasJumpPressed) {
      playerData.jumpBufferTimer = JUMP_BUFFER_TIME;
    }
    playerData.wasJumpPressed = input.jump;
    playerData.jumpBufferTimer = Math.max(0, playerData.jumpBufferTimer - dt);

    // Allow jumping if:
    // - Jump buffer is active (recently pressed jump)
    // - Coyote time is active (recently left ground)
    // - Haven't already used the jump
    const canCoyoteJump = playerData.coyoteTimer > 0;
    const hasBufferedJump = playerData.jumpBufferTimer > 0;

    if (hasBufferedJump && canCoyoteJump && !playerData.hasJumped) {
      let jumpSpeed = playerData.jumpSpeed;
      let jumpNormal = createVector(0, 1, 0); // Default: jump straight up

      if (playerData.grounded && playerData.groundNormal) {
        jumpNormal = playerData.groundNormal.copy();

        // If moving forward, reduce jump power when going uphill
        if (input.forward !== 0) {
          const yawRad = radians(-rot.y);
          const forwardX = sin(yawRad);
          const forwardZ = cos(yawRad);

          const slopeX = -jumpNormal.x;
          const slopeZ = -jumpNormal.z;
          const slopeMag = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

          if (slopeMag > 0.01) {
            const dot = (forwardX * slopeX + forwardZ * slopeZ) / slopeMag;

            // If moving uphill (dot * forward > 0), reduce jump power
            if (dot * input.forward > 0) {
              const slopeAngle = Math.acos(Math.max(0, Math.min(1, jumpNormal.y)));
              // Aggressive reduction: 0° = 100%, 45° = 60%, 90° = 20%
              const angleFactor = slopeAngle / (Math.PI / 2);
              const jumpMultiplier = Math.max(0.2, 1.0 - (angleFactor * 0.8));
              jumpSpeed *= jumpMultiplier;
            }
          }
        }
      }

      // Apply jump along slope normal (perpendicular to surface)
      vel.x += jumpNormal.x * jumpSpeed;
      vel.y += jumpNormal.y * jumpSpeed;
      vel.z += jumpNormal.z * jumpSpeed;

      playerData.hasJumped = true;
      playerData.grounded = false;
      playerData.jumpBufferTimer = 0; // Consume the buffered jump
      playerData.coyoteTimer = 0; // Consume coyote time
    }
  });
};
