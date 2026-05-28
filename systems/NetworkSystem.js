// NetworkSystem.js

const PLAYER_FADE_SPEED  = 2.5;  // fade-in speed (0→1)
const PLAYER_FADE_OUT    = 3.0;  // fade-out speed on disconnect
const STALE_START_S      = 2.0;  // seconds before stale fade begins
const STALE_FLOOR        = 0.5;  // minimum alpha while stale (not yet disconnected)
const SEND_INTERVAL_MS   = 50;   // 20 Hz outbound

let net = {
  ws:            null,
  connected:     false,
  playerId:      null,
  serverUrl:     null,
  remotePlayers: new Map(), // id → entity  (active players)
  lastSent:      null,
  lastSentTime:  0,
  reconnectAttempt: 0,
  reconnectTimer:   null,
};

// Entities fading out after disconnect — keyed by playerId so we can cancel if
// the same player rejoins before the fade completes.
const _dying = new Map(); // id → entity

// ── Connection ────────────────────────────────────────────────────────────

const _connect = () => {
  const prev = net.ws;
  net.ws = null;           // nullify first so onclose is a no-op for prev
  if (prev) prev.close();

  if (!net.playerId) {
    net.playerId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  let ws;
  try { ws = new WebSocket(net.serverUrl); } catch { return; }
  net.ws = ws;

  ws.onopen = () => {
    const s = _localState();
    if (!s) { ws.close(); return; }
    net.connected        = true;
    net.reconnectAttempt = 0;
    ws.send(JSON.stringify({ type: 'join', id: net.playerId, ...s }));
    console.log('[net] joined as', net.playerId);
  };

  ws.onmessage = (e) => { try { _handle(JSON.parse(e.data)); } catch (err) { console.error('[net] msg err:', err); } };

  ws.onclose = () => {
    if (net.ws !== ws) return; // deliberate close or stale
    net.ws        = null;
    net.connected = false;
    _clearAll();
    showToast('Disconnected');
    _scheduleReconnect();
  };

  ws.onerror = () => {};
};

const _scheduleReconnect = () => {
  if (net.reconnectAttempt >= 10) return;
  net.reconnectAttempt++;
  const delay = Math.min(1000 * Math.pow(1.5, net.reconnectAttempt - 1), 30000);
  net.reconnectTimer = setTimeout(_connect, delay);
};

const _clearAll = () => {
  net.remotePlayers.forEach(e => removeEntity(world, e));
  net.remotePlayers.clear();
  _dying.forEach(e => removeEntity(world, e));
  _dying.clear();
};

// ── Message handling ──────────────────────────────────────────────────────

const _handle = (msg) => {
  switch (msg.type) {

    case 'welcome': {
      const ids = Object.keys(msg.players);
      console.log('[net] welcome:', ids.length, 'others:', ids);
      ids.forEach(id => _createPlayer(id, msg.players[id]));
      const n = net.remotePlayers.size;
      if (n > 0) showToast(n === 1 ? '1 other player in the room' : `${n} other players in the room`);
      break;
    }

    case 'update': {
      // Server-authoritative tick — update positions of known players.
      // Silently create any we missed a 'join' for (safety net).
      // Ignore players that are currently in the dying fade-out.
      Object.entries(msg.players).forEach(([id, s]) => {
        if (id === net.playerId) return;
        if (_dying.has(id)) return;
        if (net.remotePlayers.has(id)) _updatePlayer(id, s);
        else                           _createPlayer(id, s);
      });
      break;
    }

    case 'join': {
      console.log('[net] join:', msg.id);
      // If this player was mid-fade-out (quick reconnect), cancel the fade.
      if (_dying.has(msg.id)) {
        removeEntity(world, _dying.get(msg.id));
        _dying.delete(msg.id);
      }
      _createPlayer(msg.id, msg);
      showToast('A player joined');
      break;
    }

    case 'leave': {
      console.log('[net] leave:', msg.id);
      _startFadeOut(msg.id);
      showToast('A player left');
      break;
    }

    case 'emote':
      spawnEmote(msg.wx, msg.wy, msg.wz, msg.emoteId);
      break;
  }
};

// ── Remote player lifecycle ───────────────────────────────────────────────

const _createPlayer = (id, s) => {
  if (!s) return;
  if (net.remotePlayers.has(id)) { console.log('[net] _createPlayer: already exists', id); return; }
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
      playerId:       id,
      targetPos:      createVector(+s.x, +s.y, +s.z),
      targetYaw:      +(s.yaw || 0),
      lerpSpeed:      10,
      isMoving:       false,
      isTurning:      false,
      radius:         PLAYER_RADIUS,
      skinId:         s.skin || SKINS[0].id,
      fadeAlpha:      0,
      lastUpdateTime: Date.now(),
    },
  });
  net.remotePlayers.set(id, entity);
};

const _startFadeOut = (id) => {
  const e = net.remotePlayers.get(id);
  if (!e) return;
  net.remotePlayers.delete(id); // remove from active map immediately (allows re-join)
  _dying.set(id, e);            // hand to fade-out tracker
};

const _updatePlayer = (id, s) => {
  const e = net.remotePlayers.get(id);
  if (!e) return;
  const n = e.NetworkedPlayer;
  n.targetPos.set(+s.x, +s.y, +s.z);
  n.targetYaw    = +s.yaw;
  if (s.skin) n.skinId = s.skin;
  n.lastUpdateTime = Date.now();
};

// ── Interpolation (runs every frame) ─────────────────────────────────────

const _interpolate = (dt) => {
  const now = Date.now();

  // Active players
  net.remotePlayers.forEach(e => {
    const n  = e.NetworkedPlayer;
    const tf = e.Transform;

    // Stale detection: server ticks every 50 ms, so >2 s without an update means
    // the server has stopped including this player (dropped packet, lag, etc.).
    const age   = (now - n.lastUpdateTime) / 1000;
    const stale = Math.max(0, Math.min(1, (age - STALE_START_S)));
    const targetAlpha = 1.0 - stale * (1.0 - STALE_FLOOR);
    n.fadeAlpha += (targetAlpha - n.fadeAlpha) * Math.min(1, PLAYER_FADE_SPEED * dt);

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

  // Dying players: fade out and remove from world when done
  const done = [];
  _dying.forEach((e, id) => {
    e.NetworkedPlayer.fadeAlpha = Math.max(0, e.NetworkedPlayer.fadeAlpha - dt * PLAYER_FADE_OUT);
    if (e.NetworkedPlayer.fadeAlpha <= 0) done.push(id);
  });
  done.forEach(id => { removeEntity(world, _dying.get(id)); _dying.delete(id); });
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

const enableMultiplayer = (serverUrl) => {
  net.serverUrl = serverUrl;
  _connect();
};

const disableMultiplayer = () => {
  clearTimeout(net.reconnectTimer);
  const ws = net.ws;
  net.ws = null;
  if (ws) ws.close();
  net.connected = false;
  _clearAll();
};

const sendEmote = (wx, wy, wz, emoteId) => {
  if (net.connected && net.ws) {
    net.ws.send(JSON.stringify({ type: 'emote', wx, wy, wz, emoteId }));
  }
};

const getNetworkState      = () => net;
const isMultiplayerEnabled = () => net.connected;
