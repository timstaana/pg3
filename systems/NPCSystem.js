// NPCSystem.js — Child-like NPC AI: wander · flee · follow · jumpy
//
// Multiplayer sync: the server designates one connected client as "NPC host".
// The host runs the full simulation and broadcasts state at 20 Hz.
// All other clients just lerp NPCs toward the received positions.
// Solo play (no multiplayer): _isNPCHost stays true, simulation runs locally.

const NPC_RADIUS       = 0.25;
const NPC_WALK_SPEED   = 3.8;
const NPC_FLEE_SPEED   = 5.8;
const NPC_FOLLOW_SPEED = 4.2;
const NPC_TURN_RATE    = 180; // deg/sec
const NPC_JUMP_SPEED   = Math.sqrt(2 * 30 * 1.5 * 0.55);
const NPC_SYNC_S       = 0.05; // broadcast interval (20 Hz)

// Spawn definitions — one entity per entry
const NPC_DEFS = [
  { x:  4,  z: -3 },
  { x: -5,  z:  1 },
  { x:  2,  z:  5 },
];

// ── Sync state ─────────────────────────────────────────────────────────────────

let _isNPCHost    = true;  // true = run simulation; false = lerp from server
let _npcSendTimer = 0;

const becomeNPCHost = (isHost) => {
  const wasHost = _isNPCHost;
  _isNPCHost = isHost;
  // Snap to last received positions when taking over as host mid-game
  if (isHost && !wasHost && typeof world !== 'undefined') {
    for (const e of queryEntities(world, 'NPC', 'Transform')) {
      e.Transform.pos.set(e.NPC.targetPos.x, e.NPC.targetPos.y, e.NPC.targetPos.z);
      e.NPC.vel.set(0, 0, 0);
      e.NPC.grounded = false;
    }
  }
};

const updateNPCStates = (states) => {
  if (_isNPCHost || typeof world === 'undefined') return;
  const npcs = queryEntities(world, 'NPC');
  for (const s of states) {
    const e = npcs.find(n => n.NPC.npcIndex === s.id);
    if (!e) continue;
    e.NPC.targetPos.set(s.x, s.y, s.z);
    e.NPC.targetYaw       = s.yaw;
    e.Animation.currentFrame = s.frame;
  }
};

// ── Math helpers ───────────────────────────────────────────────────────────────

const _yawToward = (dx, dz) => Math.atan2(-dx, dz) * 180 / Math.PI;

const _turnToward = (npc, targetYaw, dt) => {
  let diff = targetYaw - npc.yaw;
  while (diff >  180) diff -= 360;
  while (diff < -180) diff += 360;
  npc.yaw += Math.sign(diff) * Math.min(Math.abs(diff), NPC_TURN_RATE * dt);
};

const _walkVel = (npc, speed) => {
  const rad = npc.yaw * Math.PI / 180;
  return { x: -Math.sin(rad) * speed, z: Math.cos(rad) * speed };
};

// ── Behaviors ──────────────────────────────────────────────────────────────────

const _wander = (npc, pos, vel, dt) => {
  if (!npc.wanderTarget || npc.wanderArrived) {
    npc.wanderTarget  = { x: random(-10, 10), z: random(-10, 10) };
    npc.wanderArrived = false;
  }
  const dx = npc.wanderTarget.x - pos.x;
  const dz = npc.wanderTarget.z - pos.z;
  const d  = Math.hypot(dx, dz);
  if (d < 1.0) { npc.wanderArrived = true; vel.x = 0; vel.z = 0; return; }
  _turnToward(npc, _yawToward(dx, dz), dt);
  const v = _walkVel(npc, NPC_WALK_SPEED * Math.min(d * 0.4, 1.0));
  vel.x = v.x; vel.z = v.z;
};

const _flee = (npc, pos, vel, targetPos, dt) => {
  if (!targetPos) { vel.x = 0; vel.z = 0; return; }
  const dx = pos.x - targetPos.x, dz = pos.z - targetPos.z;
  if (Math.hypot(dx, dz) > 11) { vel.x = 0; vel.z = 0; return; }
  _turnToward(npc, _yawToward(dx, dz), dt);
  const v = _walkVel(npc, NPC_FLEE_SPEED);
  vel.x = v.x; vel.z = v.z;
};

const _follow = (npc, pos, vel, targetPos, dt) => {
  if (!targetPos) { vel.x = 0; vel.z = 0; return; }
  const dx = targetPos.x - pos.x, dz = targetPos.z - pos.z;
  const d  = Math.hypot(dx, dz);
  if (d < 2.2) { vel.x = 0; vel.z = 0; return; }
  _turnToward(npc, _yawToward(dx, dz), dt);
  const v = _walkVel(npc, Math.min(NPC_FOLLOW_SPEED, d * 1.5));
  vel.x = v.x; vel.z = v.z;
};

const _jumpy = (npc, vel, dt) => {
  npc.jumpTimer -= dt;
  if (npc.grounded && npc.jumpTimer <= 0) {
    npc.pendingJump = NPC_JUMP_SPEED;
    npc.yaw        += (Math.random() - 0.5) * 130;
    npc.jumpTimer   = 0.22 + Math.random() * 0.45;
  }
  const v = _walkVel(npc, NPC_WALK_SPEED * 0.85);
  vel.x = v.x; vel.z = v.z;
};

// ── Ground lookahead ───────────────────────────────────────────────────────────

const _hasGroundAhead = (x, y, z, collWorld, maxDrop = 1.8) => {
  for (const tri of collWorld.tris) {
    if (tri.normal.y < MIN_GROUND_NY) continue;
    const { aabb } = tri;
    if (x < aabb.minX || x > aabb.maxX || z < aabb.minZ || z > aabb.maxZ) continue;
    if (aabb.maxY > y + 0.05) continue;
    const { a, b, c } = tri;
    const e1x = b.x-a.x, e1y = b.y-a.y, e1z = b.z-a.z;
    const e2x = c.x-a.x, e2y = c.y-a.y, e2z = c.z-a.z;
    const det = e1z*e2x - e1x*e2z;
    if (Math.abs(det) < 1e-8) continue;
    const f  = 1 / det;
    const sx = x-a.x, sy = y-a.y, sz = z-a.z;
    const u  = f * (sz*e2x - sx*e2z);
    if (u < 0 || u > 1) continue;
    const v  = -f * (sz*e1x - sx*e1z);
    if (v < 0 || u+v > 1) continue;
    const t  = f * (e2x*(sy*e1z-sz*e1y) + e2y*(sz*e1x-sx*e1z) + e2z*(sx*e1y-sy*e1x));
    if (t > 1e-4 && t < maxDrop) return true;
  }
  return false;
};

// ── Collision ──────────────────────────────────────────────────────────────────

const _collide = (npc, pos, vel, collisionWorld) => {
  npc.grounded = false;
  const cands = queryTrianglesNearPlayer(collisionWorld, pos, npc.radius, COLLISION_CONFIG, vel);
  for (let iter = 0; iter < 3; iter++) {
    let groundContact = null, groundY = -Infinity, hadCollision = false;
    for (const tri of cands) {
      if (!tri.isBox) {
        const dx = pos.x-tri.a.x, dy = pos.y-tri.a.y, dz = pos.z-tri.a.z;
        if (dx*tri.normal.x + dy*tri.normal.y + dz*tri.normal.z <= 0) continue;
      }
      const c = sphereVsTriangle(pos, npc.radius + GROUNDING_TOLERANCE, tri);
      if (!c) continue;
      if (c.depth > GROUNDING_TOLERANCE) {
        hadCollision = true;
        const d = c.depth - GROUNDING_TOLERANCE;
        pos.x += c.normal.x*d; pos.y += c.normal.y*d; pos.z += c.normal.z*d;
      }
      if (c.normal.y >= MIN_GROUND_NY && c.point.y > groundY) {
        groundContact = c; groundY = c.point.y;
      } else if (c.normal.y < MIN_GROUND_NY) {
        const dot = vel.x*c.normal.x + vel.y*c.normal.y + vel.z*c.normal.z;
        if (dot < 0) { vel.x -= c.normal.x*dot; vel.y -= c.normal.y*dot; vel.z -= c.normal.z*dot; }
      }
    }
    if (groundContact) {
      npc.grounded = true;
      const dot = vel.x*groundContact.normal.x + vel.y*groundContact.normal.y + vel.z*groundContact.normal.z;
      if (dot < 0) { vel.x -= groundContact.normal.x*dot; vel.y -= groundContact.normal.y*dot; vel.z -= groundContact.normal.z*dot; }
    }
    if (!hadCollision) break;
  }
};

// ── Main system ────────────────────────────────────────────────────────────────

const NPCSystem = (world, collisionWorld, dt) => {
  const npcs    = queryEntities(world, 'NPC', 'Transform', 'Animation');
  const players = queryEntities(world, 'Player', 'Transform');

  // ── Non-host: lerp toward positions broadcast by the host ──────────────────
  if (!_isNPCHost) {
    for (const entity of npcs) {
      const { NPC: npc, Transform: tf } = entity;
      const f = Math.min(1, 12 * dt);
      tf.pos.lerp(npc.targetPos, f);
      let yd = npc.targetYaw - tf.rot.y;
      while (yd >  180) yd -= 360;
      while (yd < -180) yd += 360;
      tf.rot.y += yd * f;
      npc.yaw   = tf.rot.y;
    }
    return;
  }

  // ── Host: full simulation ──────────────────────────────────────────────────
  for (const entity of npcs) {
    const { NPC: npc, Transform: tf, Animation: anim } = entity;
    const vel = npc.vel;

    // Behavior timer
    npc.behaviorTimer -= dt;
    if (npc.behaviorTimer <= 0) {
      const pool = ['wander', 'wander', 'flee', 'follow', 'jumpy'];
      npc.behavior      = pool[Math.floor(Math.random() * pool.length)];
      npc.behaviorTimer = 5 + Math.random() * 9;
      npc.wanderArrived = true;
    }

    // Nearest player (for flee/follow)
    let nearestPos = null, nearestDist = Infinity;
    for (const p of players) {
      const d = tf.pos.dist(p.Transform.pos);
      if (d < nearestDist) { nearestDist = d; nearestPos = p.Transform.pos; }
    }
    if (npc.grounded && nearestDist < 4.0 &&
        npc.behavior !== 'flee' && npc.behavior !== 'follow') {
      npc.behavior      = Math.random() < 0.65 ? 'flee' : 'follow';
      npc.behaviorTimer = 4 + Math.random() * 5;
    }

    // Execute behavior
    npc.pendingJump = 0;
    switch (npc.behavior) {
      case 'wander': _wander(npc, tf.pos, vel, dt);             break;
      case 'flee':   _flee  (npc, tf.pos, vel, nearestPos, dt); break;
      case 'follow': _follow(npc, tf.pos, vel, nearestPos, dt); break;
      case 'jumpy':  _jumpy (npc, vel, dt);                     break;
    }

    // Edge avoidance
    npc.edgeCooldown = Math.max(0, npc.edgeCooldown - dt);
    if (npc.grounded && npc.edgeCooldown <= 0) {
      const hSpeed = Math.hypot(vel.x, vel.z);
      if (hSpeed > 0.1) {
        const nx = vel.x / hSpeed, nz = vel.z / hSpeed;
        if (!_hasGroundAhead(tf.pos.x + nx * 0.8, tf.pos.y, tf.pos.z + nz * 0.8, collisionWorld)) {
          npc.yaw          += 150 + Math.random() * 60;
          npc.wanderArrived = true;
          vel.x = 0; vel.z = 0;
          npc.edgeCooldown  = 0.4;
        }
      }
    }

    // Gravity
    if (npc.grounded) { vel.y = 0; }
    else { vel.y -= GRAVITY * dt; if (vel.y < -TERMINAL_VELOCITY) vel.y = -TERMINAL_VELOCITY; }

    if (npc.pendingJump > 0) { vel.y = npc.pendingJump; npc.grounded = false; }

    // Integrate
    tf.pos.x += vel.x * dt;
    tf.pos.y += vel.y * dt;
    tf.pos.z += vel.z * dt;

    // Collision
    _collide(npc, tf.pos, vel, collisionWorld);

    // Player push
    for (const p of players) {
      const pp = p.Transform.pos;
      const dx = tf.pos.x-pp.x, dy = tf.pos.y-pp.y, dz = tf.pos.z-pp.z;
      const distSq = dx*dx + dy*dy + dz*dz;
      const minDist = npc.radius + PLAYER_RADIUS;
      if (distSq < minDist*minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const nx = dx/dist, ny = dy/dist, nz = dz/dist;
        const overlap = minDist - dist;
        tf.pos.x += nx*overlap; tf.pos.y += ny*overlap; tf.pos.z += nz*overlap;
        const push = Math.max(2.5, Math.hypot(vel.x, vel.z) + 3);
        vel.x += nx*push; vel.z += nz*push;
        if (npc.grounded) vel.y = 2.8;
        npc.grounded = false;
      }
    }

    // NPC-to-NPC separation
    for (const other of npcs) {
      if (other === entity) continue;
      const ox = tf.pos.x-other.Transform.pos.x;
      const oy = tf.pos.y-other.Transform.pos.y;
      const oz = tf.pos.z-other.Transform.pos.z;
      const distSq = ox*ox + oy*oy + oz*oz;
      const minDist = npc.radius + other.NPC.radius;
      if (distSq < minDist*minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) * 0.5;
        const nx = ox/dist, nz = oz/dist;
        tf.pos.x += nx*overlap; tf.pos.z += nz*overlap;
        vel.x += nx*1.2; vel.z += nz*1.2;
      }
    }

    tf.rot.y = npc.yaw;

    // Animation
    const hSpeed = Math.hypot(vel.x, vel.z);
    if (hSpeed > 0.15) {
      const fps = anim.framesPerSecond * Math.max(hSpeed / NPC_WALK_SPEED, 0.4);
      anim.frameTime += dt;
      if (anim.frameTime >= 1 / fps) {
        anim.frameTime   -= 1 / fps;
        anim.currentFrame = (anim.currentFrame + 1) % anim.totalFrames;
      }
    } else {
      anim.currentFrame = 0; anim.frameTime = 0;
    }

    // Respawn
    if (tf.pos.y < DEATH_PLANE_Y) {
      tf.pos.set(random(-8, 8), 2.0, random(-8, 8));
      vel.set(0, 0, 0); npc.grounded = false;
    }

    // Keep targetPos in sync (used if this client loses host role mid-game)
    npc.targetPos.set(tf.pos.x, tf.pos.y, tf.pos.z);
    npc.targetYaw = npc.yaw;
  }

  // Broadcast NPC state to other clients
  _npcSendTimer -= dt;
  if (_npcSendTimer <= 0) {
    _npcSendTimer = NPC_SYNC_S;
    sendNPCUpdate(npcs.map(e => ({
      id:    e.NPC.npcIndex,
      x:     +e.Transform.pos.x.toFixed(2),
      y:     +e.Transform.pos.y.toFixed(2),
      z:     +e.Transform.pos.z.toFixed(2),
      yaw:   +e.NPC.yaw.toFixed(1),
      frame: e.Animation.currentFrame,
    })));
  }
};

// ── Public API ─────────────────────────────────────────────────────────────────

const spawnNPCs = (world) => {
  NPC_DEFS.forEach((def, i) => {
    createEntity(world, {
      Transform: {
        pos:   createVector(def.x, 2.0, def.z),
        rot:   createVector(0, random(360), 0),
        scale: createVector(1, 1, 1),
      },
      Animation: {
        currentFrame: 0, frameTime: 0, framesPerSecond: 6, totalFrames: 3,
      },
      NPC: {
        vel:           createVector(0, 0, 0),
        yaw:           random(360),
        behavior:      'wander',
        behaviorTimer: random(1, 4),
        wanderTarget:  null,
        wanderArrived: true,
        grounded:      false,
        jumpTimer:     0,
        pendingJump:   0,
        edgeCooldown:  0,
        radius:        NPC_RADIUS,
        npcIndex:      i,
        targetPos:     createVector(def.x, 2.0, def.z),
        targetYaw:     0,
      },
    });
  });
};
