// CanvasOverlaySystem.js - 2D HUD overlay
// DOM canvas for debug info and UI elements

let overlayCanvas = null;
let overlayCtx = null;

const initCanvasOverlay = () => {
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'overlay-canvas';
  overlayCanvas.width = windowWidth;
  overlayCanvas.height = windowHeight;

  Object.assign(overlayCanvas.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    zIndex: '10'
  });

  document.body.appendChild(overlayCanvas);
  overlayCtx = overlayCanvas.getContext('2d');

  console.log(`Canvas overlay: ${overlayCanvas.width}x${overlayCanvas.height}`);
};

const resizeCanvasOverlay = () => {
  if (overlayCanvas) {
    overlayCanvas.width = windowWidth;
    overlayCanvas.height = windowHeight;
  }
};

const renderOverlayText = (overlay) => {
  const {
    x = 0,
    y = 0,
    text,
    fontSize = 12,
    color = 'white',
    bgColor = 'rgba(0, 0, 0, 0.7)',
    padding = 0,
  } = overlay;

  const lines = Array.isArray(text) ? text : [text];
  const lineHeight = fontSize * 1.4;

  overlayCtx.font = `${fontSize}px system-ui`;
  overlayCtx.textBaseline = 'top';

  const maxWidth = max(...lines.map(line => overlayCtx.measureText(line).width));

  overlayCtx.fillStyle = bgColor;
  overlayCtx.fillRect(
    x,
    y,
    maxWidth + padding * 2,
    lines.length * lineHeight + padding * 2 - 6
  );

  overlayCtx.fillStyle = color;
  lines.forEach((line, i) => {
    overlayCtx.fillText(line, x + padding, y + padding + i * lineHeight);
  });
};

const CanvasOverlaySystem = (world, dt) => {
  if (!overlayCtx) return;

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  queryEntities(world, 'CanvasOverlay').forEach(entity =>
    renderOverlayText(entity.CanvasOverlay)
  );
};
