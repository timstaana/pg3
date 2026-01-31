// collisionWorld.js - Unified triangle collision world builder

// ========== Collision World ==========

function createCollisionWorld() {
  return {
    tris: [] // All world-space triangles with precomputed data
  };
}

// Add triangles from a box collider
function addBoxCollider(collisionWorld, pos, rot, scale, size) {
  const tris = boxToTriangles(pos, rot, scale, size);

  for (let tri of tris) {
    preprocessTriangle(tri);
    collisionWorld.tris.push(tri);
  }
}

// Add triangles from a mesh (OBJ)
function addMeshCollider(collisionWorld, vertices, faces, pos, rot, scale) {
  for (let face of faces) {
    // Face is array of vertex indices (already triangulated)
    const a = transformPoint(vertices[face[0]], pos, rot, scale);
    const b = transformPoint(vertices[face[1]], pos, rot, scale);
    const c = transformPoint(vertices[face[2]], pos, rot, scale);

    const tri = { a, b, c };
    preprocessTriangle(tri);
    collisionWorld.tris.push(tri);
  }
}

// ========== Broadphase Culling ==========

// Mario-style micro-broadphase: simple AABB culling
function queryTrianglesNearPlayer(collisionWorld, playerPos, playerRadius, config) {
  const queryMargin = config.queryMargin || 0.5;
  const downMargin = config.downMargin || 2.0;
  const upMargin = config.upMargin || 2.0;

  const minX = playerPos.x - playerRadius - queryMargin;
  const maxX = playerPos.x + playerRadius + queryMargin;
  const minZ = playerPos.z - playerRadius - queryMargin;
  const maxZ = playerPos.z + playerRadius + queryMargin;
  const minY = playerPos.y - downMargin;
  const maxY = playerPos.y + upMargin;

  const candidates = [];

  for (let tri of collisionWorld.tris) {
    const aabb = tri.aabb;

    // AABB overlap test
    if (aabb.maxX < minX || aabb.minX > maxX) continue;
    if (aabb.maxZ < minZ || aabb.minZ > maxZ) continue;
    if (aabb.maxY < minY || aabb.minY > maxY) continue;

    candidates.push(tri);
  }

  return candidates;
}

// ========== Minimal OBJ Parser ==========

function parseOBJ(objText) {
  const lines = objText.split('\n');
  const vertices = [];
  const faces = [];

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('#') || line.length === 0) continue;

    const parts = line.split(/\s+/);

    if (parts[0] === 'v') {
      // Vertex: v x y z
      vertices.push(vec3(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      ));
    } else if (parts[0] === 'f') {
      // Face: f v1 v2 v3 [v4]
      const indices = [];
      for (let i = 1; i < parts.length; i++) {
        // Handle f vertex/texcoord/normal format - just take vertex index
        const vIndex = parseInt(parts[i].split('/')[0]) - 1; // OBJ is 1-indexed
        indices.push(vIndex);
      }

      // Triangulate if quad
      if (indices.length === 3) {
        faces.push([indices[0], indices[1], indices[2]]);
      } else if (indices.length === 4) {
        // Split quad into 2 triangles
        faces.push([indices[0], indices[1], indices[2]]);
        faces.push([indices[0], indices[2], indices[3]]);
      }
    }
  }

  return { vertices, faces };
}
