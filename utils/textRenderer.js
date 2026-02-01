// textRenderer.js - Text rendering for 3D world and screen overlays
// Uses p5.Graphics buffers with texture mapping

// ========== Graphics Cache ==========

const textGraphicsCache = new Map();
let measurementGraphics = null; // Persistent graphics for text measurement

const getTextGraphics = (width, height) => {
  const key = `${width}x${height}`;

  if (!textGraphicsCache.has(key)) {
    const g = createGraphics(width, height);
    g.textFont('system-ui');
    g.textSize(14);
    textGraphicsCache.set(key, g);
  }

  return textGraphicsCache.get(key);
};

const getMeasurementGraphics = () => {
  if (!measurementGraphics) {
    measurementGraphics = createGraphics(100, 100);
  }
  return measurementGraphics;
};

const clearTextGraphicsCache = () => {
  textGraphicsCache.forEach(g => g.remove());
  textGraphicsCache.clear();
  if (measurementGraphics) {
    measurementGraphics.remove();
    measurementGraphics = null;
  }
};

// ========== Text Rendering ==========

const calculateTextDimensions = (lines, fontSize, padding) => {
  // Use persistent graphics buffer for text measurement (avoid create/destroy every frame)
  const g = getMeasurementGraphics();
  g.textSize(fontSize);

  let maxWidth = 0;
  lines.forEach(line => {
    const w = g.textWidth(line);
    if (w > maxWidth) maxWidth = w;
  });

  const lineHeight = fontSize + 6;
  const width = Math.ceil(maxWidth + padding * 2);
  const height = Math.ceil(lines.length * lineHeight + padding * 2);

  return { width, height };
};

const renderTextToGraphics = (lines, width, height, options = {}) => {
  const {
    fontSize = 14,
    color = [255, 255, 255],
    bgColor = null,
    padding = 10
  } = options;

  // Auto-calculate size if not provided
  if (!width || !height) {
    const dims = calculateTextDimensions(lines, fontSize, padding);
    width = dims.width;
    height = dims.height;
  }

  const g = getTextGraphics(width, height);
  g.clear();

  if (bgColor) {
    // p5.js v2 compatible color handling
    if (Array.isArray(bgColor)) {
      if (bgColor.length === 4) {
        g.fill(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
      } else {
        g.fill(bgColor[0], bgColor[1], bgColor[2], 80);
      }
    } else {
      g.fill(bgColor);
    }
    g.noStroke();
    g.rect(0, 0, width, height);
  }

  // p5.js v2 compatible color handling
  if (Array.isArray(color)) {
    if (color.length === 4) {
      g.fill(color[0], color[1], color[2], color[3]);
    } else {
      g.fill(color[0], color[1], color[2]);
    }
  } else {
    g.fill(color);
  }
  g.noStroke();
  g.textAlign(CENTER, CENTER);
  g.textSize(fontSize);

  const lineHeight = fontSize + 6;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    g.text(line, width / 2, startY + i * lineHeight);
  });

  return { g, width, height };
};

// ========== World-Space Text ==========

const drawWorldText = (lines, worldPos, width, height, options = {}) => {
  if (!cameraRig) return;

  const result = renderTextToGraphics(lines, width, height, options);
  const g = result.g;
  const finalWidth = result.width;
  const finalHeight = result.height;

  // Scale from pixel dimensions to reasonable world size
  const worldScale = 0.01;
  const planeWidth = finalWidth * worldScale;
  const planeHeight = finalHeight * worldScale;

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);

  if (options.billboard !== false) {
    // Billboard to face camera
    const camPos = cameraRig.camPosWorld;
    const dx = camPos.x - worldPos.x;
    const dz = camPos.z - worldPos.z;
    rotateY(atan2(dx, dz));
  }

  // Flip the plane to correct for Y-axis inversion in scaled coordinate system
  rotateX(PI);

  noStroke();
  texture(g);
  plane(planeWidth, planeHeight);
  pop();
};
