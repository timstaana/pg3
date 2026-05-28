// NetworkSystem.js

const PLAYER_FADE_SPEED = 2.5;
const SEND_INTERVAL_MS  = 50; // 20 Hz

let net = {
  ws:            null,
  connected:     false,
  playerId:      null,
  serverUrl:     null,
  room:          'default',
  remotePlayers: new Map(), // id → entity
  lastSent:      null,
  lastSentTime:  0,
  reconnectAttempt: 0,
  reconnectTimer:   null,
};

// ── Connection ────────────────────────────────────────────────────────────

const _connect = () => {
  // Null out first so onclose knows this is intentional if we call close()
  const prev = net.ws;
  net.ws = null;
  if (prev) prev.close();

  if (!net.playerId) {
    net.playerId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  let ws;
  try { ws = new WebSocket(net.serverUrl); } catch { return; }
  net.ws = ws;

  ws.onopen = () => {
    const s = _localState();
    if (!s) { ws.close(); return; }
    net.connected  = true;
    net.reconnectAttempt = 0;
    ws.send(JSON.stringify({ type: 'join', id: net.playerId, room: net.room, ...s }));
  };

  ws.onmessage = (e) => {
    try { _handle(JSON.parse(e.data)); } catch {}
  };

  ws.onclose = () => {
    if (net.ws !== ws) return; // we already moved on
    net.ws        = null;
    net.connected = false;
    _clearRemote();
    showToast('Disconnected');
    _scheduleReconnect();
  };

  ws.onerror = () => {}; // onclose will fire
};

const _scheduleReconnect = () => {
  if (net.reconnectAttempt >= 10) return;
  net.reconnectAttempt++;
  const delay = Math.min(1000 * Math.pow(1.5, net.reconnectAttempt - 1), 30000);
  net.reconnectTimer = setTimeout(_connect, delay);
};

const _clearRemote = () => {
  net.remotePlayers.forEach(e => removeEntity(world, e));
  net.remotePlayers.clear();
};

// ── Message handling ──────────────────────────────────────────────────────

const _handle = (msg) => {
  switch (msg.type) {

    case 'welcome': {
      // Initial snapshot of the room when we join
      Object.entries(msg.players).forEach(([id, s]) => _createPlayer(id, s));
      const n = net.remotePlayers.size;
      if (n > 0) showToast(n === 1 ? '1 other player in the room' : `${n} other players in the room`);
      break;
    }

    case 'update': {
      // Server-authoritative world tick — update positions; silently create any
      // players we somehow missed a 'join' for (safety net, no toast).
      Object.entries(msg.players).forEach(([id, s]) => {
        if (id === net.playerId) return;
        if (net.remotePlayers.has(id)) _updatePlayer(id, s);
        else                           _createPlayer(id, s);
      });
      break;
    }

    case 'join':
      _createPlayer(msg.id, msg);
      showToast('A player joined');
      break;

    case 'leave':
      _removePlayer(msg.id);
      showToast('A player left');
      break;

    case 'emote':
      spawnEmote(msg.wx, msg.wy, msg.wz, msg.emoteId);
      break;
  }
};

// ── Remote player lifecycle ───────────────────────────────────────────────

const _createPlayer = (id, s) => {
  if (net.remotePlayers.has(id) || !s) return;
  const entity = createEntity(world, {
    Transform: {
      pos:   createVector(+s.x, +s.y, +s.z),
      rot:   createVector(0, +(s.yaw || 0), 0),
      scale: createVector(1, 1, 1),
    },
    Animation: {
      currentFrame: 0, frameTime: 0, framesPerSecond: 6, totalFrames: 3,
    },
    NetworkedPlayer: {
      playerId:  id,
      targetPos: createVector(+s.x, +s.y, +s.z),
      targetYaw: +(s.yaw || 0),
      lerpSpeed: 10,
      isMoving:  false,
      isTurning: false,
      radius:    PLAYER_RADIUS,
      skinId:    s.skin || SKINS[0].id,
      fadeAlpha: 0,
    },
  });
  net.remotePlayers.set(id, entity);
};

const _removePlayer = (id) => {
  const e = net.remotePlayers.get(id);
  if (!e) return;
  removeEntity(world, e);
  net.remotePlayers.delete(id);
};

const _updatePlayer = (id, s) => {
  const e = net.remotePlayers.get(id);
  if (!e) return;
  const n = e.NetworkedPlayer;
  n.targetPos.set(+s.x, +s.y, +s.z);
  n.targetYaw = +s.yaw;
  if (s.skin) n.skinId = s.skin;
};

// ── Interpolation (runs every frame) ─────────────────────────────────────

const _interpolate = (dt) => {
  net.remotePlayers.forEach(e => {
    const n  = e.NetworkedPlayer;
    const tf = e.Transform;

    n.fadeAlpha = Math.min(1, n.fadeAlpha + dt * PLAYER_FADE_SPEED);

    const dx = n.targetPos.x - tf.pos.x;
    const dz = n.targetPos.z - tf.pos.z;
    n.isMoving = dx * dx + dz * dz > 0.0025;

    let yd = n.targetYaw - tf.rot.y;
    if (yd >  180) yd -= 360;
    if (yd < -180) yd += 360;
    n.isTurning = Math.abs(yd) > 1;

    const f = Math.min(1, n.lerpSpeed * dt);
    tf.pos.lerp(n.targetPos, f);
    tf.rot.y += yd * f;
  });
};

// ── Outbound state ────────────────────────────────────────────────────────

const _localState = () => {
  const ps = queryEntities(world, 'Player', 'Transform');
  if (!ps.length) return null;
  const { pos, rot } = ps[0].Transform;
  return {
    x:    +pos.x.toFixed(2),
    y:    +pos.y.toFixed(2),
    z:    +pos.z.toFixed(2),
    yaw:  +rot.y.toFixed(1),
    skin: SKINS[uiState.selectedSkin].id,
  };
};

const _sendState = () => {
  if (!net.connected || !net.ws) return;
  const now = Date.now();
  if (now - net.lastSentTime < SEND_INTERVAL_MS) return;

  const s = _localState();
  if (!s) return;

  const p = net.lastSent;
  if (p && s.x === p.x && s.y === p.y && s.z === p.z && s.yaw === p.yaw && s.skin === p.skin) return;

  net.ws.send(JSON.stringify({ type: 'mv', ...s }));
  net.lastSent     = s;
  net.lastSentTime = now;
};

// ── Main system ───────────────────────────────────────────────────────────

const NetworkSystem = (world, dt) => {
  if (!net.connected) return;
  _sendState();
  _interpolate(dt);
};

// ── Public API ────────────────────────────────────────────────────────────

const enableMultiplayer = (serverUrl, room) => {
  net.serverUrl = serverUrl;
  net.room      = room;
  _connect();
};

const disableMultiplayer = () => {
  clearTimeout(net.reconnectTimer);
  const ws = net.ws;
  net.ws = null; // nullify before close so onclose is a no-op
  if (ws) ws.close();
  net.connected = false;
  _clearRemote();
};

const sendEmote = (wx, wy, wz, emoteId) => {
  if (net.connected && net.ws) {
    net.ws.send(JSON.stringify({ type: 'emote', wx, wy, wz, emoteId }));
  }
};

const getNetworkState    = () => net;
const isMultiplayerEnabled = () => net.connected;
