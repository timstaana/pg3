// CanvasOverlaySystem.js - Simple 2D canvas overlay for HUD elements

let overlayCanvas = null;
let overlayCtx = null;

// Initialize the overlay canvas (call once in setup)
function initCanvasOverlay() {
  // Create canvas element
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'overlay-canvas';
  overlayCanvas.width = windowWidth;
  overlayCanvas.height = windowHeight;

  // Style it to overlay the main canvas
  overlayCanvas.style.position = 'absolute';
  overlayCanvas.style.top = '0';
  overlayCanvas.style.left = '0';
  overlayCanvas.style.pointerEvents = 'none'; // Don't block mouse events
  overlayCanvas.style.zIndex = '10';

  // Add to document
  document.body.appendChild(overlayCanvas);

  // Get 2D context
  overlayCtx = overlayCanvas.getContext('2d');

  console.log('Canvas overlay initialized:', overlayCanvas.width, 'x', overlayCanvas.height);
}

// Update overlay canvas size on window resize
function resizeCanvasOverlay() {
  if (overlayCanvas) {
    overlayCanvas.width = windowWidth;
    overlayCanvas.height = windowHeight;
  }
}

// System to render overlay elements
function CanvasOverlaySystem(world, dt) {
  if (!overlayCtx) return;

  // Clear the overlay
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Query entities with CanvasOverlay component
  const entities = queryEntities(world, 'CanvasOverlay');

  for (let entity of entities) {
    const overlay = entity.CanvasOverlay;

    // Draw text at screen position
    const x = overlay.x || 0;
    const y = overlay.y || 0;
    const lines = Array.isArray(overlay.text) ? overlay.text : [overlay.text];

    // Set styles
    overlayCtx.font = `${overlay.fontSize || 14}px monospace`;
    overlayCtx.fillStyle = overlay.bgColor || 'rgba(0, 0, 0, 0.7)';
    overlayCtx.textBaseline = 'top';

    // Measure text
    const lineHeight = (overlay.fontSize || 14) * 1.4;
    const maxWidth = Math.max(...lines.map(line => overlayCtx.measureText(line).width));
    const padding = overlay.padding || 10;

    // Draw background
    overlayCtx.fillRect(
      x,
      y,
      maxWidth + padding * 2,
      lines.length * lineHeight + padding * 2
    );

    // Draw text
    overlayCtx.fillStyle = overlay.color || 'white';
    lines.forEach((line, i) => {
      overlayCtx.fillText(line, x + padding, y + padding + i * lineHeight);
    });
  }
}
