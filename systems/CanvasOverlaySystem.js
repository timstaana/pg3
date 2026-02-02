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
    pointerEvents: 'auto', // Enable clicks for URL buttons
    zIndex: '10',
    cursor: 'default',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent'
  });

  document.body.appendChild(overlayCanvas);
  overlayCtx = overlayCanvas.getContext('2d');

  // Unified handler for button clicks (handles both mouse and touch)
  const handleButtonClick = (x, y, e) => {
    const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
    if (lightbox && lightbox.active && lightbox.targetEntity) {
      const entity = lightbox.targetEntity;
      const painting = entity.Painting;
      const sculpture = entity.Sculpture;
      const artworkData = painting || sculpture;

      if (artworkData && artworkData.url && artworkData.uiButtonBounds) {
        const bounds = artworkData.uiButtonBounds;
        if (x >= bounds.x && x <= bounds.x + bounds.width &&
            y >= bounds.y && y <= bounds.y + bounds.height) {
          window.open(artworkData.url, '_blank');
          console.log(`Opening URL: ${artworkData.url}`);
          e.stopPropagation(); // Prevent lightbox from closing
          return true;
        }
      }
    }
    return false;
  };

  // Add click handler for URL buttons (desktop)
  overlayCanvas.addEventListener('click', (e) => {
    const rect = overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    handleButtonClick(x, y, e);
  });

  // Add touch handler for URL buttons (mobile)
  overlayCanvas.addEventListener('touchend', (e) => {
    if (e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const rect = overlayCanvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      if (handleButtonClick(x, y, e)) {
        e.preventDefault(); // Prevent ghost click on mobile
      }
    }
  });

  // Update cursor on hover
  overlayCanvas.addEventListener('mousemove', (e) => {
    const rect = overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
    if (lightbox && lightbox.active && lightbox.targetEntity) {
      const entity = lightbox.targetEntity;
      const painting = entity.Painting;
      const sculpture = entity.Sculpture;
      const artworkData = painting || sculpture;

      if (artworkData && artworkData.url && artworkData.uiButtonBounds) {
        const bounds = artworkData.uiButtonBounds;
        if (x >= bounds.x && x <= bounds.x + bounds.width &&
            y >= bounds.y && y <= bounds.y + bounds.height) {
          overlayCanvas.style.cursor = 'pointer';
          return;
        }
      }
    }
    overlayCanvas.style.cursor = 'default';
  });

  // Prevent mobile text selection, image dragging, and long press menu
  overlayCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  overlayCanvas.addEventListener('dragstart', (e) => {
    e.preventDefault();
  });

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

      // Draw dialogue box background (flat design, no border)
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      overlayCtx.fillRect(20, boxY, overlayCanvas.width - 40, boxHeight);

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
    }
  }

  // Render artwork info panel if in lightbox mode (at bottom, minimal flat design)
  const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
  if (lightbox && lightbox.active && lightbox.targetEntity && lightbox.blend > 0.3) {
    const entity = lightbox.targetEntity;
    const painting = entity.Painting;
    const sculpture = entity.Sculpture;
    const artworkData = painting || sculpture;

    // Only show if artwork has description or URL
    if (artworkData && (artworkData.title || artworkData.description || artworkData.url)) {
      const boxPadding = 20;

      // Calculate box height based on content
      let contentHeight = boxPadding;

      // Title
      if (artworkData.title) {
        contentHeight += 28;
      }

      // Description
      if (artworkData.description) {
        overlayCtx.font = '15px system-ui';
        const words = artworkData.description.split(' ');
        let line = '';
        let lineCount = 0;
        const maxWidth = overlayCanvas.width - (boxPadding * 2) - 40;

        words.forEach((word, i) => {
          const testLine = line + word + ' ';
          const metrics = overlayCtx.measureText(testLine);

          if (metrics.width > maxWidth && i > 0) {
            lineCount++;
            line = word + ' ';
          } else {
            line = testLine;
          }
        });
        lineCount++; // Last line

        contentHeight += lineCount * 20 + 8;
      }

      // URL button
      if (artworkData.url) {
        contentHeight += 36; // Button height
      }

      contentHeight += boxPadding + 25; // Bottom padding for hint text
      const boxHeight = contentHeight;
      const boxY = overlayCanvas.height - boxHeight - 20;

      // Fade in effect
      const alpha = Math.min(1, (lightbox.blend - 0.3) / 0.3);

      // Draw flat background (no border, minimal)
      overlayCtx.fillStyle = `rgba(0, 0, 0, ${0.9 * alpha})`;
      overlayCtx.fillRect(20, boxY, overlayCanvas.width - 40, boxHeight);

      let currentY = boxY + boxPadding;

      // Draw title
      if (artworkData.title) {
        overlayCtx.font = 'bold 16px system-ui';
        overlayCtx.fillStyle = `rgba(255, 215, 0, ${alpha})`; // Gold
        overlayCtx.fillText(artworkData.title, 20 + boxPadding, currentY);
        currentY += 30;
      }

      // Draw description with word wrap
      if (artworkData.description) {
        overlayCtx.font = '15px system-ui';
        overlayCtx.fillStyle = `rgba(255, 255, 255, ${0.85 * alpha})`;
        const maxWidth = overlayCanvas.width - (boxPadding * 2) - 40;
        const words = artworkData.description.split(' ');
        let line = '';
        const lineHeight = 20;

        words.forEach((word, i) => {
          const testLine = line + word + ' ';
          const metrics = overlayCtx.measureText(testLine);

          if (metrics.width > maxWidth && i > 0) {
            overlayCtx.fillText(line, 20 + boxPadding, currentY);
            line = word + ' ';
            currentY += lineHeight;
          } else {
            line = testLine;
          }
        });
        overlayCtx.fillText(line, 20 + boxPadding, currentY);
        currentY += lineHeight + 12;
      }

      // Draw URL button (flat design, no border)
      if (artworkData.url) {
        const buttonWidth = 160;
        const buttonHeight = 36;
        const buttonX = 20 + boxPadding;
        const buttonY = currentY;

        // Button background (flat)
        overlayCtx.fillStyle = `rgba(70, 130, 180, ${alpha})`;
        overlayCtx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);

        // Button text (centered vertically in button)
        overlayCtx.font = '14px system-ui';
        overlayCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        overlayCtx.textAlign = 'center';
        overlayCtx.textBaseline = 'middle';
        overlayCtx.fillText('View More Info ↗', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
        overlayCtx.textAlign = 'left'; // Reset
        overlayCtx.textBaseline = 'top'; // Reset

        // Store button bounds for click detection
        artworkData.uiButtonBounds = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
      }
    }
  }
};
