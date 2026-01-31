// RenderSystem.js - Wireframe rendering for colliders and player

// Debug flags
const debug = {
  drawColliders: true,
  drawPlayer: true,
  drawGroundNormal: true
};

function RenderSystem(world, dt) {
  background(20);

  // Lighting for depth perception
  ambientLight(100);
  directionalLight(200, 200, 200, -0.5, -1, -0.3);

  noFill();
  stroke(255);
  strokeWeight(1);

  // Render colliders
  if (debug.drawColliders) {
    const colliders = queryEntities(world, 'Collider');

    for (let entity of colliders) {
      const col = entity.Collider;

      if (col.type === 'box') {
        drawBoxWireframe(col.pos, col.rot, col.scale, col.size);
      } else if (col.type === 'mesh') {
        drawMeshWireframe(col.vertices, col.faces, col.pos, col.rot, col.scale);
      }
    }
  }

  // Render player
  if (debug.drawPlayer) {
    const players = queryEntities(world, 'Player', 'Transform');

    for (let player of players) {
      const pos = player.Transform.pos;
      const radius = player.Player.radius;

      push();
      translate(pos.x * WORLD_SCALE, pos.y * WORLD_SCALE, pos.z * WORLD_SCALE);
      stroke(0, 255, 100);
      sphere(radius * WORLD_SCALE);
      pop();

      // Draw ground normal when grounded
      if (debug.drawGroundNormal && player.Player.grounded) {
        const normal = player.Player.groundNormal;
        const start = vec3Mul(pos, WORLD_SCALE);
        const end = vec3Mul(vec3Add(pos, vec3Mul(normal, 1.5)), WORLD_SCALE);

        stroke(255, 255, 0);
        strokeWeight(3);
        line(start.x, start.y, start.z, end.x, end.y, end.z);
        strokeWeight(1);
      }
    }
  }
}

// ========== Wireframe Drawing Helpers ==========

function drawBoxWireframe(pos, rot, scale, size) {
  const hw = size[0] * 0.5;
  const hh = size[1] * 0.5;
  const hd = size[2] * 0.5;

  const corners = [
    vec3(-hw, -hh, -hd), vec3(hw, -hh, -hd), vec3(hw, hh, -hd), vec3(-hw, hh, -hd),
    vec3(-hw, -hh, hd), vec3(hw, -hh, hd), vec3(hw, hh, hd), vec3(-hw, hh, hd)
  ];

  // Transform all corners
  const transformed = corners.map(c => {
    const t = transformPoint(c, pos, rot, scale);
    return vec3Mul(t, WORLD_SCALE);
  });

  // Draw edges
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // front face
    [4, 5], [5, 6], [6, 7], [7, 4], // back face
    [0, 4], [1, 5], [2, 6], [3, 7]  // connecting edges
  ];

  stroke(100, 200, 255);
  for (let edge of edges) {
    const a = transformed[edge[0]];
    const b = transformed[edge[1]];
    line(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

function drawMeshWireframe(vertices, faces, pos, rot, scale) {
  stroke(150, 150, 200);

  // Draw each triangle edge
  for (let face of faces) {
    const a = transformPoint(vertices[face[0]], pos, rot, scale);
    const b = transformPoint(vertices[face[1]], pos, rot, scale);
    const c = transformPoint(vertices[face[2]], pos, rot, scale);

    const ap = vec3Mul(a, WORLD_SCALE);
    const bp = vec3Mul(b, WORLD_SCALE);
    const cp = vec3Mul(c, WORLD_SCALE);

    line(ap.x, ap.y, ap.z, bp.x, bp.y, bp.z);
    line(bp.x, bp.y, bp.z, cp.x, cp.y, cp.z);
    line(cp.x, cp.y, cp.z, ap.x, ap.y, ap.z);
  }
}
