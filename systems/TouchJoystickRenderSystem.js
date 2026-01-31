// TouchJoystickRenderSystem.js - Renders virtual joystick on canvas overlay

let joystickCanvas = null;
let joystickCtx = null;

const initJoystickOverlay = () => {
  if (joystickCanvas) return;

  // Create joystick overlay canvas
  joystickCanvas = document.createElement('canvas');
  joystickCanvas.id = 'canvas-overlay-joystick';
  joystickCanvas.style.position = 'absolute';
  joystickCanvas.style.top = '0';
  joystickCanvas.style.left = '0';
  joystickCanvas.style.pointerEvents = 'none';
  joystickCanvas.style.zIndex = '1000';
  document.body.appendChild(joystickCanvas);

  joystickCanvas.width = window.innerWidth;
  joystickCanvas.height = window.innerHeight;
  joystickCtx = joystickCanvas.getContext('2d');
};

const TouchJoystickRenderSystem = (world, dt, touchState) => {
  initJoystickOverlay();

  if (!joystickCtx || !touchState) return;

  // Clear canvas
  joystickCtx.clearRect(0, 0, joystickCanvas.width, joystickCanvas.height);

  // Only draw if joystick is active
  if (!touchState.active) return;

  const { origin, knob, radius } = touchState;

  // Draw outer circle (base)
  joystickCtx.beginPath();
  joystickCtx.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
  joystickCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  joystickCtx.lineWidth = 2;
  joystickCtx.stroke();
  joystickCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  joystickCtx.fill();

  // Draw inner circle (knob)
  joystickCtx.beginPath();
  joystickCtx.arc(knob.x, knob.y, radius * 0.4, 0, Math.PI * 2);
  joystickCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  joystickCtx.fill();
  joystickCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  joystickCtx.lineWidth = 2;
  joystickCtx.stroke();
};

// Resize handler
window.addEventListener('resize', () => {
  if (joystickCanvas) {
    joystickCanvas.width = window.innerWidth;
    joystickCanvas.height = window.innerHeight;
  }
});
