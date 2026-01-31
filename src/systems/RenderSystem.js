// RenderSystem.js - Rendering with Y-up coordinate system

function RenderSystem(world, dt) {
  background(20);

  // Apply global coordinate transform: Y-up world to Y-down p5
  // This flips the Y axis for rendering
  push();
  scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE);

  // Lighting (in flipped coordinate system)
  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0); // Pointing up in Y-down, becomes down after Y-flip

  // Render box colliders
  const colliders = queryEntities(world, 'Collider');
  for (let entity of colliders) {
    const col = entity.Collider;

    if (col.type === 'box') {
      push();

      // Translate to position (world coordinates)
      translate(col.pos.x, col.pos.y, col.pos.z);

      // Rotate using world space rotations
      // Negate X and Z because Y-flip reverses handedness
      rotateY(radians(col.rot.y));
      rotateX(radians(-col.rot.x));
      rotateZ(radians(-col.rot.z));

      // Scale
      scale(col.scale.x, col.scale.y, col.scale.z);

      // Draw box
      fill(100, 200, 255);
      noStroke();
      box(col.size[0], col.size[1], col.size[2]);

      pop();
    }
  }

  // Render player
  const players = queryEntities(world, 'Player', 'Transform');
  for (let player of players) {
    const pos = player.Transform.pos;
    const radius = player.Player.radius;

    push();
    translate(pos.x, pos.y, pos.z);
    fill(0, 255, 100);
    noStroke();
    sphere(radius);
    pop();
  }

  pop(); // End global coordinate transform
}
