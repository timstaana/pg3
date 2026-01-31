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
  const { Transform: { pos }, Player: { radius } } = player;
  push();
  translate(pos.x, pos.y, pos.z);
  fill(0, 255, 100);
  noStroke();
  sphere(radius);
  pop();
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

  pop();
};
