// textRenderer.js - Text rendering for 3D world and screen overlays
// Uses p5.Graphics buffers with texture mapping

// ========== Graphics Cache ==========

const textGraphicsCache = new Map();

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

const clearTextGraphicsCache = () => {
  textGraphicsCache.forEach(g => g.remove());
  textGraphicsCache.clear();
};

// ========== Text Rendering ==========

const renderTextToGraphics = (lines, width, height, options = {}) => {
  const {
    fontSize = 14,
    color = [255, 255, 255],
    bgColor = null,
    padding = 10
  } = options;

  const g = getTextGraphics(width, height);
  g.clear();

  if (bgColor) {
    g.fill(...bgColor, bgColor[3] || 180);
    g.noStroke();
    g.rect(0, 0, width, height);
  }

  g.fill(...color);
  g.noStroke();
  g.textAlign(LEFT, TOP);
  g.textSize(fontSize);

  const lineHeight = fontSize + 6;
  lines.forEach((line, i) => {
    g.text(line, padding, padding + i * lineHeight);
  });

  return g;
};

// ========== Camera-Relative Text ==========

const drawScreenText = (lines, x, y, width, height, options = {}) => {
  if (!cameraRig) return;

  const g = renderTextToGraphics(lines, width, height, options);
  const { camPosWorld, lookAtWorld } = cameraRig;

  const forward = p5.Vector.sub(lookAtWorld, camPosWorld).normalize();
  const worldUp = createVector(0, 1, 0);
  const right = p5.Vector.cross(forward, worldUp).normalize();
  const up = p5.Vector.cross(right, forward).normalize();

  const screenScale = 0.02;
  const offsetX = (x - windowWidth / 2) * screenScale;
  const offsetY = (y - windowHeight / 2) * screenScale;
  const distanceFromCam = 2.0;

  const textPosWorld = p5.Vector.add(
    p5.Vector.add(camPosWorld, p5.Vector.mult(forward, distanceFromCam)),
    p5.Vector.add(p5.Vector.mult(right, offsetX), p5.Vector.mult(up, -offsetY))
  );

  const worldToP5 = (pos) => ({
    x: pos.x * WORLD_SCALE,
    y: -pos.y * WORLD_SCALE,
    z: pos.z * WORLD_SCALE
  });

  const textPosP5 = worldToP5(textPosWorld);

  push();
  translate(textPosP5.x, textPosP5.y, textPosP5.z);
  rotateY(-atan2(forward.x, forward.z));
  rotateX(asin(-forward.y));
  noStroke();
  texture(g);
  plane(width * screenScale * WORLD_SCALE, height * screenScale * WORLD_SCALE);
  pop();
};

// ========== World-Space Text ==========

const drawWorldText = (lines, worldPos, width, height, options = {}) => {
  const g = renderTextToGraphics(lines, width, height, options);

  const p5Pos = {
    x: worldPos.x * WORLD_SCALE,
    y: -worldPos.y * WORLD_SCALE,
    z: worldPos.z * WORLD_SCALE
  };

  push();
  translate(p5Pos.x, p5Pos.y, p5Pos.z);

  if (options.billboard !== false) {
    rotateY(atan2(p5Pos.x, p5Pos.z));
  }

  noStroke();
  texture(g);
  plane(width, height);
  pop();
};
