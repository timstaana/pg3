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

const renderRemotePlayer = (player) => {
  const { Transform: { pos, rot }, Animation: anim, NetworkedPlayer: netData } = player;

  // Try to get textures (prioritize avatar textures, fallback to player textures)
  let frontTex = null;
  let backTex = null;

  // First try NPC avatar textures
  if (typeof NPC_AVATAR_TEXTURES !== 'undefined') {
    const avatarTextures = NPC_AVATAR_TEXTURES[netData.avatar] || NPC_AVATAR_TEXTURES['default'];
    if (avatarTextures && avatarTextures.front && avatarTextures.back) {
      frontTex = avatarTextures.front;
      backTex = avatarTextures.back;
    }
  }

  // Fallback to player textures if avatar textures not available
  if (!frontTex && typeof PLAYER_FRONT_TEX !== 'undefined' && typeof PLAYER_BACK_TEX !== 'undefined') {
    frontTex = PLAYER_FRONT_TEX;
    backTex = PLAYER_BACK_TEX;
  }

  // Skip rendering if no textures available
  if (!frontTex || !backTex) {
    console.warn('Remote player missing textures:', netData.playerId);
    return;
  }

  renderCharacterSprite(pos, rot, anim, netData.radius, frontTex, backTex, false);
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

// ========== Placeholder Rendering ==========

const renderPaintingPlaceholder = (painting, showOutline) => {
  push();
  translate(painting.pos.x, painting.pos.y, painting.pos.z);
  rotateY(radians(painting.rot.y));

  const w = painting.width * painting.scale;
  const h = painting.height * painting.scale;

  noLights();
  noStroke();

  // Pulsing animation for loading state
  const pulse = Math.sin(millis() * 0.002) * 0.2 + 0.8;

  // Different colors based on asset state
  let baseColor;
  if (painting.assetState === 'ERROR') {
    baseColor = [200, 80, 80]; // Red for error
  } else if (painting.assetState === 'LOADING') {
    baseColor = [150, 150, 200]; // Blue-gray for loading
  } else {
    baseColor = [150, 150, 200]; // Blue-gray for not loaded
  }

  fill(baseColor[0] * pulse, baseColor[1] * pulse, baseColor[2] * pulse);

  rect(-w/2, -h/2, w, h);

  // Add glowing overlay if interactable
  if (showOutline) {
    const pulseSpeed = 1.2;
    const pulseAmount = 0.2;
    const outlinePulse = Math.sin(millis() * 0.001 * pulseSpeed * 2 * Math.PI) * pulseAmount;
    const glowStrength = 0.4 + outlinePulse;

    blendMode(ADD);
    const glowAlpha = map(glowStrength, 0.2, 0.6, 30, 80);
    fill(255, 220, 100, glowAlpha); // Warm yellow glow
    rect(-w/2, -h/2, w, h);
    blendMode(BLEND);
  }

  pop();
};

const renderSculpturePlaceholder = (sculpture, showOutline) => {
  push();
  translate(sculpture.pos.x, sculpture.pos.y, sculpture.pos.z);
  rotateY(radians(sculpture.rot.y));
  scale(sculpture.scale.x, sculpture.scale.y, sculpture.scale.z);

  noLights();
  noStroke();

  // Pulsing animation for loading state
  const pulse = Math.sin(millis() * 0.002) * 0.2 + 0.8;

  // Different colors based on asset state
  let baseColor;
  if (sculpture.modelAssetState === 'ERROR' || sculpture.textureAssetState === 'ERROR') {
    baseColor = [220, 100, 100]; // Red for error
  } else if (sculpture.modelAssetState === 'LOADING' || sculpture.textureAssetState === 'LOADING') {
    baseColor = [180, 180, 220]; // Light blue-gray for loading
  } else {
    baseColor = [180, 180, 220]; // Light blue-gray for not loaded
  }

  fill(baseColor[0] * pulse, baseColor[1] * pulse, baseColor[2] * pulse);

  const size = sculpture.bounds || [1, 1, 1];
  box(size[0], size[1], size[2]);

  // Add glowing overlay if interactable
  if (showOutline) {
    const pulseSpeed = 1.2;
    const pulseAmount = 0.2;
    const outlinePulse = Math.sin(millis() * 0.001 * pulseSpeed * 2 * Math.PI) * pulseAmount;
    const glowStrength = 0.4 + outlinePulse;

    blendMode(ADD);
    const glowAlpha = map(glowStrength, 0.2, 0.6, 30, 80);
    fill(255, 220, 100, glowAlpha);
    box(size[0], size[1], size[2]);
    blendMode(BLEND);
  }

  pop();
};

// ========== Asset Rendering ==========

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

    // Calculate center offset to center geometry at origin
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    sculpture.geometry.vertices.forEach(v => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      minZ = Math.min(minZ, v.z);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
      maxZ = Math.max(maxZ, v.z);
    });

    // Calculate center offset
    sculpture.centerOffset = createVector(
      -(minX + maxX) / 2,
      -(minY + maxY) / 2,
      -(minZ + maxZ) / 2
    );
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

  // Center the sculpture within its bounds
  if (sculpture.centerOffset) {
    translate(sculpture.centerOffset.x, sculpture.centerOffset.y, sculpture.centerOffset.z);
  }

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
    // Render without texture for solid color overlay (already centered from above)
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

// ========== Shadow Rendering ==========

// Raycast downward to find ground intersection
const raycastGround = (origin, collisionWorld, maxDistance = 10) => {
  const rayDir = createVector(0, -1, 0); // Down
  let closestHit = null;
  let closestDist = maxDistance;

  // Check all collision triangles
  collisionWorld.tris.forEach(tri => {
    const v0 = tri.a;
    const v1 = tri.b;
    const v2 = tri.c;

    // Skip if triangle is missing vertices
    if (!v0 || !v1 || !v2) return;

    // Ray-triangle intersection using Möller-Trumbore algorithm
    const edge1 = p5.Vector.sub(v1, v0);
    const edge2 = p5.Vector.sub(v2, v0);
    const h = p5.Vector.cross(rayDir, edge2);
    const a = p5.Vector.dot(edge1, h);

    // Ray parallel to triangle
    if (Math.abs(a) < 0.0001) return;

    const f = 1.0 / a;
    const s = p5.Vector.sub(origin, v0);
    const u = f * p5.Vector.dot(s, h);

    if (u < 0.0 || u > 1.0) return;

    const q = p5.Vector.cross(s, edge1);
    const v = f * p5.Vector.dot(rayDir, q);

    if (v < 0.0 || u + v > 1.0) return;

    const t = f * p5.Vector.dot(edge2, q);

    // Check if intersection is in front of ray and closer than previous hits
    if (t > 0.0001 && t < closestDist) {
      closestDist = t;
      const hitPoint = p5.Vector.add(origin, p5.Vector.mult(rayDir, t));
      closestHit = {
        point: hitPoint,
        normal: tri.normal,
        distance: t
      };
    }
  });

  return closestHit;
};

// Render shadow circle at ground position
const renderShadow = (position, collisionWorld) => {
  push();

  // Raycast downward to find ground
  const hit = raycastGround(position, collisionWorld, 10);

  let groundY;
  let distanceFromGround;

  if (hit) {
    // Use raycasted ground position
    groundY = hit.point.y;
    distanceFromGround = hit.distance;
  } else {
    // Fallback to fixed ground level if raycast misses
    groundY = 0.5;
    distanceFromGround = Math.abs(position.y - groundY);
  }

  // Only render shadow if character is reasonably close to ground
  if (distanceFromGround < 10) {
    translate(position.x, groundY + 0.05, position.z);

    // Rotate shadow to align with surface normal
    if (hit && hit.normal) {
      const normal = hit.normal;
      // Compute rotation angles from normal vector
      const angleX = atan2(normal.z, normal.y);
      const angleZ = atan2(normal.x, normal.y);

      rotateZ(-angleZ);
      rotateX(HALF_PI - -angleX);
    } else {
      // Fallback to horizontal for flat ground
      rotateX(HALF_PI);
    }

    // Shadow appearance - larger and visible
    const shadowSize = 0.8;
    const alpha = Math.max(0, .3 - distanceFromGround / 8);

    noStroke();
    fill(0, 0, 0, alpha * 255);
    circle(0, 0, shadowSize);
  }

  pop();
};

const RenderSystem = (world, collisionWorld, dt) => {
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

  // Render shadows for player and NPCs
  queryEntities(world, 'Player', 'Transform').forEach(entity => {
    renderShadow(entity.Transform.pos, collisionWorld);
  });

  queryEntities(world, 'NPC', 'Transform').forEach(entity => {
    renderShadow(entity.Transform.pos, collisionWorld);
  });

  // Render shadows for remote players (multiplayer) with culling
  queryEntities(world, 'NetworkedPlayer', 'Transform').forEach(entity => {
    const pos = entity.Transform.pos;

    // Distance culling: skip if too far
    const distSq = (pos.x - cameraPos.x) ** 2 + (pos.y - cameraPos.y) ** 2 + (pos.z - cameraPos.z) ** 2;
    if (distSq > CULLING_CONFIG.maxRenderDistance ** 2) {
      return;
    }

    // Frustum culling: skip if outside view
    if (!isPointVisible(pos, cameraPos, cameraLookAt, CULLING_CONFIG.maxRenderDistance)) {
      return;
    }

    renderShadow(pos, collisionWorld);
  });

  // Always render player (they're always in view)
  queryEntities(world, 'Player', 'Transform').forEach(renderPlayer);

  // Render NPCs
  queryEntities(world, 'NPC', 'Transform', 'Animation').forEach(renderNPC);

  // Render remote players (multiplayer) with frustum culling
  queryEntities(world, 'NetworkedPlayer', 'Transform', 'Animation').forEach(entity => {
    const pos = entity.Transform.pos;

    // Distance culling: skip if too far from camera
    const distSq = (pos.x - cameraPos.x) ** 2 + (pos.y - cameraPos.y) ** 2 + (pos.z - cameraPos.z) ** 2;
    const maxDistSq = CULLING_CONFIG.maxRenderDistance ** 2;
    if (distSq > maxDistSq) {
      return; // Too far, skip rendering
    }

    // Frustum culling: skip if outside view
    if (!isPointVisible(pos, cameraPos, cameraLookAt, CULLING_CONFIG.maxRenderDistance)) {
      return; // Outside view, skip rendering
    }

    renderRemotePlayer(entity);
  });

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

    // Update last seen frame for asset streaming
    if (painting.lastSeenFrame !== undefined && typeof ASSET_REGISTRY !== 'undefined') {
      painting.lastSeenFrame = ASSET_REGISTRY.frameCounter;
    }

    const isInteractable = entity.Interaction && entity.Interaction.isClosest;
    const isFocused = focusedEntity === entity;
    // Hide outline when painting is focused
    const showOutline = isInteractable && !isFocused;

    // Render based on asset state
    if (painting.assetState === 'LOADED' || !painting.assetState) {
      // Loaded or legacy (no streaming state) - use normal rendering
      renderPainting(painting, showOutline);
    } else {
      // Not loaded, loading, error, or unloaded - show placeholder
      renderPaintingPlaceholder(painting, showOutline);
    }
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

    // Update last seen frame for asset streaming
    if (sculpture.lastSeenFrame !== undefined && typeof ASSET_REGISTRY !== 'undefined') {
      sculpture.lastSeenFrame = ASSET_REGISTRY.frameCounter;
    }

    const isInteractable = entity.Interaction && entity.Interaction.isClosest;
    const isFocused = focusedEntity === entity;
    const showOutline = isInteractable && !isFocused;

    // Render based on asset state
    if (sculpture.modelAssetState === 'LOADED' || !sculpture.modelAssetState) {
      // Loaded or legacy (no streaming state) - use normal rendering
      renderSculpture(sculpture, showOutline);
    } else {
      // Not loaded, loading, error, or unloaded - show placeholder
      renderSculpturePlaceholder(sculpture, showOutline);
    }
  });

  pop();
};
