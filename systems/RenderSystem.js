// RenderSystem.js - 3D wireframe rendering
// Y-up world space converted to p5.js Y-down space

let alphaCutoutShader = null;
let outlineShader = null;
let outlineShaderFailed = false; // Track if shader failed to prevent repeated errors

const renderBoxCollider = (col) => {
  push();
  translate(col.pos.x, col.pos.y, col.pos.z);
  rotateY(radians(col.rot.y));
  rotateX(radians(-col.rot.x));
  rotateZ(radians(-col.rot.z));
  scale(col.scale.x, col.scale.y, col.scale.z);
  fill(100, 200, 255);
  noStroke();
  box(col.size[0], col.size[1], col.size[2]);
  pop();
};

const renderMeshCollider = (col) => {
  if (!col.geometry) {
    col.geometry = new p5.Geometry();

    col.faces.forEach(face => {
      const v0 = col.vertices[face[0].vertex];
      const v1 = col.vertices[face[1].vertex];
      const v2 = col.vertices[face[2].vertex];

      col.geometry.vertices.push(createVector(v0.x, v0.y, v0.z));
      col.geometry.vertices.push(createVector(v1.x, v1.y, v1.z));
      col.geometry.vertices.push(createVector(v2.x, v2.y, v2.z));

      if (col.uvs && col.uvs.length > 0) {
        const uv0 = face[0].uv >= 0 ? col.uvs[face[0].uv] : createVector(0, 0);
        const uv1 = face[1].uv >= 0 ? col.uvs[face[1].uv] : createVector(0, 0);
        const uv2 = face[2].uv >= 0 ? col.uvs[face[2].uv] : createVector(0, 0);

        col.geometry.uvs.push(uv0.x, uv0.y);
        col.geometry.uvs.push(uv1.x, uv1.y);
        col.geometry.uvs.push(uv2.x, uv2.y);
      }

      const len = col.geometry.vertices.length;
      col.geometry.faces.push([len - 3, len - 2, len - 1]);
    });

    col.geometry.computeNormals();
  }

  push();
  translate(col.pos.x, col.pos.y, col.pos.z);

  // Try ZXY order to match collision matrix (YXZ intrinsic)
  rotateZ(radians(-col.rot.z));
  rotateX(radians(-col.rot.x));
  rotateY(radians(-col.rot.y));

  scale(col.scale.x, col.scale.y, col.scale.z);

  if (col.texture) {
    texture(col.texture);
  } else {
    ambientMaterial(150);
  }

  noStroke();
  model(col.geometry);
  pop();
};

// Generic character sprite rendering (used by player and NPCs)
const renderCharacterSprite = (pos, rot, anim, radius, frontTex, backTex, isInteractable = false) => {
  // Calculate camera direction relative to character
  const camPos = cameraRig.camPosWorld;
  const toCamera = p5.Vector.sub(camPos, pos);
  toCamera.y = 0; // Only consider horizontal angle
  toCamera.normalize();

  // Character forward direction based on yaw
  const yawRad = radians(-rot.y);
  const forward = createVector(sin(yawRad), 0, cos(yawRad));

  // Determine if camera is in front or behind character
  const dot = toCamera.dot(forward);
  const useFrontTexture = dot > 0;

  // Calculate UV coordinates for current frame
  // 3 frames arranged horizontally
  const frameWidth = 1 / anim.totalFrames;
  let uMin = anim.currentFrame * frameWidth;
  let uMax = (anim.currentFrame + 1) * frameWidth;

  // Flip UVs horizontally for back texture
  if (!useFrontTexture) {
    [uMin, uMax] = [uMax, uMin];
  }

  // Calculate glow effect for interactable NPCs
  const pulseSpeed = 1.2;
  const pulseAmount = 0.2;
  const pulse = isInteractable ? Math.sin(millis() * 0.001 * pulseSpeed * 2 * Math.PI) * pulseAmount : 0;
  const glowStrength = isInteractable ? 0.4 + pulse : 0;

  push();
  translate(pos.x, pos.y, pos.z);

  // Rotate sprite to face character's direction
  rotateY(radians(-rot.y));

  // Character size: 1 width x 1.5 height
  // Sprite originates from bottom of collision sphere (feet at ground)
  const halfWidth = 0.5;
  const characterHeight = 1.5;
  const spriteBottom = -radius;

  // Make sprite unaffected by scene lighting - render at full brightness
  noLights();

  noStroke();
  fill(255); // Render texture at full brightness

  const charTexture = useFrontTexture ? frontTex : backTex;
  texture(charTexture);
  textureMode(NORMAL);

  // Apply alpha cutout shader if available
  if (alphaCutoutShader) {
    shader(alphaCutoutShader);
    alphaCutoutShader.setUniform('uTexture', charTexture);
    alphaCutoutShader.setUniform('uAlphaCutoff', 0.1); // Discard pixels with alpha < 0.1
  }

  beginShape();
  vertex(-halfWidth, spriteBottom, 0, uMin, 1);
  vertex(halfWidth, spriteBottom, 0, uMax, 1);
  vertex(halfWidth, spriteBottom + characterHeight, 0, uMax, 0);
  vertex(-halfWidth, spriteBottom + characterHeight, 0, uMin, 0);
  endShape(CLOSE);

  // Reset shader
  if (alphaCutoutShader) {
    resetShader();
  }

  // Add glowing overlay if interactable
  if (isInteractable) {
    blendMode(ADD);
    const glowAlpha = map(glowStrength, 0.2, 0.6, 30, 80);
    fill(255, 220, 100, glowAlpha); // Warm yellow glow

    // Render without texture for solid color overlay
    // Slightly forward (z=0.01) to prevent z-fighting with main sprite
    const glowOffset = 0.01;
    beginShape();
    vertex(-halfWidth, spriteBottom, glowOffset);
    vertex(halfWidth, spriteBottom, glowOffset);
    vertex(halfWidth, spriteBottom + characterHeight, glowOffset);
    vertex(-halfWidth, spriteBottom + characterHeight, glowOffset);
    endShape(CLOSE);
    blendMode(BLEND); // Reset blend mode
  }

  // Restore scene lighting for other objects
  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  pop();
};

const renderPlayer = (player) => {
  const { Transform: { pos, rot }, Animation: anim, Player: playerData } = player;
  renderCharacterSprite(pos, rot, anim, playerData.radius, PLAYER_FRONT_TEX, PLAYER_BACK_TEX);
};

const renderNPC = (npc) => {
  const { Transform: { pos, rot }, Animation: anim, NPC: npcData } = npc;

  // Get textures for this NPC's avatar
  const avatarTextures = NPC_AVATAR_TEXTURES[npcData.avatarId] || NPC_AVATAR_TEXTURES['default'];
  if (!avatarTextures) return; // Skip if textures not loaded

  // Check if NPC is interactable (highlighted when player is nearby)
  // Hide glow during dialogue
  const dialogueActive = typeof getDialogueState === 'function' ? getDialogueState().active : false;
  const isInteractable = npc.Interaction && npc.Interaction.isClosest && !dialogueActive;

  renderCharacterSprite(pos, rot, anim, npcData.radius, avatarTextures.front, avatarTextures.back, isInteractable);
};

const renderLabel = (label) => {
  const options = {
    fontSize: label.fontSize,
    color: label.color,
    bgColor: label.bgColor,
    billboard: label.billboard
  };

  drawWorldText(label.text, label.pos, label.width, label.height, options);
};

const renderSculpture = (sculpture, isInteractable) => {
  // Create geometry on first render
  if (!sculpture.geometry) {
    sculpture.geometry = new p5.Geometry();

    sculpture.faces.forEach(face => {
      const v0 = sculpture.vertices[face[0].vertex];
      const v1 = sculpture.vertices[face[1].vertex];
      const v2 = sculpture.vertices[face[2].vertex];

      sculpture.geometry.vertices.push(createVector(v0.x, v0.y, v0.z));
      sculpture.geometry.vertices.push(createVector(v1.x, v1.y, v1.z));
      sculpture.geometry.vertices.push(createVector(v2.x, v2.y, v2.z));

      if (sculpture.uvs && sculpture.uvs.length > 0) {
        const uv0 = face[0].uv >= 0 ? sculpture.uvs[face[0].uv] : createVector(0, 0);
        const uv1 = face[1].uv >= 0 ? sculpture.uvs[face[1].uv] : createVector(0, 0);
        const uv2 = face[2].uv >= 0 ? sculpture.uvs[face[2].uv] : createVector(0, 0);

        // Flip V coordinate for p5.js texture mapping
        sculpture.geometry.uvs.push(uv0.x, 1 - uv0.y);
        sculpture.geometry.uvs.push(uv1.x, 1 - uv1.y);
        sculpture.geometry.uvs.push(uv2.x, 1 - uv2.y);
      }

      const len = sculpture.geometry.vertices.length;
      sculpture.geometry.faces.push([len - 3, len - 2, len - 1]);
    });

    sculpture.geometry.computeNormals();
  }

  push();
  translate(sculpture.pos.x, sculpture.pos.y, sculpture.pos.z);

  rotateY(radians(sculpture.rot.y));
  rotateX(radians(-sculpture.rot.x));
  rotateZ(radians(-sculpture.rot.z));

  // Apply highlight if interactable (soft breathing effect)
  const pulseSpeed = 1.2;
  const pulseAmount = 0.2;
  const pulse = isInteractable ? Math.sin(millis() * 0.001 * pulseSpeed * 2 * Math.PI) * pulseAmount : 0;
  const glowStrength = isInteractable ? 0.4 + pulse : 0;

  // Draw sculpture
  scale(sculpture.scale.x, sculpture.scale.y, sculpture.scale.z);

  // Render unaffected by scene lighting - full brightness
  noLights();

  noStroke();
  fill(255);

  if (sculpture.texture) {
    texture(sculpture.texture);
  }

  model(sculpture.geometry);

  // Add glowing overlay if interactable
  if (isInteractable) {
    blendMode(ADD);
    const glowAlpha = map(glowStrength, 0.2, 0.6, 30, 80);
    fill(255, 220, 100, glowAlpha); // Warm yellow glow
    // Render without texture for solid color overlay
    model(sculpture.geometry);
    blendMode(BLEND); // Reset blend mode
  }

  // Restore scene lighting for other objects
  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  pop();
};

const renderPainting = (painting, isInteractable) => {
  // Guard: Skip if texture isn't fully loaded yet
  if (!painting.texture) {
    return;
  }

  // Check if texture has valid dimensions (works for both p5.Image and p5.Graphics)
  const texWidth = painting.texture.width || 0;
  const texHeight = painting.texture.height || 0;

  if (texWidth === 0 || texHeight === 0) {
    return;
  }

  // Update graphics buffer if this is an animated GIF
  if (painting.sourceImage && painting.texture instanceof p5.Graphics) {
    // Check if source image is animated
    const frameCount = typeof painting.sourceImage.numFrames === 'function'
      ? painting.sourceImage.numFrames()
      : painting.sourceImage.numFrames;

    if (frameCount && frameCount > 1) {
      // Redraw current frame to graphics buffer
      painting.texture.clear();
      painting.texture.image(painting.sourceImage, 0, 0, texWidth, texHeight);
    }
  }

  push();
  translate(painting.pos.x, painting.pos.y, painting.pos.z);

  // Apply rotation (Y rotation for wall mounting)
  rotateY(radians(painting.rot.y));
  rotateX(radians(-painting.rot.x));
  rotateZ(radians(-painting.rot.z));

  const w = painting.width * painting.scale;
  const h = painting.height * painting.scale;

  const halfW = w / 2;
  const halfH = h / 2;

  // Apply highlight if interactable (soft breathing effect)
  const pulseSpeed = 1.2;
  const pulseAmount = 0.2;
  const pulse = isInteractable ? Math.sin(millis() * 0.001 * pulseSpeed * 2 * Math.PI) * pulseAmount : 0;
  const glowStrength = isInteractable ? 0.4 + pulse : 0;

  // Render unaffected by scene lighting - full brightness
  noLights();

  // Render painting
  noStroke();
  fill(255);

  texture(painting.texture);
  textureMode(NORMAL);

  beginShape();
  vertex(-halfW, -halfH, 0, 0, 1);  // Top-left (flipped V)
  vertex(halfW, -halfH, 0, 1, 1);   // Top-right (flipped V)
  vertex(halfW, halfH, 0, 1, 0);    // Bottom-right (flipped V)
  vertex(-halfW, halfH, 0, 0, 0);   // Bottom-left (flipped V)
  endShape(CLOSE);

  // Add glowing overlay if interactable
  if (isInteractable) {
    blendMode(ADD);
    const glowAlpha = map(glowStrength, 0.2, 0.6, 30, 80);
    fill(255, 220, 100, glowAlpha); // Warm yellow glow
    // Render without texture for solid color overlay
    beginShape();
    vertex(-halfW, -halfH, 0);
    vertex(halfW, -halfH, 0);
    vertex(halfW, halfH, 0);
    vertex(-halfW, halfH, 0);
    endShape(CLOSE);
    blendMode(BLEND); // Reset blend mode
  }

  // Restore scene lighting for other objects
  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  pop();
};

const renderNormalDebug = (player) => {
  const { Transform: { pos }, Player: playerData } = player;

  if (playerData.grounded && playerData.groundNormal) {
    // Draw ground normal in green
    stroke(0, 255, 0);
    strokeWeight(1);
    const normalLen = 2.0;
    const endPos = p5.Vector.add(pos, p5.Vector.mult(playerData.groundNormal, normalLen));
    line(pos.x, pos.y, pos.z, endPos.x, endPos.y, endPos.z);
  }

  if (playerData.steepSlope) {
    // Draw steep slope normal in red
    stroke(255, 0, 0);
    strokeWeight(1);
    const normalLen = 2.0;
    const endPos = p5.Vector.add(pos, p5.Vector.mult(playerData.steepSlope, normalLen));
    line(pos.x, pos.y, pos.z, endPos.x, endPos.y, endPos.z);
  }
};

const RenderSystem = (world, dt) => {
  background(20);

  push();
  scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE);

  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  // Get camera position for frustum culling
  const cameraPos = cameraRig.camPosWorld || createVector(0, 5, 10);
  const cameraLookAt = cameraRig.lookAtWorld || createVector(0, 0, 0);

  // Enable backface culling for meshes only
  const gl = drawingContext;
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // Render colliders with frustum culling
  queryEntities(world, 'Collider').forEach(entity => {
    const col = entity.Collider;

    // Frustum culling: skip if collider is outside view
    if (col.aabb && !isAABBVisible(col.aabb, cameraPos, cameraLookAt)) {
      return; // Skip rendering this collider
    }

    if (col.type === 'box') {
      renderBoxCollider(col);
    } else if (col.type === 'mesh') {
      renderMeshCollider(col);
    }
  });

  // Disable backface culling for sprites
  gl.disable(gl.CULL_FACE);

  // Always render player (they're always in view)
  queryEntities(world, 'Player', 'Transform').forEach(renderPlayer);

  // Render NPCs
  queryEntities(world, 'NPC', 'Transform', 'Animation').forEach(renderNPC);

  // Debug: Draw ground normal (disabled for performance)
  // queryEntities(world, 'Player', 'Transform').forEach(renderNormalDebug);

  // Render labels with distance culling
  queryEntities(world, 'Label').forEach(entity => {
    const label = entity.Label;

    // Skip labels that are too far or behind camera
    if (!isPointVisible(label.pos, cameraPos, cameraLookAt, CULLING_CONFIG.labelMaxDistance)) {
      return; // Skip rendering this label
    }

    renderLabel(label);
  });

  // Enable backface culling for paintings
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // Render paintings with frustum culling
  const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
  const focusedEntity = lightbox ? lightbox.targetEntity : null;

  queryEntities(world, 'Painting').forEach(entity => {
    const painting = entity.Painting;

    // Frustum culling: skip if painting is outside view
    if (!isPointVisible(painting.pos, cameraPos, cameraLookAt, CULLING_CONFIG.labelMaxDistance)) {
      return; // Skip rendering this painting
    }

    const isInteractable = entity.Interaction && entity.Interaction.isClosest;
    const isFocused = focusedEntity === entity;
    // Hide outline when painting is focused
    const showOutline = isInteractable && !isFocused;
    renderPainting(painting, showOutline);
  });

  // Enable backface culling for sculptures
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // Render sculptures with frustum culling
  queryEntities(world, 'Sculpture').forEach(entity => {
    const sculpture = entity.Sculpture;

    // Frustum culling: skip if sculpture is outside view
    if (!isPointVisible(sculpture.pos, cameraPos, cameraLookAt, CULLING_CONFIG.labelMaxDistance)) {
      return; // Skip rendering this sculpture
    }

    const isInteractable = entity.Interaction && entity.Interaction.isClosest;
    const isFocused = focusedEntity === entity;
    renderSculpture(sculpture, isInteractable && !isFocused);
  });

  pop();
};
