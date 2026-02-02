// NetworkSystem.js - Client-side multiplayer networking
// Handles WebSocket connection, state sync, and remote player management

// ========== Network State ==========

let networkState = {
  ws: null,
  connected: false,
  playerId: null,
  room: 'default', // Could be level name
  remotePlayers: new Map(), // playerId -> entity
  lastStateSent: 0,
  stateSendInterval: 50, // Send state every 50ms (20 updates/sec)
  enabled: false, // Set to true to enable multiplayer
  serverUrl: null // Set from config or default
};

// ========== Connection ==========

const connectToServer = (serverUrl, room = 'default') => {
  if (networkState.ws) {
    console.warn('Already connected to server');
    return;
  }

  // Generate unique player ID (could be from auth system)
  networkState.playerId = `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  networkState.room = room;
  networkState.serverUrl = serverUrl;

  console.log(`Connecting to ${serverUrl} as ${networkState.playerId}...`);

  try {
    networkState.ws = new WebSocket(serverUrl);

    networkState.ws.onopen = () => {
      console.log('✓ Connected to multiplayer server');
      networkState.connected = true;

      // Join room with initial state
      const initialState = getLocalPlayerState();
      networkState.ws.send(JSON.stringify({
        type: 'join',
        playerId: networkState.playerId,
        room: networkState.room,
        state: initialState
      }));
    };

    networkState.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    };

    networkState.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    networkState.ws.onclose = () => {
      console.log('Disconnected from server');
      networkState.connected = false;
      networkState.ws = null;

      // Clean up all remote players
      networkState.remotePlayers.forEach(entity => {
        if (entity._markedForRemoval !== true) {
          removeEntity(world, entity);
        }
      });
      networkState.remotePlayers.clear();
    };
  } catch (err) {
    console.error('Failed to connect to server:', err);
  }
};

const disconnectFromServer = () => {
  if (networkState.ws) {
    networkState.ws.close();
    networkState.ws = null;
    networkState.connected = false;
  }
};

// ========== Message Handlers ==========

const handleServerMessage = (msg) => {
  switch (msg.type) {
    case 'room_state':
      // Initial state when joining - create all existing players
      msg.players.forEach(playerData => {
        createRemotePlayer(playerData.playerId, playerData.state);
      });
      console.log(`Joined room with ${msg.players.length} player(s)`);
      break;

    case 'player_joined':
      // New player joined - create their entity
      createRemotePlayer(msg.playerId, msg.state);
      console.log(`Player ${msg.playerId} joined`);
      break;

    case 'player_left':
      // Player disconnected - remove their entity
      removeRemotePlayer(msg.playerId);
      console.log(`Player ${msg.playerId} left`);
      break;

    case 'player_state':
      // Player state update - update their entity
      updateRemotePlayer(msg.playerId, msg.state);
      break;
  }
};

// ========== Remote Player Management ==========

const createRemotePlayer = (playerId, state) => {
  if (networkState.remotePlayers.has(playerId)) {
    return; // Already exists
  }

  if (!state || !state.pos) {
    console.warn(`Cannot create remote player ${playerId} - missing state`);
    return;
  }

  // Create entity with NetworkedPlayer component
  const entity = createEntity(world, {
    Transform: {
      pos: createVector(state.pos.x, state.pos.y, state.pos.z),
      rot: createVector(0, state.yaw || 0, 0),
      scale: createVector(1, 1, 1)
    },
    Animation: {
      currentFrame: 0,
      frameTime: 0,
      framesPerSecond: 6,
      totalFrames: 3 // 3 frames for walk animation (like player/NPCs)
    },
    NetworkedPlayer: {
      playerId,
      targetPos: createVector(state.pos.x, state.pos.y, state.pos.z),
      targetYaw: state.yaw || 0,
      lerpSpeed: 10.0, // Interpolation speed
      lastUpdate: Date.now(),
      avatar: state.avatar || 'default',
      radius: 0.35 // Character radius for rendering
    }
  });

  networkState.remotePlayers.set(playerId, entity);

  // Debug: Check what components were created
  console.log(`Remote player created: ${playerId}`, {
    hasTransform: !!entity.Transform,
    hasAnimation: !!entity.Animation,
    hasNetworkedPlayer: !!entity.NetworkedPlayer,
    position: entity.Transform.pos,
    avatar: state.avatar
  });
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
  if (!entity || !entity.NetworkedPlayer) {
    return;
  }

  const networked = entity.NetworkedPlayer;

  // Update target position for interpolation
  if (state.pos) {
    networked.targetPos.set(state.pos.x, state.pos.y, state.pos.z);
  }

  // Update target rotation
  if (state.yaw !== undefined) {
    networked.targetYaw = state.yaw;
  }

  networked.lastUpdate = Date.now();
};

// ========== Local Player State ==========

const getLocalPlayerState = () => {
  // Get local player entity
  const playerEntities = queryEntities(world, 'Player', 'Transform');
  if (playerEntities.length === 0) {
    return null;
  }

  const player = playerEntities[0];
  const pos = player.Transform.pos;
  const yaw = player.Transform.rot.y;

  // Only send essential data to minimize bandwidth
  return {
    pos: { x: parseFloat(pos.x.toFixed(2)), y: parseFloat(pos.y.toFixed(2)), z: parseFloat(pos.z.toFixed(2)) },
    yaw: parseFloat(yaw.toFixed(1)),
    avatar: 'default' // Could be from player config
  };
};

const sendLocalPlayerState = () => {
  if (!networkState.connected || !networkState.ws) {
    return;
  }

  const now = Date.now();
  if (now - networkState.lastStateSent < networkState.stateSendInterval) {
    return; // Throttle
  }

  const state = getLocalPlayerState();
  if (!state) {
    return;
  }

  try {
    networkState.ws.send(JSON.stringify({
      type: 'state',
      state
    }));
    networkState.lastStateSent = now;
  } catch (err) {
    console.error('Failed to send state:', err);
  }
};

// ========== Interpolation System ==========

const interpolateRemotePlayers = (dt) => {
  networkState.remotePlayers.forEach(entity => {
    if (!entity.NetworkedPlayer || !entity.Transform) {
      return;
    }

    const networked = entity.NetworkedPlayer;
    const transform = entity.Transform;

    // Interpolate position
    const currentPos = transform.pos;
    const targetPos = networked.targetPos;
    const lerpFactor = Math.min(1, networked.lerpSpeed * dt);

    currentPos.lerp(targetPos, lerpFactor);

    // Interpolate rotation
    let currentYaw = transform.rot.y;
    let targetYaw = networked.targetYaw;

    // Normalize angle difference (shortest path)
    let diff = targetYaw - currentYaw;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;

    transform.rot.y += diff * lerpFactor;
  });
};

// ========== Main System ==========

const NetworkSystem = (world, dt) => {
  if (!networkState.enabled) {
    return; // Multiplayer disabled
  }

  // Send local player state
  sendLocalPlayerState();

  // Interpolate remote players
  interpolateRemotePlayers(dt);

  // Timeout detection (optional - remove stale players)
  const now = Date.now();
  const TIMEOUT_MS = 10000; // 10 seconds
  networkState.remotePlayers.forEach((entity, playerId) => {
    if (entity.NetworkedPlayer && now - entity.NetworkedPlayer.lastUpdate > TIMEOUT_MS) {
      console.warn(`Remote player ${playerId} timed out`);
      removeRemotePlayer(playerId);
    }
  });
};

// ========== Public API ==========

const getNetworkState = () => networkState;
const isMultiplayerEnabled = () => networkState.enabled;
const enableMultiplayer = (serverUrl, room) => {
  networkState.enabled = true;
  if (!networkState.connected) {
    connectToServer(serverUrl, room);
  }
};
const disableMultiplayer = () => {
  networkState.enabled = false;
  disconnectFromServer();
};
