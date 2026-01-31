// collision.js - Collision detection and geometry utilities using p5.Vector

// ========== Transform Utilities ==========

// Build a rotation matrix from Euler angles (YXZ order: yaw, pitch, roll)
function eulerToMatrix(rotDeg) {
  const yaw = radians(rotDeg.y);
  const pitch = radians(rotDeg.x);
  const roll = radians(rotDeg.z);

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  // YXZ order matrix
  return {
    m00: cy * cr + sy * sp * sr, m01: sr * cp, m02: -sy * cr + cy * sp * sr,
    m10: -cy * sr + sy * sp * cr, m11: cr * cp, m12: sy * sr + cy * sp * cr,
    m20: sy * cp, m21: -sp, m22: cy * cp
  };
}

function transformPoint(p, pos, rot, scale) {
  const mat = eulerToMatrix(rot);
  const sx = p.x * scale.x;
  const sy = p.y * scale.y;
  const sz = p.z * scale.z;

  return createVector(
    mat.m00 * sx + mat.m01 * sy + mat.m02 * sz + pos.x,
    mat.m10 * sx + mat.m11 * sy + mat.m12 * sz + pos.y,
    mat.m20 * sx + mat.m21 * sy + mat.m22 * sz + pos.z
  );
}

// ========== Collision Utilities ==========

// Clamp a value between min and max
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Closest point on a triangle to a point
function closestPointOnTriangle(p, a, b, c) {
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
    return p5.Vector.add(a, p5.Vector.mult(ab, v));
  }

  const cp = p5.Vector.sub(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return c.copy();

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return p5.Vector.add(a, p5.Vector.mult(ac, w));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return p5.Vector.add(b, p5.Vector.mult(p5.Vector.sub(c, b), w));
  }

  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return p5.Vector.add(a, p5.Vector.add(p5.Vector.mult(ab, v), p5.Vector.mult(ac, w)));
}

// Test sphere vs triangle, return penetration info
function sphereVsTriangle(center, radius, tri) {
  const closest = closestPointOnTriangle(center, tri.a, tri.b, tri.c);
  const delta = p5.Vector.sub(center, closest);
  const distSq = delta.magSq();

  if (distSq >= radius * radius) {
    return null; // No collision
  }

  const dist = Math.sqrt(distSq);
  let normal;
  let depth;

  if (dist < 0.00001) {
    // Center is on triangle, use triangle normal
    normal = tri.normal.copy();
    depth = radius;
  } else {
    normal = p5.Vector.div(delta, dist);
    depth = radius - dist;
  }

  return {
    normal,
    depth,
    point: closest
  };
}

// ========== Box to Triangles Conversion ==========

function boxToTriangles(pos, rot, scale, size) {
  const hw = size[0] * 0.5;
  const hh = size[1] * 0.5;
  const hd = size[2] * 0.5;

  const corners = [
    createVector(-hw, -hh, -hd), createVector(hw, -hh, -hd), createVector(hw, hh, -hd), createVector(-hw, hh, -hd),
    createVector(-hw, -hh, hd), createVector(hw, -hh, hd), createVector(hw, hh, hd), createVector(-hw, hh, hd)
  ];

  // Transform all corners
  const transformed = corners.map(c => transformPoint(c, pos, rot, scale));

  // Define 6 faces (12 triangles total)
  const tris = [];

  const faces = [
    [0, 1, 2, 3], // front (-Z)
    [5, 4, 7, 6], // back (+Z)
    [4, 0, 3, 7], // left (-X)
    [1, 5, 6, 2], // right (+X)
    [4, 5, 1, 0], // bottom (-Y)
    [3, 2, 6, 7]  // top (+Y)
  ];

  for (let face of faces) {
    const a = transformed[face[0]];
    const b = transformed[face[1]];
    const c = transformed[face[2]];
    const d = transformed[face[3]];

    // Triangle 1: a, b, c
    tris.push({ a: a.copy(), b: b.copy(), c: c.copy() });
    // Triangle 2: a, c, d
    tris.push({ a: a.copy(), b: c.copy(), c: d.copy() });
  }

  return tris;
}

// ========== Triangle Preprocessing ==========

function computeTriangleNormal(a, b, c) {
  const ab = p5.Vector.sub(b, a);
  const ac = p5.Vector.sub(c, a);
  const normal = p5.Vector.cross(ab, ac);
  normal.normalize();
  return normal;
}

function computeTriangleAABB(a, b, c) {
  return {
    minX: Math.min(a.x, b.x, c.x),
    maxX: Math.max(a.x, b.x, c.x),
    minY: Math.min(a.y, b.y, c.y),
    maxY: Math.max(a.y, b.y, c.y),
    minZ: Math.min(a.z, b.z, c.z),
    maxZ: Math.max(a.z, b.z, c.z)
  };
}

function preprocessTriangle(tri) {
  tri.normal = computeTriangleNormal(tri.a, tri.b, tri.c);
  tri.aabb = computeTriangleAABB(tri.a, tri.b, tri.c);
  return tri;
}
