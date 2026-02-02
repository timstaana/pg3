// TouchInputSystem.js - Touch input with virtual joystick
// Based on pointer events for touch screen support

const DRAG_THRESHOLD = 10;
const DEAD_X = 0.12;
const DEAD_Y = 0.48;

const touchState = {
  // Joystick state
  active: false,
  pending: null,
  pointerId: null,
  origin: { x: 0, y: 0 },
  pos: { x: 0, y: 0 },
  knob: { x: 0, y: 0 },
  stick: { x: 0, y: 0 },
  radius: 60,

  // Jump state
  jumpQueued: false,
  jumpPointerId: null,
  tapRequested: false,
  tapPosition: null,
  multiTouch: false,
};

let listenersSetup = false;

const dead = (v, zone) => Math.abs(v) < zone ? 0 : v;

const normalize = (state) => {
  const dx = state.pos.x - state.origin.x;
  const dy = state.pos.y - state.origin.y;
  const dist = Math.hypot(dx, dy);
  const r = state.radius;
  const s = dist > r ? r / dist : 1;
  const cx = dx * s;
  const cy = dy * s;

  state.knob.x = state.origin.x + cx;
  state.knob.y = state.origin.y + cy;
  state.stick.x = dead(cx / r, DEAD_X);
  state.stick.y = dead(cy / r, DEAD_Y);
};

const onDown = (e) => {
  if (e.pointerType === "mouse") return;
  e.preventDefault();

  const x = e.clientX;
  const y = e.clientY;

  // Second touch = jump
  if (touchState.active || touchState.pending) {
    touchState.jumpPointerId = e.pointerId;
    touchState.jumpQueued = true;
    touchState.multiTouch = true;
    return;
  }

  // First touch = potential joystick
  touchState.pending = { id: e.pointerId, x, y };
  touchState.multiTouch = false;
};

const onMove = (e) => {
  if (e.pointerType === "mouse") return;
  e.preventDefault();

  const x = e.clientX;
  const y = e.clientY;

  // Update active joystick
  if (touchState.active && e.pointerId === touchState.pointerId) {
    touchState.pos.x = x;
    touchState.pos.y = y;
    normalize(touchState);
    return;
  }

  // Activate pending touch if dragged past threshold
  if (touchState.pending && e.pointerId === touchState.pending.id) {
    const dist = Math.hypot(x - touchState.pending.x, y - touchState.pending.y);
    if (dist >= DRAG_THRESHOLD) {
      touchState.active = true;
      touchState.pointerId = touchState.pending.id;
      touchState.origin.x = touchState.pending.x;
      touchState.origin.y = touchState.pending.y;
      touchState.pos.x = x;
      touchState.pos.y = y;
      touchState.pending = null;
      normalize(touchState);
    }
  }
};

const onUp = (e) => {
  if (e.pointerType === "mouse") return;

  // Release joystick
  if (touchState.active && e.pointerId === touchState.pointerId) {
    touchState.active = false;
    touchState.pointerId = null;
    touchState.stick.x = 0;
    touchState.stick.y = 0;
    touchState.knob.x = touchState.origin.x;
    touchState.knob.y = touchState.origin.y;
    return;
  }

  // Release jump
  if (e.pointerId === touchState.jumpPointerId) {
    touchState.jumpPointerId = null;
    return;
  }

  // Tap detected (if not multi-touch)
  if (touchState.pending && e.pointerId === touchState.pending.id) {
    if (!touchState.multiTouch) {
      touchState.tapRequested = true;
      touchState.tapPosition = { x: e.clientX, y: e.clientY };
    }
    touchState.pending = null;
  }
};

const setupTouchListeners = () => {
  if (listenersSetup) return;

  const canvas = document.querySelector("canvas");
  if (canvas) {
    canvas.style.touchAction = "none";
    canvas.addEventListener("contextmenu", e => e.preventDefault());
  }

  const options = { passive: false };
  document.addEventListener("pointerdown", onDown, options);
  document.addEventListener("pointermove", onMove, options);
  document.addEventListener("pointerup", onUp, options);
  document.addEventListener("pointercancel", onUp, options);

  listenersSetup = true;
};

const TouchInputSystem = (world, dt) => {
  setupTouchListeners();

  const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
  const inLightboxMode = lightbox && lightbox.active;
  const dialogue = typeof getDialogueState === 'function' ? getDialogueState() : null;
  const inDialogueMode = dialogue && dialogue.active;

  const players = queryEntities(world, 'Player', 'Input');

  players.forEach(player => {
    const { Input: input } = player;

    // Initialize input values (will be overridden by keyboard if pressed)
    input.forward = 0;
    input.turn = 0;
    input.jump = false;

    // Map joystick to tank controls only if not in dialogue or lightbox mode
    // X axis = turn, Y axis = forward/back
    if (touchState.active && !inDialogueMode && !inLightboxMode) {
      input.turn = touchState.stick.x;
      input.forward = -touchState.stick.y; // Invert Y (up = forward)
    }

    // Handle tap input
    if (touchState.tapRequested && touchState.tapPosition) {
      // Advance dialogue if in dialogue mode
      if (inDialogueMode && dialogue.cooldown <= 0) {
        if (typeof advanceDialogue === 'function') {
          advanceDialogue();
        }
        touchState.tapRequested = false;
        touchState.tapPosition = null;
        return;
      }

      // Exit lightbox if in lightbox mode
      if (inLightboxMode && lightbox.cooldown <= 0) {
        if (typeof deactivateLightbox === 'function') {
          deactivateLightbox();
        }
        touchState.tapRequested = false;
        touchState.tapPosition = null;
        return;
      }

      // Check if there's a highlighted interactable nearby
      // Simpler approach: tap anywhere to activate the closest interactable
      let hitInteractable = false;
      const interactables = queryEntities(world, 'Interaction');

      for (const entity of interactables) {
        // If this entity is the closest interactable (highlighted with glow)
        if (entity.Interaction.isClosest) {
          // Check if it's an NPC with dialogue
          if (entity.Dialogue && typeof activateDialogue === 'function') {
            activateDialogue(entity);
            hitInteractable = true;
            break;
          }
          // Otherwise activate lightbox (paintings/sculptures)
          else if (typeof activateLightbox === 'function') {
            activateLightbox(entity);
            hitInteractable = true;
            break;
          }
        }
      }

      // If didn't hit interactable, treat as jump
      if (!hitInteractable) {
        input.jump = true;
      }

      touchState.tapRequested = false;
      touchState.tapPosition = null;
    }

    // Handle multi-touch jump
    if (touchState.jumpQueued) {
      input.jump = true;
      touchState.jumpQueued = false;
    }
  });
};

// Make touch state available globally for rendering
const getTouchState = () => touchState;
