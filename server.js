// server.js - Minimal Express + WebSocket server for multiplayer
// Optimized for fast, non-authoritative multiplayer

const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from current directory
app.use(express.static('.'));

// Health check for fly.io
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Get local IP address for LAN access
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
  console.log(`\n💡 For LAN access, use: ws://${localIP}:${PORT} in config.json`);
});

// WebSocket server
const wss = new WebSocketServer({
  server,
  perMessageDeflate: false // Disable compression for lower latency
});

// Room management (simple: one room per level)
const rooms = new Map();

// Connection tracking
let connectionCount = 0;

wss.on('connection', (ws) => {
  connectionCount++;
  console.log(`Player connected (total: ${connectionCount})`);

  let playerId = null;
  let currentRoom = null;
  let lastBroadcast = 0;
  const BROADCAST_THROTTLE = 50; // ms between broadcasts (20 updates/sec)

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'join':
          playerId = msg.playerId;
          currentRoom = msg.room || 'default';

          // Create room if needed
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Map());
          }

          rooms.get(currentRoom).set(playerId, { ws, state: msg.state });

          console.log(`Player ${playerId} joined room ${currentRoom}`);

          // Send existing players to new player
          const existingPlayers = [];
          rooms.get(currentRoom).forEach((client, id) => {
            if (id !== playerId && client.state) {
              existingPlayers.push({
                playerId: id,
                state: client.state
              });
            }
          });

          ws.send(JSON.stringify({
            type: 'room_state',
            players: existingPlayers
          }));

          // Notify others about new player (with initial state)
          broadcast(currentRoom, {
            type: 'player_joined',
            playerId,
            state: msg.state
          }, playerId);
          break;

        case 'state':
          if (currentRoom && playerId) {
            // Throttle broadcasts to reduce server load
            const now = Date.now();
            if (now - lastBroadcast < BROADCAST_THROTTLE) {
              return;
            }
            lastBroadcast = now;

            // Store latest state
            const client = rooms.get(currentRoom)?.get(playerId);
            if (client) {
              client.state = msg.state;
            }

            // Broadcast to others
            broadcast(currentRoom, {
              type: 'player_state',
              playerId,
              state: msg.state
            }, playerId);
          }
          break;
      }
    } catch (err) {
      console.error('Message error:', err);
    }
  });

  ws.on('close', () => {
    connectionCount--;
    console.log(`Player disconnected (total: ${connectionCount})`);

    if (currentRoom && playerId) {
      rooms.get(currentRoom)?.delete(playerId);

      broadcast(currentRoom, {
        type: 'player_left',
        playerId
      });

      // Clean up empty rooms
      if (rooms.get(currentRoom)?.size === 0) {
        rooms.delete(currentRoom);
        console.log(`Room ${currentRoom} deleted (empty)`);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Broadcast helper - only sends to active connections
function broadcast(room, message, excludeId = null) {
  const roomClients = rooms.get(room);
  if (!roomClients) return;

  const data = JSON.stringify(message);

  roomClients.forEach((client, id) => {
    if (id !== excludeId && client.ws.readyState === 1) { // 1 = OPEN
      try {
        client.ws.send(data);
      } catch (err) {
        console.error(`Failed to send to ${id}:`, err);
      }
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
