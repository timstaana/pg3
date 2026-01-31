// math3d.js - Minimal 3D math utilities for collision

// ========== Vector Operations ==========

function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

function vec3Copy(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function vec3Add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vec3Sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Mul(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vec3Dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function vec3Len(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3LenSq(v) {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

function vec3Normalize(v) {
  const len = vec3Len(v);
  if (len < 0.00001) return { x: 0, y: 1, z: 0 };
  return vec3Mul(v, 1.0 / len);
}

function vec3Lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}

// ========== Transform Utilities ==========

function degToRad(deg) {
  return deg * Math.PI / 180.0;
}

// Build a rotation matrix from Euler angles (YXZ order: yaw, pitch, roll)
function eulerToMatrix(rotDeg) {
  const yaw = degToRad(rotDeg.y);
  const pitch = degToRad(rotDeg.x);
  const roll = degToRad(rotDeg.z);

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

  return {
    x: mat.m00 * sx + mat.m01 * sy + mat.m02 * sz + pos.x,
    y: mat.m10 * sx + mat.m11 * sy + mat.m12 * sz + pos.y,
    z: mat.m20 * sx + mat.m21 * sy + mat.m22 * sz + pos.z
  };
}

// ========== Collision Utilities ==========

// Clamp a value between min and max
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Closest point on a triangle to a point
function closestPointOnTriangle(p, a, b, c) {
  // Compute triangle edges
  const ab = vec3Sub(b, a);
  const ac = vec3Sub(c, a);
  const ap = vec3Sub(p, a);

  const d1 = vec3Dot(ab, ap);
  const d2 = vec3Dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return vec3Copy(a);

  const bp = vec3Sub(p, b);
  const d3 = vec3Dot(ab, bp);
  const d4 = vec3Dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return vec3Copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return vec3Add(a, vec3Mul(ab, v));
  }

  const cp = vec3Sub(p, c);
  const d5 = vec3Dot(ab, cp);
  const d6 = vec3Dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return vec3Copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return vec3Add(a, vec3Mul(ac, w));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return vec3Add(b, vec3Mul(vec3Sub(c, b), w));
  }

  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return vec3Add(a, vec3Add(vec3Mul(ab, v), vec3Mul(ac, w)));
}

// Test sphere vs triangle, return penetration info
function sphereVsTriangle(center, radius, tri) {
  const closest = closestPointOnTriangle(center, tri.a, tri.b, tri.c);
  const delta = vec3Sub(center, closest);
  const distSq = vec3LenSq(delta);

  if (distSq >= radius * radius) {
    return null; // No collision
  }

  const dist = Math.sqrt(distSq);
  let normal;
  let depth;

  if (dist < 0.00001) {
    // Center is on triangle, use triangle normal
    normal = vec3Copy(tri.normal);
    depth = radius;
  } else {
    normal = vec3Mul(delta, 1.0 / dist);
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
  // size is [width, height, depth] in world units
  // Create 8 corners of a box centered at origin, then transform them
  const hw = size[0] * 0.5;
  const hh = size[1] * 0.5;
  const hd = size[2] * 0.5;

  const corners = [
    vec3(-hw, -hh, -hd), vec3(hw, -hh, -hd), vec3(hw, hh, -hd), vec3(-hw, hh, -hd),
    vec3(-hw, -hh, hd), vec3(hw, -hh, hd), vec3(hw, hh, hd), vec3(-hw, hh, hd)
  ];

  // Transform all corners
  const transformed = corners.map(c => transformPoint(c, pos, rot, scale));

  // Define 6 faces (12 triangles total)
  // Each face is 2 triangles
  const tris = [];

  // Face indices (quad → 2 tris)
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
    tris.push({ a: vec3Copy(a), b: vec3Copy(b), c: vec3Copy(c) });
    // Triangle 2: a, c, d
    tris.push({ a: vec3Copy(a), b: vec3Copy(c), c: vec3Copy(d) });
  }

  return tris;
}

// ========== Triangle Preprocessing ==========

function computeTriangleNormal(a, b, c) {
  const ab = vec3Sub(b, a);
  const ac = vec3Sub(c, a);
  return vec3Normalize(vec3Cross(ab, ac));
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
