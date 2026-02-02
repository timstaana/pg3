// NetworkSystem.js - Simplified multiplayer networking
// Fast, non-authoritative state sync with auto-reconnect

let networkState = {
  ws: null,
  connected: false,
  playerId: null,
  room: 'default',
  serverUrl: null,
  remotePlayers: new Map(), // playerId -> entity

  // State sync
  lastStateSent: null,
  stateSendInterval: 50, // 20 updates/sec
  lastSendTime: 0,

  // Reconnection
  reconnecting: false,
  reconnectAttempt: 0,
  maxReconnectAttempts: 10,
  reconnectTimeout: null
};

// ========== Connection ==========

const connect = (serverUrl, room = 'default') => {
  if (networkState.ws && networkState.connected) return;

  // Clean up existing connection
  if (networkState.ws) {
    networkState.ws.close();
    networkState.ws = null;
  }

  // Generate player ID once
  if (!networkState.playerId) {
    networkState.playerId = `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  networkState.serverUrl = serverUrl;
  networkState.room = room;

  console.log(`Connecting to ${serverUrl}...`);

  try {
    networkState.ws = new WebSocket(serverUrl);

    networkState.ws.onopen = () => {
      console.log('✓ Connected to server');
      networkState.connected = true;
      networkState.reconnecting = false;
      networkState.reconnectAttempt = 0;

      // Join room
      const state = getLocalState();
      if (state) {
        send({ type: 'join', playerId: networkState.playerId, room: networkState.room, state });
      }
    };

    networkState.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (err) {
        console.error('Parse error:', err);
      }
    };

    networkState.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    networkState.ws.onclose = (event) => {
      console.log(`Disconnected (code: ${event.code})`);
      networkState.connected = false;
      networkState.ws = null;

      // Auto-reconnect
      if (!networkState.reconnecting) {
        attemptReconnect();
      }
    };
  } catch (err) {
    console.error('Connection failed:', err);
  }
};

const attemptReconnect = () => {
  if (networkState.reconnecting) return;

  networkState.reconnectAttempt++;
  if (networkState.reconnectAttempt > networkState.maxReconnectAttempts) {
    console.error('Max reconnect attempts reached');
    cleanup();
    return;
  }

  networkState.reconnecting = true;
  const delay = Math.min(1000 * Math.pow(1.5, networkState.reconnectAttempt - 1), 30000);

  console.log(`Reconnecting in ${(delay / 1000).toFixed(1)}s (${networkState.reconnectAttempt}/${networkState.maxReconnectAttempts})`);

  networkState.reconnectTimeout = setTimeout(() => {
    networkState.reconnecting = false;
    if (networkState.serverUrl) {
      connect(networkState.serverUrl, networkState.room);
    }
  }, delay);
};

const disconnect = () => {
  if (networkState.reconnectTimeout) {
    clearTimeout(networkState.reconnectTimeout);
  }
  if (networkState.ws) {
    networkState.ws.close();
    networkState.ws = null;
  }
  cleanup();
};

const cleanup = () => {
  networkState.remotePlayers.forEach(entity => {
    if (entity._markedForRemoval !== true) {
      removeEntity(world, entity);
    }
  });
  networkState.remotePlayers.clear();
  networkState.connected = false;
};

// ========== Messaging ==========

const send = (msg) => {
  if (networkState.ws && networkState.ws.readyState === 1) {
    try {
      networkState.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error('Send error:', err);
    }
  }
};

const handleMessage = (msg) => {
  switch (msg.type) {
    case 'room_state':
      // Initial room state
      msg.players.forEach(p => createRemotePlayer(p.playerId, p.state));
      console.log(`Joined room with ${msg.players.length} player(s)`);
      break;

    case 'player_joined':
      createRemotePlayer(msg.playerId, msg.state);
      console.log(`Player ${msg.playerId.slice(-4)} joined`);
      break;

    case 'player_left':
      removeRemotePlayer(msg.playerId);
      console.log(`Player ${msg.playerId.slice(-4)} left`);
      break;

    case 'player_state':
      updateRemotePlayer(msg.playerId, msg.state);
      break;
  }
};

// ========== State Sync ==========

const getLocalState = () => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return null;

  const player = players[0];
  const pos = player.Transform.pos;
  const yaw = player.Transform.rot.y;

  return {
    pos: { x: pos.x.toFixed(2), y: pos.y.toFixed(2), z: pos.z.toFixed(2) },
    yaw: yaw.toFixed(1)
  };
};

const sendState = () => {
  if (!networkState.connected) return;

  const now = Date.now();
  if (now - networkState.lastSendTime < networkState.stateSendInterval) return;

  const state = getLocalState();
  if (!state) return;

  // Delta compression - only send if changed
  const lastState = networkState.lastStateSent;
  const changed = !lastState ||
    state.pos.x !== lastState.pos.x ||
    state.pos.y !== lastState.pos.y ||
    state.pos.z !== lastState.pos.z ||
    state.yaw !== lastState.yaw;

  if (changed) {
    send({ type: 'state', state });
    networkState.lastStateSent = state;
    networkState.lastSendTime = now;
  }
};

// ========== Remote Players ==========

const createRemotePlayer = (playerId, state) => {
  if (networkState.remotePlayers.has(playerId)) return;
  if (!state || !state.pos) return;

  const entity = createEntity(world, {
    Transform: {
      pos: createVector(parseFloat(state.pos.x), parseFloat(state.pos.y), parseFloat(state.pos.z)),
      rot: createVector(0, parseFloat(state.yaw) || 0, 0),
      scale: createVector(1, 1, 1)
    },
    Animation: {
      currentFrame: 0,
      frameTime: 0,
      framesPerSecond: 6,
      totalFrames: 3
    },
    NetworkedPlayer: {
      playerId,
      targetPos: createVector(parseFloat(state.pos.x), parseFloat(state.pos.y), parseFloat(state.pos.z)),
      targetYaw: parseFloat(state.yaw) || 0,
      lerpSpeed: 10.0,
      lastUpdate: Date.now(),
      radius: 0.35,
      isMoving: false,
      isTurning: false
    }
  });

  networkState.remotePlayers.set(playerId, entity);
};

const removeRemotePlayer = (playerId) => {
  const entity = networkState.remotePlayers.get(playerId);
  if (entity) {
    removeEntity(world, entity);
    networkState.remotePlayers.delete(playerId);
  }
};

const updateRemotePlayer = (playerId, state) => {
  const entity = networkState.remotePlayers.get(playerId);
  if (!entity || !entity.NetworkedPlayer) return;

  const net = entity.NetworkedPlayer;

  if (state.pos) {
    net.targetPos.set(parseFloat(state.pos.x), parseFloat(state.pos.y), parseFloat(state.pos.z));
  }
  if (state.yaw !== undefined) {
    net.targetYaw = parseFloat(state.yaw);
  }

  net.lastUpdate = Date.now();
};

const interpolate = (dt) => {
  networkState.remotePlayers.forEach(entity => {
    const net = entity.NetworkedPlayer;
    const transform = entity.Transform;

    // Check horizontal movement for animation (ignore Y/jumping)
    const dx = net.targetPos.x - transform.pos.x;
    const dz = net.targetPos.z - transform.pos.z;
    const hDist = Math.sqrt(dx * dx + dz * dz);
    net.isMoving = hDist > 0.05;

    // Check rotation for animation
    let yawDiff = net.targetYaw - transform.rot.y;
    if (yawDiff > 180) yawDiff -= 360;
    else if (yawDiff < -180) yawDiff += 360;
    net.isTurning = Math.abs(yawDiff) > 1;

    // Interpolate
    const factor = Math.min(1, net.lerpSpeed * dt);
    transform.pos.lerp(net.targetPos, factor);
    transform.rot.y += yawDiff * factor;
  });

  // Note: Player cleanup is handled by server 'player_left' messages
  // No client-side timeout - idle players shouldn't be disconnected
};

// ========== Main System ==========

const NetworkSystem = (world, dt) => {
  if (!networkState.connected) return;

  sendState();
  interpolate(dt);
};

// ========== Public API ==========

const enableMultiplayer = (serverUrl, room) => {
  connect(serverUrl, room);
};

const disableMultiplayer = () => {
  disconnect();
};

const getNetworkState = () => networkState;
const isMultiplayerEnabled = () => networkState.connected;
