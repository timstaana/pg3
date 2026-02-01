// collision.js - Collision system for 3D platformer
// Sphere-triangle collision, spatial queries, and world management

// ========== 3D Transforms ==========

const eulerToMatrix = (rotDeg) => {
  const [yaw, pitch, roll] = [
    radians(rotDeg.y),
    radians(rotDeg.x),
    radians(rotDeg.z)
  ];

  const [cy, sy] = [cos(yaw), sin(yaw)];
  const [cp, sp] = [cos(pitch), sin(pitch)];
  const [cr, sr] = [cos(roll), sin(roll)];

  return {
    m00: cy * cr + sy * sp * sr, m01: sr * cp, m02: -sy * cr + cy * sp * sr,
    m10: -cy * sr + sy * sp * cr, m11: cr * cp, m12: sy * sr + cy * sp * cr,
    m20: sy * cp, m21: -sp, m22: cy * cp
  };
};

const transformPoint = (p, pos, rot, scale) => {
  const mat = eulerToMatrix(rot);
  const scaled = createVector(
    p.x * scale.x,
    p.y * scale.y,
    p.z * scale.z
  );

  return createVector(
    mat.m00 * scaled.x + mat.m01 * scaled.y + mat.m02 * scaled.z + pos.x,
    mat.m10 * scaled.x + mat.m11 * scaled.y + mat.m12 * scaled.z + pos.y,
    mat.m20 * scaled.x + mat.m21 * scaled.y + mat.m22 * scaled.z + pos.z
  );
};

// ========== Math Utilities ==========

const clamp = (val, min, max) => constrain(val, min, max);

// ========== Triangle Collision ==========

const closestPointOnTriangle = (p, a, b, c) => {
  const ab = p5.Vector.sub(b, a);
  const ac = p5.Vector.sub(c, a);
  const ap = p5.Vector.sub(p, a);

  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return a.copy();

  const bp = p5.Vector.sub(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return b.copy();

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return p5.Vector.add(a, ab.copy().mult(v));
  }

  const cp = p5.Vector.sub(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return c.copy();

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return p5.Vector.add(a, ac.copy().mult(w));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const bc = p5.Vector.sub(c, b);
    return p5.Vector.add(b, bc.mult(w));
  }

  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;

  return p5.Vector.add(
    a,
    p5.Vector.add(ab.copy().mult(v), ac.copy().mult(w))
  );
};

const sphereVsTriangle = (center, radius, tri) => {
  const closest = closestPointOnTriangle(center, tri.a, tri.b, tri.c);
  const delta = p5.Vector.sub(center, closest);
  const distSq = delta.magSq();
  const radiusSq = radius * radius;

  if (distSq >= radiusSq) return null;

  const dist = sqrt(distSq);
  const EPSILON = 0.00001;

  if (dist < EPSILON) {
    return {
      normal: tri.normal.copy(),
      depth: radius,
      point: closest
    };
  }

  return {
    normal: delta.copy().div(dist),
    depth: radius - dist,
    point: closest
  };
};

// ========== Geometry Conversion ==========

const boxToTriangles = (pos, rot, scale, size) => {
  const [hw, hh, hd] = size.map(s => s * 0.5);

  const corners = [
    createVector(-hw, -hh, -hd), createVector(hw, -hh, -hd),
    createVector(hw, hh, -hd), createVector(-hw, hh, -hd),
    createVector(-hw, -hh, hd), createVector(hw, -hh, hd),
    createVector(hw, hh, hd), createVector(-hw, hh, hd)
  ];

  const transformed = corners.map(c => transformPoint(c, pos, rot, scale));

  const faceIndices = [
    [0, 1, 2, 3], // front
    [5, 4, 7, 6], // back
    [4, 0, 3, 7], // left
    [1, 5, 6, 2], // right
    [4, 5, 1, 0], // bottom
    [3, 2, 6, 7]  // top
  ];

  return faceIndices.flatMap(face => {
    const [a, b, c, d] = face.map(i => transformed[i]);
    return [
      { a: a.copy(), b: b.copy(), c: c.copy() },
      { a: a.copy(), b: c.copy(), c: d.copy() }
    ];
  });
};

// ========== Triangle Processing ==========

const computeTriangleNormal = (a, b, c) => {
  const ab = p5.Vector.sub(b, a);
  const ac = p5.Vector.sub(c, a);
  return p5.Vector.cross(ab, ac).normalize();
};

const computeTriangleAABB = (a, b, c) => ({
  minX: min(a.x, b.x, c.x), maxX: max(a.x, b.x, c.x),
  minY: min(a.y, b.y, c.y), maxY: max(a.y, b.y, c.y),
  minZ: min(a.z, b.z, c.z), maxZ: max(a.z, b.z, c.z)
});

const computeBoxAABB = (pos, rot, scale, size) => {
  // For simplicity, compute AABB from box corners
  const [hw, hh, hd] = size.map(s => s * 0.5);
  const corners = [
    createVector(-hw, -hh, -hd), createVector(hw, -hh, -hd),
    createVector(hw, hh, -hd), createVector(-hw, hh, -hd),
    createVector(-hw, -hh, hd), createVector(hw, -hh, hd),
    createVector(hw, hh, hd), createVector(-hw, hh, hd)
  ];

  const transformed = corners.map(c => transformPoint(c, pos, rot, scale));

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  transformed.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  });

  return { minX, maxX, minY, maxY, minZ, maxZ };
};

const preprocessTriangle = (tri) => {
  tri.normal = computeTriangleNormal(tri.a, tri.b, tri.c);

  // Only flip normals for walkable surfaces (not walls)
  // Check if surface is walkable based on Y component magnitude
  const absY = Math.abs(tri.normal.y);
  if (absY >= MIN_GROUND_NY && tri.normal.y < 0) {
    // This is a walkable surface with flipped normal - flip it
    tri.normal.mult(-1);
  }

  tri.aabb = computeTriangleAABB(tri.a, tri.b, tri.c);
  return tri;
};

// ========== Collision World ==========

const createCollisionWorld = () => ({
  tris: []
});

const addBoxCollider = (collisionWorld, pos, rot, scale, size) => {
  const tris = boxToTriangles(pos, rot, scale, size);
  tris.forEach(tri => {
    preprocessTriangle(tri);
    collisionWorld.tris.push(tri);
  });
};

const addMeshCollider = (collisionWorld, vertices, faces, pos, rot, scale) => {
  faces.forEach(face => {
    const tri = {
      a: transformPoint(vertices[face[0]], pos, rot, scale),
      b: transformPoint(vertices[face[1]], pos, rot, scale),
      c: transformPoint(vertices[face[2]], pos, rot, scale)
    };
    preprocessTriangle(tri);
    collisionWorld.tris.push(tri);
  });
};

// ========== Spatial Queries ==========

const aabbOverlap = (aabb, queryBox) => !(
  aabb.maxX < queryBox.min.x || aabb.minX > queryBox.max.x ||
  aabb.maxY < queryBox.min.y || aabb.minY > queryBox.max.y ||
  aabb.maxZ < queryBox.min.z || aabb.minZ > queryBox.max.z
);

const queryTrianglesNearPlayer = (collisionWorld, playerPos, playerRadius, config = {}, velocity = null) => {
  const { queryMargin = 0.5, downMargin = 2.0, upMargin = 2.0 } = config;

  // Expand query box based on velocity to catch fast-moving collisions
  let extraDown = 0;
  let extraUp = 0;
  let extraX = 0;
  let extraZ = 0;

  if (velocity) {
    // Look ahead in the direction of movement
    if (velocity.y < 0) extraDown = Math.abs(velocity.y) * 0.1; // Look ahead when falling
    if (velocity.y > 0) extraUp = velocity.y * 0.1; // Look ahead when rising
    if (velocity.x < 0) extraX = Math.abs(velocity.x) * 0.1;
    if (velocity.z < 0) extraZ = Math.abs(velocity.z) * 0.1;
  }

  const queryBox = {
    min: createVector(
      playerPos.x - playerRadius - queryMargin - extraX,
      playerPos.y - downMargin - extraDown,
      playerPos.z - playerRadius - queryMargin - extraZ
    ),
    max: createVector(
      playerPos.x + playerRadius + queryMargin + (velocity && velocity.x > 0 ? velocity.x * 0.1 : 0),
      playerPos.y + upMargin + extraUp,
      playerPos.z + playerRadius + queryMargin + (velocity && velocity.z > 0 ? velocity.z * 0.1 : 0)
    )
  };

  return collisionWorld.tris.filter(tri =>
    aabbOverlap(tri.aabb, queryBox)
  );
};

// ========== OBJ Parser ==========

const parseOBJ = (objText) => {
  const lines = objText.split('\n');
  const vertices = [];
  const uvs = [];
  const faces = [];

  lines.forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;

    const parts = line.split(/\s+/);
    const type = parts[0];

    if (type === 'v') {
      vertices.push(createVector(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      ));
    } else if (type === 'vt') {
      uvs.push(createVector(
        parseFloat(parts[1]),
        parseFloat(parts[2])
      ));
    } else if (type === 'f') {
      const indices = parts.slice(1).map(part => {
        const [v, vt] = part.split('/');
        return {
          vertex: parseInt(v) - 1,
          uv: vt ? parseInt(vt) - 1 : -1
        };
      });

      if (indices.length === 3) {
        faces.push(indices);
      } else if (indices.length === 4) {
        faces.push([indices[0], indices[1], indices[2]]);
        faces.push([indices[0], indices[2], indices[3]]);
      }
    }
  });

  return { vertices, uvs, faces };
};
