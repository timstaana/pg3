// textRenderer.js - Flexible text rendering system for 3D world and screen-fixed text

// ========== Text Label System ==========

let textGraphicsCache = new Map(); // Cache graphics buffers by size key

// Get or create a graphics buffer for text rendering
function getTextGraphics(width, height) {
  const key = `${width}x${height}`;

  if (!textGraphicsCache.has(key)) {
    const g = createGraphics(width, height);
    g.textFont('monospace');
    g.textSize(14);
    textGraphicsCache.set(key, g);
  }

  return textGraphicsCache.get(key);
}

// Render text to a graphics buffer and return it
function renderTextToGraphics(lines, width, height, options = {}) {
  const g = getTextGraphics(width, height);
  const fontSize = options.fontSize || 14;
  const textColor = options.color || [255, 255, 255];
  const bgColor = options.bgColor || null;
  const padding = options.padding || 10;

  g.clear();

  // Optional background
  if (bgColor) {
    g.fill(bgColor[0], bgColor[1], bgColor[2], bgColor[3] || 180);
    g.noStroke();
    g.rect(0, 0, width, height);
  }

  // Render text
  g.fill(textColor[0], textColor[1], textColor[2]);
  g.noStroke();
  g.textAlign(LEFT, TOP);
  g.textSize(fontSize);

  let y = padding;
  const lineHeight = fontSize + 6;

  for (let line of lines) {
    g.text(line, padding, y);
    y += lineHeight;
  }

  return g;
}

// Draw screen-fixed text (2D overlay, fixed in front of camera)
function drawScreenText(lines, x, y, width, height, options = {}) {
  const g = renderTextToGraphics(lines, width, height, options);

  // Access camera rig from CameraSystem
  if (!cameraRig) return;

  const camPos = cameraRig.camPosWorld;
  const lookAt = cameraRig.lookAtWorld;

  // Calculate camera forward, right, and up vectors
  const forward = p5.Vector.sub(lookAt, camPos).normalize();
  const worldUp = createVector(0, 1, 0);
  const right = p5.Vector.cross(forward, worldUp).normalize();
  const up = p5.Vector.cross(right, forward).normalize();

  // Screen-space offsets (pixels to world units)
  const screenScale = 0.02; // Adjust for desired UI scale
  const offsetX = (x - windowWidth / 2) * screenScale;
  const offsetY = (y - windowHeight / 2) * screenScale;
  const distanceFromCam = 2.0; // World units in front of camera

  // Calculate text position: camera + forward*distance + right*x + up*y
  const textPosWorld = p5.Vector.add(
    p5.Vector.add(camPos, p5.Vector.mult(forward, distanceFromCam)),
    p5.Vector.add(p5.Vector.mult(right, offsetX), p5.Vector.mult(up, -offsetY))
  );

  // Convert to p5 coordinates
  const textPosP5 = {
    x: textPosWorld.x * WORLD_SCALE,
    y: -textPosWorld.y * WORLD_SCALE,
    z: textPosWorld.z * WORLD_SCALE
  };

  push();
  translate(textPosP5.x, textPosP5.y, textPosP5.z);

  // Rotate to face camera
  const yawAngle = atan2(forward.x, forward.z);
  const pitchAngle = asin(-forward.y);
  rotateY(-yawAngle);
  rotateX(pitchAngle);

  noStroke();
  texture(g);
  plane(width * screenScale * WORLD_SCALE, height * screenScale * WORLD_SCALE);
  pop();
}

// Draw world-space text (billboard that faces camera)
function drawWorldText(lines, worldPos, width, height, options = {}) {
  const g = renderTextToGraphics(lines, width, height, options);

  // Convert world position to p5 coordinates
  const p5Pos = {
    x: worldPos.x * WORLD_SCALE,
    y: -worldPos.y * WORLD_SCALE,
    z: worldPos.z * WORLD_SCALE
  };

  push();
  translate(p5Pos.x, p5Pos.y, p5Pos.z);

  // Billboard effect - always face camera (optional)
  if (options.billboard !== false) {
    // Get camera angles and rotate to face it
    // For now, simple approach - could be enhanced
    rotateY(atan2(p5Pos.x, p5Pos.z));
  }

  noStroke();
  texture(g);
  plane(width, height);
  pop();
}

// Clean up cached graphics buffers (call on window resize)
function clearTextGraphicsCache() {
  for (let [key, g] of textGraphicsCache) {
    g.remove();
  }
  textGraphicsCache.clear();
}
