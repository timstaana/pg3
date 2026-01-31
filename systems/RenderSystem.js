// RenderSystem.js - 3D wireframe rendering
// Y-up world space converted to p5.js Y-down space

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
  const uMin = anim.currentFrame * frameWidth;
  const uMax = (anim.currentFrame + 1) * frameWidth;

  push();
  translate(pos.x, pos.y, pos.z);

  // Rotate sprite to face player's direction
  rotateY(radians(-rot.y));

  // Player size: 1 width x 1.5 height
  // Sprite originates from bottom of collision sphere (feet at ground)
  const halfWidth = 0.5;
  const playerHeight = 1.5;
  const spriteBottom = -playerData.radius - .3;

  noStroke();
  texture(useFrontTexture ? PLAYER_FRONT_TEX : PLAYER_BACK_TEX);
  textureMode(NORMAL);

  beginShape();
  vertex(-halfWidth, spriteBottom, 0, uMin, 1);
  vertex(halfWidth, spriteBottom, 0, uMax, 1);
  vertex(halfWidth, spriteBottom + playerHeight, 0, uMax, 0);
  vertex(-halfWidth, spriteBottom + playerHeight, 0, uMin, 0);
  endShape(CLOSE);

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

const RenderSystem = (world, dt) => {
  background(20);

  push();
  scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE);

  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  queryEntities(world, 'Collider').forEach(entity => {
    if (entity.Collider.type === 'box') {
      renderBoxCollider(entity.Collider);
    } else if (entity.Collider.type === 'mesh') {
      renderMeshCollider(entity.Collider);
    }
  });

  queryEntities(world, 'Player', 'Transform').forEach(renderPlayer);

  queryEntities(world, 'Label').forEach(entity => renderLabel(entity.Label));

  pop();
};
