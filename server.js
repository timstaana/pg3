// server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const os = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('.'));
app.get('/health', (_, res) => res.status(200).send('OK'));

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`Server :${PORT}  ws://${ip}:${PORT}`);
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

// Single global player pool — no rooms, everyone shares one world.
const players = new Map(); // id → { ws, state }

// ── Server-side NPC simulation ────────────────────────────────────────────
const SRV_NPC_Y          = 0.25; // radius above ground so sprite feet sit at y≈0
const SRV_NPC_BOUNDS     = 13;
const SRV_NPC_RADIUS     = 0.25;
const SRV_NPC_WALK_SPEED = 3.8;
const SRV_NPC_FLEE_SPEED = 5.8;
const SRV_NPC_FOL_SPEED  = 4.2;
const SRV_NPC_TURN_RATE  = 180;

const _npcs = [
  { x:  4, y: SRV_NPC_Y, z: -3, yaw:   0, behavior: 'wander', behaviorTimer: 2, wanderTarget: null, wanderArrived: true, jumpPhase: 0,              edgeCooldown: 0, frame: 0, frameTime: 0 },
  { x: -5, y: SRV_NPC_Y, z:  1, yaw:  90, behavior: 'wander', behaviorTimer: 3, wanderTarget: null, wanderArrived: true, jumpPhase: Math.PI / 2,    edgeCooldown: 0, frame: 0, frameTime: 0 },
  { x:  2, y: SRV_NPC_Y, z:  5, yaw: 180, behavior: 'wander', behaviorTimer: 1, wanderTarget: null, wanderArrived: true, jumpPhase: Math.PI,        edgeCooldown: 0, frame: 0, frameTime: 0 },
];

const _npcYaw  = (dx, dz) => Math.atan2(-dx, dz) * 180 / Math.PI;
const _npcTurn = (npc, targetYaw, dt) => {
  let d = targetYaw - npc.yaw;
  while (d >  180) d -= 360;
  while (d < -180) d += 360;
  npc.yaw += Math.sign(d) * Math.min(Math.abs(d), SRV_NPC_TURN_RATE * dt);
};

const _npcTick = (dt) => {
  const pp = [];
  players.forEach(c => { if (c.state) pp.push(c.state); });

  for (let i = 0; i < _npcs.length; i++) {
    const npc = _npcs[i];

    npc.behaviorTimer -= dt;
    if (npc.behaviorTimer <= 0) {
      const pool = ['wander', 'wander', 'flee', 'follow', 'jumpy'];
      npc.behavior      = pool[Math.floor(Math.random() * pool.length)];
      npc.behaviorTimer = 5 + Math.random() * 9;
      npc.wanderArrived = true;
    }

    let nearPlayer = null, nearDist = Infinity;
    for (const p of pp) {
      const d = Math.hypot(npc.x - p.x, npc.z - p.z);
      if (d < nearDist) { nearDist = d; nearPlayer = p; }
    }
    if (nearDist < 4.0 && npc.behavior !== 'flee' && npc.behavior !== 'follow') {
      npc.behavior      = Math.random() < 0.65 ? 'flee' : 'follow';
      npc.behaviorTimer = 4 + Math.random() * 5;
    }

    let vx = 0, vz = 0;
    switch (npc.behavior) {
      case 'wander': {
        if (!npc.wanderTarget || npc.wanderArrived) {
          npc.wanderTarget  = { x: (Math.random()-0.5)*20, z: (Math.random()-0.5)*20 };
          npc.wanderArrived = false;
        }
        const dx = npc.wanderTarget.x - npc.x, dz = npc.wanderTarget.z - npc.z;
        const d  = Math.hypot(dx, dz);
        if (d < 1.0) { npc.wanderArrived = true; break; }
        _npcTurn(npc, _npcYaw(dx, dz), dt);
        const spd = SRV_NPC_WALK_SPEED * Math.min(d * 0.4, 1.0);
        const rad = npc.yaw * Math.PI / 180;
        vx = -Math.sin(rad) * spd; vz = Math.cos(rad) * spd;
        break;
      }
      case 'flee': {
        if (nearPlayer && Math.hypot(npc.x-nearPlayer.x, npc.z-nearPlayer.z) < 11) {
          _npcTurn(npc, _npcYaw(npc.x-nearPlayer.x, npc.z-nearPlayer.z), dt);
          const rad = npc.yaw * Math.PI / 180;
          vx = -Math.sin(rad) * SRV_NPC_FLEE_SPEED; vz = Math.cos(rad) * SRV_NPC_FLEE_SPEED;
        }
        break;
      }
      case 'follow': {
        if (nearPlayer) {
          const dx = nearPlayer.x-npc.x, dz = nearPlayer.z-npc.z, d = Math.hypot(dx, dz);
          if (d > 2.2) {
            _npcTurn(npc, _npcYaw(dx, dz), dt);
            const rad = npc.yaw * Math.PI / 180;
            const spd = Math.min(SRV_NPC_FOL_SPEED, d * 1.5);
            vx = -Math.sin(rad) * spd; vz = Math.cos(rad) * spd;
          }
        }
        break;
      }
      case 'jumpy': {
        npc.jumpPhase += dt * 3.5;
        npc.y  = SRV_NPC_Y + Math.max(0, Math.sin(npc.jumpPhase) * 0.9);
        npc.yaw += (Math.random()-0.5) * 60 * dt;
        const rad = npc.yaw * Math.PI / 180;
        vx = -Math.sin(rad) * SRV_NPC_WALK_SPEED * 0.85;
        vz =  Math.cos(rad) * SRV_NPC_WALK_SPEED * 0.85;
        break;
      }
    }
    if (npc.behavior !== 'jumpy') npc.y = SRV_NPC_Y;

    // Edge avoidance
    npc.edgeCooldown = Math.max(0, npc.edgeCooldown - dt);
    const hSpd = Math.hypot(vx, vz);
    if (npc.edgeCooldown <= 0 && hSpd > 0.1) {
      const ax = npc.x + (vx/hSpd) * 0.8, az = npc.z + (vz/hSpd) * 0.8;
      if (Math.abs(ax) > SRV_NPC_BOUNDS || Math.abs(az) > SRV_NPC_BOUNDS) {
        npc.yaw += 150 + Math.random() * 60;
        npc.wanderArrived = true;
        vx = 0; vz = 0;
        npc.edgeCooldown = 0.4;
      }
    }

    npc.x = Math.max(-SRV_NPC_BOUNDS, Math.min(SRV_NPC_BOUNDS, npc.x + vx * dt));
    npc.z = Math.max(-SRV_NPC_BOUNDS, Math.min(SRV_NPC_BOUNDS, npc.z + vz * dt));

    // NPC-to-NPC separation
    for (let j = 0; j < _npcs.length; j++) {
      if (i === j) continue;
      const o = _npcs[j];
      const dx = npc.x-o.x, dz = npc.z-o.z, distSq = dx*dx+dz*dz;
      const minD = SRV_NPC_RADIUS * 2;
      if (distSq < minD*minD && distSq > 0.0001) {
        const dist = Math.sqrt(distSq), ov = (minD-dist)*0.5;
        npc.x += (dx/dist)*ov; npc.z += (dz/dist)*ov;
      }
    }

    // Animation frame
    if (hSpd > 0.15) {
      const fps = 6 * Math.max(hSpd / SRV_NPC_WALK_SPEED, 0.4);
      npc.frameTime += dt;
      if (npc.frameTime >= 1/fps) { npc.frameTime -= 1/fps; npc.frame = (npc.frame+1)%3; }
    } else { npc.frame = 0; npc.frameTime = 0; }
  }
};

// ── Server tick: run NPC AI + broadcast world state every 50 ms ──────────
setInterval(() => {
  _npcTick(0.05);
  if (players.size === 0) return;

  const npcSnapshot = _npcs.map((n, i) => ({
    id: i, x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2),
    yaw: +n.yaw.toFixed(1), frame: n.frame,
  }));

  const playerSnapshot = {};
  players.forEach((c, id) => { if (c.state) playerSnapshot[id] = c.state; });

  const msg = JSON.stringify({ type: 'update', players: playerSnapshot, npcs: npcSnapshot });
  players.forEach(c => { if (c.ws.readyState === 1) c.ws.send(msg); });
}, 50);

// ── Connections ───────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let playerId = null;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {

        case 'join': {
          playerId = msg.id;
          const state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, skin: msg.skin };

          const welcome = {};
          players.forEach((c, id) => { if (id !== playerId && c.state) welcome[id] = c.state; });

          // Register (overwrites stale entry from quick-reconnect)
          players.set(playerId, { ws, state });

          const npcSnapshot = _npcs.map((n, i) => ({
            id: i, x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2),
            yaw: +n.yaw.toFixed(1), frame: n.frame,
          }));
          ws.send(JSON.stringify({ type: 'welcome', players: welcome, npcs: npcSnapshot }));
          broadcast({ type: 'join', id: playerId, ...state }, playerId);

          console.log(`+ ${playerId.slice(-8)} joined (${players.size} online)`);
          break;
        }

        case 'mv': {
          const c = players.get(playerId);
          if (c) c.state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, skin: msg.skin };
          break;
        }

        case 'emote': {
          if (playerId) broadcast({ type: 'emote', wx: msg.wx, wy: msg.wy, wz: msg.wz, emoteId: msg.emoteId }, playerId);
          break;
        }
      }
    } catch (err) { console.error('msg err:', err.message); }
  });

  ws.on('close', () => {
    if (!playerId) return;
    const cur = players.get(playerId);
    if (!cur || cur.ws !== ws) return; // stale close after quick reconnect
    players.delete(playerId);
    broadcast({ type: 'leave', id: playerId });
    console.log(`- ${playerId.slice(-8)} left  (${players.size} online)`);
  });

  ws.on('error', () => {});
});

// Heartbeat: kill silent connections every 30 s
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function broadcast(message, excludeId = null) {
  const data = JSON.stringify(message);
  players.forEach((c, id) => {
    if (id !== excludeId && c.ws.readyState === 1) {
      try { c.ws.send(data); } catch {}
    }
  });
}

process.on('SIGTERM', () => server.close(() => process.exit(0)));
