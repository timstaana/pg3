// RenderSystem.js - 3D wireframe rendering
// Y-up world space converted to p5.js Y-down space

let alphaCutoutShader = null;

const renderBoxCollider = (col) => {
  push();
  translate(col.pos.x, col.pos.y, col.pos.z);
  rotateY(radians(col.rot.y));
  rotateX(radians(-col.rot.x));
  rotateZ(radians(-col.rot.z));
  scale(col.scale.x, col.scale.y, col.scale.z);
  fill(100, 200, 255);
  // noStroke();
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

const renderPlayer = (player) => {
  const { Transform: { pos, rot }, Animation: anim, Player: playerData } = player;

  // Calculate camera direction relative to player
  const camPos = cameraRig.camPosWorld;
  const toCamera = p5.Vector.sub(camPos, pos);
  toCamera.y = 0; // Only consider horizontal angle
  toCamera.normalize();

  // Player forward direction based on yaw
  const playerYawRad = radians(-rot.y);
  const playerForward = createVector(sin(playerYawRad), 0, cos(playerYawRad));

  // Determine if camera is in front or behind player
  const dot = toCamera.dot(playerForward);
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

  push();
  translate(pos.x, pos.y, pos.z);

  // Rotate sprite to face player's direction
  rotateY(radians(-rot.y));

  // Player size: 1 width x 1.5 height
  // Sprite originates from bottom of collision sphere (feet at ground)
  const halfWidth = 0.5;
  const playerHeight = 1.5;
  const spriteBottom = -playerData.radius;

  // Make sprite unaffected by scene lighting - render at full brightness
  noLights();

  // Use alpha cutout shader if available
  if (alphaCutoutShader) {
    shader(alphaCutoutShader);
    alphaCutoutShader.setUniform('uTexture', useFrontTexture ? PLAYER_FRONT_TEX : PLAYER_BACK_TEX);
    alphaCutoutShader.setUniform('uAlphaCutoff', 0.5);
  }

  noStroke();
  fill(255); // Render texture at full brightness
  texture(useFrontTexture ? PLAYER_FRONT_TEX : PLAYER_BACK_TEX);
  textureMode(NORMAL);

  beginShape();
  vertex(-halfWidth, spriteBottom, 0, uMin, 1);
  vertex(halfWidth, spriteBottom, 0, uMax, 1);
  vertex(halfWidth, spriteBottom + playerHeight, 0, uMax, 0);
  vertex(-halfWidth, spriteBottom + playerHeight, 0, uMin, 0);
  endShape(CLOSE);

  // Reset shader and restore lighting
  if (alphaCutoutShader) {
    resetShader();
  }

  // Restore scene lighting for other objects
  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  pop();
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

  // Always render player (they're always in view)
  queryEntities(world, 'Player', 'Transform').forEach(renderPlayer);

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

  pop();
};
