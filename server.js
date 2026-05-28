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

let npcHostId = null; // playerId of the client running NPC simulation

const _assignNPCHost = () => {
  npcHostId = null;
  for (const [id, c] of players) {
    if (c.ws.readyState === 1) { npcHostId = id; break; }
  }
  broadcast({ type: 'npc_host', id: npcHostId });
};

// ── Server tick: broadcast authoritative world state every 50 ms ──────────
setInterval(() => {
  if (players.size < 2) return;
  const snapshot = {};
  players.forEach((c, id) => { if (c.state) snapshot[id] = c.state; });
  if (!Object.keys(snapshot).length) return;
  const msg = JSON.stringify({ type: 'update', players: snapshot });
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

          // Welcome: snapshot of everyone already here + current NPC host
          const welcome = {};
          players.forEach((c, id) => { if (id !== playerId && c.state) welcome[id] = c.state; });

          // Register (overwrites stale entry from quick-reconnect)
          players.set(playerId, { ws, state });

          ws.send(JSON.stringify({ type: 'welcome', players: welcome, npcHost: npcHostId }));
          broadcast({ type: 'join', id: playerId, ...state }, playerId);

          // Assign NPC host if nobody has it yet
          if (!npcHostId) _assignNPCHost();

          console.log(`+ ${playerId.slice(-8)} joined (${players.size} online)`);
          break;
        }

        case 'mv': {
          const c = players.get(playerId);
          if (c) c.state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, skin: msg.skin };
          break;
        }

        case 'npc_update': {
          // Relay NPC state from host to all other players
          if (playerId && playerId === npcHostId) {
            broadcast({ type: 'npc_update', npcs: msg.npcs }, playerId);
          }
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
    // Hand off NPC host role if the host disconnected
    if (playerId === npcHostId) _assignNPCHost();
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
