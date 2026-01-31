// RenderSystem.js - Simple box rendering

// Helper: Convert world coordinates to p5 coordinates (negate Y, scale)
function worldToP5(worldPos) {
  return {
    x: worldPos.x * WORLD_SCALE,
    y: -worldPos.y * WORLD_SCALE, // Negate Y to flip from Y-up to Y-down
    z: worldPos.z * WORLD_SCALE
  };
}

function RenderSystem(world, dt) {
  background(20);

  // Lighting
  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0); // Straight down from above

  // Render box colliders
  const colliders = queryEntities(world, 'Collider');
  for (let entity of colliders) {
    const col = entity.Collider;

    if (col.type === 'box') {
      const p5Pos = worldToP5(col.pos);

      push();
      translate(p5Pos.x, p5Pos.y, p5Pos.z);

      // Apply rotation in YXZ order (same as eulerToMatrix)
      // Negate X and Z rotations for Y-down coordinate system
      rotateY(col.rot.y);
      rotateX(-col.rot.x);
      rotateZ(-col.rot.z);

      // Apply scale (including WORLD_SCALE conversion)
      scale(col.scale.x * WORLD_SCALE, col.scale.y * WORLD_SCALE, col.scale.z * WORLD_SCALE);

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

    const p5Pos = worldToP5(pos);
    push();
    translate(p5Pos.x, p5Pos.y, p5Pos.z);
    fill(0, 255, 100);
    noStroke();
    sphere(radius * WORLD_SCALE);
    pop();
  }
}
