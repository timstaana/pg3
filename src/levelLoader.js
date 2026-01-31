// levelLoader.js - Load level data and build ECS world + collision world

// ========== Level Loader ==========

async function loadLevel(levelPath, world, collisionWorld) {
  const response = await fetch(levelPath);
  const levelData = await response.json();

  console.log('Loading level:', levelData.meta.name);

  // ========== Process Collision Boxes ==========
  if (levelData.collision.boxes) {
    for (let box of levelData.collision.boxes) {
      const pos = createVector(box.pos[0], box.pos[1], box.pos[2]);
      const rot = createVector(box.rot[0], box.rot[1], box.rot[2]);
      const scale = box.scale ? createVector(box.scale[0], box.scale[1], box.scale[2]) : createVector(1, 1, 1);
      const size = box.size;

      // Add to collision world as triangles
      addBoxCollider(collisionWorld, pos, rot, scale, size);

      // Create entity for rendering
      createEntity(world, {
        Collider: {
          id: box.id,
          type: 'box',
          pos,
          rot,
          scale,
          size
        }
      });
    }
  }

  // ========== Process Collision Meshes ==========
  if (levelData.collision.meshes) {
    for (let mesh of levelData.collision.meshes) {
      const pos = createVector(mesh.pos[0], mesh.pos[1], mesh.pos[2]);
      const rot = createVector(mesh.rot[0], mesh.rot[1], mesh.rot[2]);
      const scale = mesh.scale ? createVector(mesh.scale[0], mesh.scale[1], mesh.scale[2]) : createVector(1, 1, 1);

      try {
        const objResponse = await fetch(mesh.src);
        const objText = await objResponse.text();
        const { vertices, faces } = parseOBJ(objText);

        // Add to collision world as triangles
        addMeshCollider(collisionWorld, vertices, faces, pos, rot, scale);

        // Create entity for rendering
        createEntity(world, {
          Collider: {
            id: mesh.id,
            type: 'mesh',
            pos,
            rot,
            scale,
            vertices,
            faces
          }
        });

        console.log(`Loaded mesh: ${mesh.id} (${faces.length} faces)`);
      } catch (err) {
        console.warn(`Failed to load mesh: ${mesh.src}`, err);
      }
    }
  }

  console.log(`Collision world built: ${collisionWorld.tris.length} triangles`);

  // ========== Create Player ==========
  const spawn = levelData.playerSpawns[0];
  const player = createEntity(world, {
    Player: {
      radius: 0.4,
      grounded: false,
      groundNormal: createVector(0, 1, 0),
      jumpSpeed: 5.0,
      moveSpeed: 4.0
    },
    Transform: {
      pos: createVector(spawn.pos[0], spawn.pos[1], spawn.pos[2]),
      rot: createVector(0, spawn.yaw, 0),
      scale: createVector(1, 1, 1)
    },
    Velocity: {
      vel: createVector(0, 0, 0)
    },
    Input: {
      move: createVector(0, 0, 0),
      jump: false
    }
  });

  return { levelData, player };
}
