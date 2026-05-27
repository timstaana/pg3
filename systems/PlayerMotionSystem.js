// PlayerMotionSystem.js — Input → velocity, coyote jump, slope modifiers
//
// Optimisation: yawRad / sinYaw / cosYaw are computed ONCE after the turn
// update and reused by the slope check, movement, and jump code.

const COYOTE_TIME      = 0.1;   // seconds of grace after leaving ground
const JUMP_BUFFER_TIME = 0.15;  // seconds to buffer a pre-landing jump press

const PlayerMotionSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Velocity', 'Transform');

  for (const player of players) {
    const { Input: input, Velocity: { vel }, Player: pd, Transform: { rot } } = player;

    // ── Turn
    rot.y += input.turn * pd.turnSpeed * dt;

    // ── Heading — computed ONCE, shared everywhere below
    const yawRad = radians(-rot.y);
    const sinYaw = sin(yawRad);
    const cosYaw = cos(yawRad);

    // ── Slope-based speed modifier (uphill = slower)
    let speedMod = 1.0;

    if (input.forward !== 0 && (pd.grounded || pd.steepSlope)) {
      const normal = pd.grounded ? pd.groundNormal : pd.steepSlope;

      if (normal) {
        const slopeX   = -normal.x;
        const slopeZ   = -normal.z;
        const slopeMag = Math.sqrt(slopeX*slopeX + slopeZ*slopeZ);

        if (slopeMag > 0.01) {
          const dot = (sinYaw*slopeX + cosYaw*slopeZ) / slopeMag;

          if (dot * input.forward > 0) { // moving uphill
            const angle      = Math.acos(Math.max(0, Math.min(1, normal.y)));
            const slopeFactor = 1.0 - Math.pow(angle / (Math.PI / 2), 1.5);
            speedMod = Math.max(0.2, slopeFactor);
          }
        }
      }
    }

    // ── Horizontal velocity
    const speed = input.forward * pd.moveSpeed * speedMod;
    vel.x = sinYaw * speed;
    vel.z = cosYaw * speed;

    // ── Coyote time
    if (pd.coyoteTimer      === undefined) pd.coyoteTimer      = 0;
    if (pd.jumpBufferTimer  === undefined) pd.jumpBufferTimer  = 0;

    if (pd.grounded || pd.steepSlope) {
      pd.coyoteTimer = COYOTE_TIME;
      pd.hasJumped   = false;
    } else {
      pd.coyoteTimer = Math.max(0, pd.coyoteTimer - dt);
    }

    // ── Jump buffer
    if (input.jump && !pd.wasJumpPressed) pd.jumpBufferTimer = JUMP_BUFFER_TIME;
    pd.wasJumpPressed  = input.jump;
    pd.jumpBufferTimer = Math.max(0, pd.jumpBufferTimer - dt);

    // ── Jump execution (coyote + buffered input)
    if (pd.jumpBufferTimer > 0 && pd.coyoteTimer > 0 && !pd.hasJumped) {
      let jumpSpeed  = pd.jumpSpeed;
      let jnx = 0, jny = 1, jnz = 0; // default: jump straight up

      if (pd.grounded && pd.groundNormal) {
        jnx = pd.groundNormal.x;
        jny = pd.groundNormal.y;
        jnz = pd.groundNormal.z;

        // Reduce jump power when running uphill
        if (input.forward !== 0) {
          const slopeX   = -jnx, slopeZ = -jnz;
          const slopeMag = Math.sqrt(slopeX*slopeX + slopeZ*slopeZ);

          if (slopeMag > 0.01) {
            const dot = (sinYaw*slopeX + cosYaw*slopeZ) / slopeMag; // reuse sinYaw/cosYaw

            if (dot * input.forward > 0) {
              const angle      = Math.acos(Math.max(0, Math.min(1, jny)));
              const factor     = angle / (Math.PI / 2);
              jumpSpeed       *= Math.max(0.2, 1.0 - factor * 0.8);
            }
          }
        }
      }

      vel.x += jnx * jumpSpeed;
      vel.y += jny * jumpSpeed;
      vel.z += jnz * jumpSpeed;

      pd.hasJumped       = true;
      pd.grounded        = false;
      pd.jumpBufferTimer = 0;
      pd.coyoteTimer     = 0;
    }
  }
};
