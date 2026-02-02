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

  // Render dialogue UI if active
  const dialogue = typeof getDialogueState === 'function' ? getDialogueState() : null;
  if (dialogue && dialogue.active && dialogue.conversation) {
    const currentLine = dialogue.conversation.lines[dialogue.currentLine];
    if (currentLine) {
      const boxHeight = 120;
      const boxY = overlayCanvas.height - boxHeight - 20;
      const boxPadding = 20;

      // Draw dialogue box background
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      overlayCtx.fillRect(20, boxY, overlayCanvas.width - 40, boxHeight);

      // Draw border
      overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      overlayCtx.lineWidth = 2;
      overlayCtx.strokeRect(20, boxY, overlayCanvas.width - 40, boxHeight);

      // Draw speaker name
      overlayCtx.font = 'bold 18px system-ui';
      overlayCtx.fillStyle = '#FFD700'; // Gold color for speaker name
      overlayCtx.fillText(currentLine.speaker, 20 + boxPadding, boxY + boxPadding);

      // Draw dialogue text
      overlayCtx.font = '16px system-ui';
      overlayCtx.fillStyle = 'white';
      const textY = boxY + boxPadding + 28;

      // Word wrap the text
      const maxWidth = overlayCanvas.width - 80;
      const words = currentLine.text.split(' ');
      let line = '';
      let lineY = textY;
      const lineHeight = 24;

      words.forEach((word, i) => {
        const testLine = line + word + ' ';
        const metrics = overlayCtx.measureText(testLine);

        if (metrics.width > maxWidth && i > 0) {
          overlayCtx.fillText(line, 20 + boxPadding, lineY);
          line = word + ' ';
          lineY += lineHeight;
        } else {
          line = testLine;
        }
      });
      overlayCtx.fillText(line, 20 + boxPadding, lineY);

      // Draw continue indicator
      const progress = `${dialogue.currentLine + 1}/${dialogue.conversation.lines.length}`;
      overlayCtx.font = '14px system-ui';
      overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      const continueText = dialogue.currentLine < dialogue.conversation.lines.length - 1
        ? `[Press any key] ${progress}`
        : `[End] ${progress}`;
      const continueWidth = overlayCtx.measureText(continueText).width;
      overlayCtx.fillText(continueText, overlayCanvas.width - continueWidth - 40, boxY + boxHeight - 25);
    }
  }
};
