// NPCSystem.js — client-side lerp renderer for server-simulated NPCs.

const NPC_RADIUS = 0.25;

const NPC_DEFS = [
  { x:  4, z: -3 },
  { x: -5, z:  1 },
  { x:  2, z:  5 },
];

const updateNPCStates = (states) => {
  if (typeof world === 'undefined') return;
  const npcs = queryEntities(world, 'NPC');
  for (const s of states) {
    const e = npcs.find(n => n.NPC.npcIndex === s.id);
    if (!e) continue;
    const dx = s.x - e.NPC.targetPos.x, dz = s.z - e.NPC.targetPos.z;
    if (dx*dx + dz*dz > 16) e.Transform.pos.set(s.x, s.y, s.z); // snap on teleport/respawn
    e.NPC.targetPos.set(s.x, s.y, s.z);
    e.NPC.targetYaw       = s.yaw;
    e.Animation.currentFrame = s.frame;
  }
};

const NPCSystem = (world, _collisionWorld, dt) => {
  for (const entity of queryEntities(world, 'NPC', 'Transform', 'Animation')) {
    const { NPC: npc, Animation: anim, Transform: tf } = entity;
    const f = Math.min(1, 12 * dt);
    tf.pos.lerp(npc.targetPos, f);
    let yd = npc.targetYaw - tf.rot.y;
    while (yd >  180) yd -= 360;
    while (yd < -180) yd += 360;
    tf.rot.y += yd * f;

    const moving = anim.currentFrame !== 0;
    if (moving) {
      anim.bobPhase = ((anim.bobPhase || 0) + dt * anim.framesPerSecond * Math.PI) % (Math.PI * 2);
    } else {
      anim.bobPhase = 0;
    }
  }
};

const spawnNPCs = (world) => {
  NPC_DEFS.forEach((def, i) => {
    createEntity(world, {
      Transform: {
        pos:   createVector(def.x, 0.1, def.z),
        rot:   createVector(0, 0, 0),
        scale: createVector(1, 1, 1),
      },
      Animation: {
        currentFrame: 0, frameTime: 0, framesPerSecond: 6, totalFrames: 3,
      },
      NPC: {
        radius:    NPC_RADIUS,
        npcIndex:  i,
        targetPos: createVector(def.x, 0.1, def.z),
        targetYaw: 0,
      },
    });
  });
};
