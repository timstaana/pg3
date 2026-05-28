// server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const os = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('.'));
app.get('/health', (_req, res) => res.status(200).send('OK'));

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
  console.log(`Server on :${PORT}  ws://${ip}:${PORT}`);
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

// rooms: Map<roomName, Map<playerId, { ws, state }>>
const rooms = new Map();

// ── Server tick: broadcast authoritative world state every 50 ms ──────────
setInterval(() => {
  rooms.forEach(players => {
    if (players.size < 2) return; // nothing useful to broadcast alone

    const snapshot = {};
    players.forEach((c, id) => { if (c.state) snapshot[id] = c.state; });
    if (!Object.keys(snapshot).length) return;

    const msg = JSON.stringify({ type: 'update', players: snapshot });
    players.forEach(c => {
      if (c.ws.readyState === 1) c.ws.send(msg);
    });
  });
}, 50);

// ── Connections ───────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let playerId = null;
  let room     = null;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {

        case 'join': {
          playerId = msg.id;
          room     = msg.room || 'default';

          if (!rooms.has(room)) rooms.set(room, new Map());
          const players = rooms.get(room);

          const state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, skin: msg.skin };

          // Snapshot of existing players for the welcome message
          const welcome = {};
          players.forEach((c, id) => { if (id !== playerId && c.state) welcome[id] = c.state; });

          // Register player (overwrites stale entry from quick-reconnect)
          players.set(playerId, { ws, state });

          ws.send(JSON.stringify({ type: 'welcome', you: playerId, players: welcome }));
          broadcast(room, { type: 'join', id: playerId, ...state }, playerId);

          console.log(`${playerId.slice(-6)} joined ${room} (${players.size})`);
          break;
        }

        case 'mv': {
          if (!room || !playerId) break;
          const c = rooms.get(room)?.get(playerId);
          if (c) c.state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, skin: msg.skin };
          break;
        }

        case 'emote': {
          if (room && playerId) {
            broadcast(room, { type: 'emote', wx: msg.wx, wy: msg.wy, wz: msg.wz, emoteId: msg.emoteId }, playerId);
          }
          break;
        }
      }
    } catch (err) {
      console.error('msg error:', err);
    }
  });

  ws.on('close', () => {
    if (!room || !playerId) return;
    // Only act if this ws is still the current one (guards against quick-reconnect race)
    const current = rooms.get(room)?.get(playerId);
    if (!current || current.ws !== ws) return;

    rooms.get(room).delete(playerId);
    broadcast(room, { type: 'leave', id: playerId });

    const remaining = rooms.get(room)?.size ?? 0;
    console.log(`${playerId.slice(-6)} left ${room} (${remaining})`);
    if (remaining === 0) rooms.delete(room);
  });

  ws.on('error', () => {});
});

// Heartbeat: terminate stale connections every 30 s
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

function broadcast(roomName, message, excludeId = null) {
  const players = rooms.get(roomName);
  if (!players) return;
  const data = JSON.stringify(message);
  players.forEach((c, id) => {
    if (id !== excludeId && c.ws.readyState === 1) {
      try { c.ws.send(data); } catch {}
    }
  });
}

process.on('SIGTERM', () => server.close(() => process.exit(0)));
