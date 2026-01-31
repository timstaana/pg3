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
    }
  });

  queryEntities(world, 'Player', 'Transform').forEach(renderPlayer);

  pop();
};
