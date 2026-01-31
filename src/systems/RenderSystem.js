// RenderSystem.js - Wireframe rendering for colliders and player

// Debug flags
const debug = {
  drawColliders: true,
  drawPlayer: true,
  drawGroundNormal: true,
  drawIntersections: true
};

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

  // Lighting for depth perception
  ambientLight(100);
  directionalLight(200, 200, 200, -0.5, -1, -0.3);

  // DEBUG spheres removed - see CameraAnchoredTextRenderSystem for camera-anchored test

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

    // Draw intersection lines between boxes
    if (debug.drawIntersections) {
      const boxColliders = colliders.filter(e => e.Collider.type === 'box');
      drawBoxIntersections(boxColliders);
    }
  }

  // Render player
  if (debug.drawPlayer) {
    const players = queryEntities(world, 'Player', 'Transform');

    for (let player of players) {
      const pos = player.Transform.pos;
      const radius = player.Player.radius;

      const p5Pos = worldToP5(pos);
      push();
      translate(p5Pos.x, p5Pos.y, p5Pos.z);
      stroke(0, 255, 100);
      sphere(radius * WORLD_SCALE);
      pop();

      // Draw ground normal when grounded
      if (debug.drawGroundNormal) {
        if (player.Player.grounded) {
          const normal = player.Player.groundNormal;
          const start = worldToP5(pos);
          const end = worldToP5(vec3Add(pos, vec3Mul(normal, 1.5)));

          stroke(255, 255, 0);
          strokeWeight(3);
          line(start.x, start.y, start.z, end.x, end.y, end.z);
          strokeWeight(1);
        }
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
    return worldToP5(t);
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

    const ap = worldToP5(a);
    const bp = worldToP5(b);
    const cp = worldToP5(c);

    line(ap.x, ap.y, ap.z, bp.x, bp.y, bp.z);
    line(bp.x, bp.y, bp.z, cp.x, cp.y, cp.z);
    line(cp.x, cp.y, cp.z, ap.x, ap.y, ap.z);
  }
}

// ========== Box Intersection Detection ==========

let loggedIntersections = false;

function drawBoxIntersections(boxColliders) {
  stroke(255, 0, 0); // Red for intersection lines
  strokeWeight(3);

  let intersectionCount = 0;

  // Check each pair of boxes
  for (let i = 0; i < boxColliders.length; i++) {
    for (let j = i + 1; j < boxColliders.length; j++) {
      const boxA = boxColliders[i].Collider;
      const boxB = boxColliders[j].Collider;

      // Get AABB quick check first
      const aabbA = getBoxAABB(boxA);
      const aabbB = getBoxAABB(boxB);

      // Only do detailed intersection if AABBs overlap
      if (aabbIntersects(aabbA, aabbB)) {
        intersectionCount++;
        // Draw actual intersection lines where boxes meet
        drawBoxEdgeIntersections(boxA, boxB);
      }
    }
  }

  // Log once for debugging
  if (!loggedIntersections) {
    if (intersectionCount > 0) {
      console.log(`✓ Intersection detection active: Drawing ${intersectionCount} intersection(s)`);
    } else {
      console.log(`✓ Intersection detection active: No intersecting boxes found`);
    }
    loggedIntersections = true;
  }

  strokeWeight(1);
}

function getBoxAABB(box) {
  const hw = box.size[0] * 0.5;
  const hh = box.size[1] * 0.5;
  const hd = box.size[2] * 0.5;

  // Get all 8 corners in local space
  const corners = [
    vec3(-hw, -hh, -hd), vec3(hw, -hh, -hd), vec3(hw, hh, -hd), vec3(-hw, hh, -hd),
    vec3(-hw, -hh, hd), vec3(hw, -hh, hd), vec3(hw, hh, hd), vec3(-hw, hh, hd)
  ];

  // Transform corners to world space (transformPoint applies scale)
  const transformed = corners.map(c => transformPoint(c, box.pos, box.rot, box.scale));

  // Find min/max bounds
  const min = vec3(
    Math.min(...transformed.map(p => p.x)),
    Math.min(...transformed.map(p => p.y)),
    Math.min(...transformed.map(p => p.z))
  );
  const max = vec3(
    Math.max(...transformed.map(p => p.x)),
    Math.max(...transformed.map(p => p.y)),
    Math.max(...transformed.map(p => p.z))
  );

  return { min, max };
}

function aabbIntersects(aabbA, aabbB) {
  return (
    aabbA.min.x <= aabbB.max.x && aabbA.max.x >= aabbB.min.x &&
    aabbA.min.y <= aabbB.max.y && aabbA.max.y >= aabbB.min.y &&
    aabbA.min.z <= aabbB.max.z && aabbA.max.z >= aabbB.min.z
  );
}

function drawBoxEdgeIntersections(boxA, boxB) {
  // Get transformed corners for both boxes
  const cornersA = getBoxCorners(boxA);
  const cornersB = getBoxCorners(boxB);

  // Get faces for both boxes
  const facesA = getBoxFaces(cornersA);
  const facesB = getBoxFaces(cornersB);

  // Find face-face intersection lines
  const intersectionLines = [];

  for (let faceA of facesA) {
    for (let faceB of facesB) {
      const line = quadQuadIntersection(faceA, faceB);
      if (line) {
        intersectionLines.push(line);
      }
    }
  }

  // Draw the intersection lines
  if (intersectionLines.length > 0) {
    stroke(255, 0, 0);
    strokeWeight(3);
    noFill();

    for (let intersectionLine of intersectionLines) {
      const a = worldToP5(intersectionLine.start);
      const b = worldToP5(intersectionLine.end);
      line(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
}

function getBoxCorners(box) {
  const hw = box.size[0] * 0.5;
  const hh = box.size[1] * 0.5;
  const hd = box.size[2] * 0.5;

  const localCorners = [
    vec3(-hw, -hh, -hd), vec3(hw, -hh, -hd), vec3(hw, hh, -hd), vec3(-hw, hh, -hd),
    vec3(-hw, -hh, hd), vec3(hw, -hh, hd), vec3(hw, hh, hd), vec3(-hw, hh, hd)
  ];

  return localCorners.map(c => transformPoint(c, box.pos, box.rot, box.scale));
}

function getBoxEdges(corners) {
  const edgeIndices = [
    [0, 1], [1, 2], [2, 3], [3, 0], // front face
    [4, 5], [5, 6], [6, 7], [7, 4], // back face
    [0, 4], [1, 5], [2, 6], [3, 7]  // connecting edges
  ];

  return edgeIndices.map(([i, j]) => ({
    start: corners[i],
    end: corners[j]
  }));
}

function getBoxFaces(corners) {
  const faceIndices = [
    [0, 1, 2, 3], // front (-Z)
    [5, 4, 7, 6], // back (+Z)
    [4, 0, 3, 7], // left (-X)
    [1, 5, 6, 2], // right (+X)
    [4, 5, 1, 0], // bottom (-Y)
    [3, 2, 6, 7]  // top (+Y)
  ];

  return faceIndices.map(indices =>
    indices.map(i => corners[i])
  );
}

function lineSegmentIntersectQuad(lineStart, lineEnd, quad) {
  // Test against two triangles that make up the quad
  let point = lineSegmentIntersectTriangle(lineStart, lineEnd, quad[0], quad[1], quad[2]);
  if (point) return point;

  point = lineSegmentIntersectTriangle(lineStart, lineEnd, quad[0], quad[2], quad[3]);
  if (point) return point;

  return null;
}

function lineSegmentIntersectTriangle(p1, p2, v0, v1, v2) {
  const EPSILON = 0.0000001;

  const edge1 = vec3Sub(v1, v0);
  const edge2 = vec3Sub(v2, v0);
  const dir = vec3Sub(p2, p1);

  const h = vec3Cross(dir, edge2);
  const a = vec3Dot(edge1, h);

  if (a > -EPSILON && a < EPSILON) return null; // Ray parallel to triangle

  const f = 1.0 / a;
  const s = vec3Sub(p1, v0);
  const u = f * vec3Dot(s, h);

  if (u < 0.0 || u > 1.0) return null;

  const q = vec3Cross(s, edge1);
  const v = f * vec3Dot(dir, q);

  if (v < 0.0 || u + v > 1.0) return null;

  const t = f * vec3Dot(edge2, q);

  // Check if intersection is within line segment
  if (t >= 0.0 && t <= 1.0) {
    return vec3Add(p1, vec3Mul(dir, t));
  }

  return null;
}

function quadQuadIntersection(quadA, quadB) {
  const intersectionPoints = [];

  // Get edges of both quads
  const edgesA = [
    { start: quadA[0], end: quadA[1] },
    { start: quadA[1], end: quadA[2] },
    { start: quadA[2], end: quadA[3] },
    { start: quadA[3], end: quadA[0] }
  ];

  const edgesB = [
    { start: quadB[0], end: quadB[1] },
    { start: quadB[1], end: quadB[2] },
    { start: quadB[2], end: quadB[3] },
    { start: quadB[3], end: quadB[0] }
  ];

  // Find where edges of A intersect quad B
  for (let edge of edgesA) {
    const point = lineSegmentIntersectQuad(edge.start, edge.end, quadB);
    if (point) {
      intersectionPoints.push(point);
    }
  }

  // Find where edges of B intersect quad A
  for (let edge of edgesB) {
    const point = lineSegmentIntersectQuad(edge.start, edge.end, quadA);
    if (point) {
      intersectionPoints.push(point);
    }
  }

  // Remove duplicate points
  const uniquePoints = [];
  for (let p of intersectionPoints) {
    let isDuplicate = false;
    for (let up of uniquePoints) {
      if (vec3Len(vec3Sub(p, up)) < 0.001) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      uniquePoints.push(p);
    }
  }

  // If we have exactly 2 points, they form the intersection line
  if (uniquePoints.length === 2) {
    return {
      start: uniquePoints[0],
      end: uniquePoints[1]
    };
  }

  // If we have more than 2 points, find the two furthest apart (endpoints of the line)
  if (uniquePoints.length > 2) {
    let maxDist = 0;
    let point1 = null;
    let point2 = null;

    for (let i = 0; i < uniquePoints.length; i++) {
      for (let j = i + 1; j < uniquePoints.length; j++) {
        const dist = vec3Len(vec3Sub(uniquePoints[i], uniquePoints[j]));
        if (dist > maxDist) {
          maxDist = dist;
          point1 = uniquePoints[i];
          point2 = uniquePoints[j];
        }
      }
    }

    if (point1 && point2 && maxDist > 0.001) {
      return {
        start: point1,
        end: point2
      };
    }
  }

  return null;
}
