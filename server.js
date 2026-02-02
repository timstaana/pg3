// server.js - Lightweight multiplayer server
// Non-authoritative state relay with room management

const express = require('express');
const { WebSocketServer } = require('ws');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Get local IP for LAN
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${localIP}:${PORT}`);
  console.log(`   WebSocket: ws://${localIP}:${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ server, perMessageDeflate: false });

// Rooms: Map<roomName, Map<playerId, {ws, state}>>
const rooms = new Map();

wss.on('connection', (ws) => {
  let playerId = null;
  let room = null;

  // Native ping/pong for keepalive
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'join':
          playerId = msg.playerId;
          room = msg.room || 'default';

          // Create room if needed
          if (!rooms.has(room)) {
            rooms.set(room, new Map());
          }

          // Add player to room
          rooms.get(room).set(playerId, { ws, state: msg.state });
          console.log(`${playerId.slice(-4)} joined ${room} (${rooms.get(room).size} players)`);

          // Send existing players
          const players = [];
          rooms.get(room).forEach((client, id) => {
            if (id !== playerId && client.state) {
              players.push({ playerId: id, state: client.state });
            }
          });
          ws.send(JSON.stringify({ type: 'room_state', players }));

          // Notify others
          broadcast(room, { type: 'player_joined', playerId, state: msg.state }, playerId);
          break;

        case 'state':
          if (room && playerId) {
            // Update stored state
            const client = rooms.get(room)?.get(playerId);
            if (client) {
              client.state = msg.state;
            }

            // Broadcast to others in room
            broadcast(room, { type: 'player_state', playerId, state: msg.state }, playerId);
          }
          break;
      }
    } catch (err) {
      console.error('Message error:', err);
    }
  });

  ws.on('close', () => {
    if (room && playerId) {
      rooms.get(room)?.delete(playerId);
      broadcast(room, { type: 'player_left', playerId });

      const remaining = rooms.get(room)?.size || 0;
      console.log(`${playerId.slice(-4)} left ${room} (${remaining} players)`);

      // Clean up empty rooms
      if (remaining === 0) {
        rooms.delete(room);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Heartbeat: ping every 30s, terminate stale connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating stale connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeat);
});

// Broadcast to room
function broadcast(roomName, message, excludeId = null) {
  const roomClients = rooms.get(roomName);
  if (!roomClients) return;

  const data = JSON.stringify(message);
  roomClients.forEach((client, id) => {
    if (id !== excludeId && client.ws.readyState === 1) {
      try {
        client.ws.send(data);
      } catch (err) {
        console.error(`Broadcast error to ${id}:`, err);
      }
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
