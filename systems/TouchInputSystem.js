// TouchInputSystem.js - Virtual joystick via pointer events
// Left thumb drags = move/turn, second touch or tap = jump

const DRAG_THRESHOLD = 10;
const DEAD_X = 0.12;
const DEAD_Y = 0.48;

const touchState = {
  active:         false,
  pending:        null,
  pointerId:      null,
  origin:         { x: 0, y: 0 },
  pos:            { x: 0, y: 0 },
  knob:           { x: 0, y: 0 },
  stick:          { x: 0, y: 0 },
  radius:         60,
  jumpQueued:     false,
  jumpPointerId:  null,
  multiTouch:     false,
};

let touchListenersSetup = false;

const deadZone = (v, zone) => Math.abs(v) < zone ? 0 : v;

const normalizeStick = (state) => {
  const dx   = state.pos.x - state.origin.x;
  const dy   = state.pos.y - state.origin.y;
  const dist = Math.hypot(dx, dy);
  const r    = state.radius;
  const s    = dist > r ? r / dist : 1;
  const cx   = dx * s;
  const cy   = dy * s;
  state.knob.x  = state.origin.x + cx;
  state.knob.y  = state.origin.y + cy;
  state.stick.x = deadZone(cx / r, DEAD_X);
  state.stick.y = deadZone(cy / r, DEAD_Y);
};

const onPointerDown = (e) => {
  if (e.target.closest('button')) return;  // let UI buttons handle their own events
  e.preventDefault();

  // Right-click = jump
  if (e.pointerType === 'mouse' && e.button === 2) {
    touchState.jumpQueued = true;
    return;
  }

  // Second finger = jump
  if (touchState.active || touchState.pending) {
    touchState.jumpPointerId = e.pointerId;
    touchState.jumpQueued    = true;
    touchState.multiTouch    = true;
    return;
  }

  touchState.pending    = { id: e.pointerId, x: e.clientX, y: e.clientY };
  touchState.multiTouch = false;
};

const onPointerMove = (e) => {
  e.preventDefault();

  // Update active joystick
  if (touchState.active && e.pointerId === touchState.pointerId) {
    touchState.pos.x = e.clientX;
    touchState.pos.y = e.clientY;
    normalizeStick(touchState);
    return;
  }

  // Activate pending touch if dragged past threshold
  if (touchState.pending && e.pointerId === touchState.pending.id) {
    const dist = Math.hypot(e.clientX - touchState.pending.x, e.clientY - touchState.pending.y);
    if (dist >= DRAG_THRESHOLD) {
      touchState.active      = true;
      touchState.pointerId   = touchState.pending.id;
      touchState.origin.x    = touchState.pending.x;
      touchState.origin.y    = touchState.pending.y;
      touchState.pos.x       = e.clientX;
      touchState.pos.y       = e.clientY;
      touchState.pending     = null;
      normalizeStick(touchState);
    }
  }
};

const onPointerUp = (e) => {
  if (e.pointerType === 'mouse' && e.button === 2) return; // right-click jump already fired on down

  // Release joystick
  if (touchState.active && e.pointerId === touchState.pointerId) {
    touchState.active      = false;
    touchState.pointerId   = null;
    touchState.stick.x     = 0;
    touchState.stick.y     = 0;
    touchState.knob.x      = touchState.origin.x;
    touchState.knob.y      = touchState.origin.y;
    return;
  }

  // Release jump finger
  if (e.pointerId === touchState.jumpPointerId) {
    touchState.jumpPointerId = null;
    return;
  }

  // Single tap (no drag, no multi-touch) = jump
  if (touchState.pending && e.pointerId === touchState.pending.id) {
    if (!touchState.multiTouch) {
      touchState.jumpQueued = true;
    }
    touchState.pending = null;
  }
};

const setupTouchListeners = () => {
  if (touchListenersSetup) return;

  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.style.touchAction = 'none';
  }
  document.addEventListener('contextmenu', e => e.preventDefault());

  const opts = { passive: false };
  document.addEventListener('pointerdown',   onPointerDown, opts);
  document.addEventListener('pointermove',   onPointerMove, opts);
  document.addEventListener('pointerup',     onPointerUp,   opts);
  document.addEventListener('pointercancel', onPointerUp,   opts);

  touchListenersSetup = true;
};

const TouchInputSystem = (world, dt) => {
  setupTouchListeners();

  const players = queryEntities(world, 'Player', 'Input');

  players.forEach(player => {
    const { Input: input } = player;

    // Always reset
    input.forward = 0;
    input.turn    = 0;
    input.jump    = false;

    // Block all movement while skin select or emote picker is active
    if (typeof uiState !== 'undefined' && (uiState.skinPreview || uiState.emotePickerOpen)) {
      touchState.jumpQueued = false;
      return;
    }

    // Apply joystick: turn flips when reversing so steering stays natural.
    if (touchState.active) {
      input.forward = -touchState.stick.y;
      input.turn    = touchState.stick.x * Math.sign(input.forward || 1);
    }

    // Consume queued jump
    if (touchState.jumpQueued) {
      input.jump            = true;
      touchState.jumpQueued = false;
    }
  });
};

const getTouchState = () => touchState;
