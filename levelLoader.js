// levelLoader.js - Data-driven level loading
// Builds ECS world and collision world from JSON

// ========== Utilities ==========

const vecFromArray = (arr) => createVector(...arr);
const defaultScale = () => createVector(1, 1, 1);

// ========== Collider Processing ==========

const processBoxCollider = (box, world, collisionWorld) => {
  const pos = vecFromArray(box.pos);
  const rot = vecFromArray(box.rot);
  const scale = box.scale ? vecFromArray(box.scale) : defaultScale();

  addBoxCollider(collisionWorld, pos, rot, scale, box.size);

  createEntity(world, {
    Collider: {
      id: box.id,
      type: 'box',
      pos, rot, scale,
      size: box.size
    }
  });
};

const processMeshCollider = async (mesh, world, collisionWorld) => {
  const pos = vecFromArray(mesh.pos);
  const rot = vecFromArray(mesh.rot);
  const scale = mesh.scale ? vecFromArray(mesh.scale) : defaultScale();

  try {
    const objResponse = await fetch(mesh.src);
    const objText = await objResponse.text();
    const { vertices, faces } = parseOBJ(objText);

    addMeshCollider(collisionWorld, vertices, faces, pos, rot, scale);

    createEntity(world, {
      Collider: {
        id: mesh.id,
        type: 'mesh',
        pos, rot, scale,
        vertices, faces
      }
    });

    console.log(`Loaded mesh: ${mesh.id} (${faces.length} faces)`);
  } catch (err) {
    console.warn(`Failed to load mesh: ${mesh.src}`, err);
  }
};

// ========== Player Creation ==========

const createPlayer = (spawn, world) =>
  createEntity(world, {
    Player: {
      radius: 0.4,
      grounded: false,
      groundNormal: createVector(0, 1, 0),
      jumpSpeed: 5.0,
      moveSpeed: 4.0
    },
    Transform: {
      pos: vecFromArray(spawn.pos),
      rot: createVector(0, spawn.yaw, 0),
      scale: defaultScale()
    },
    Velocity: {
      vel: createVector(0, 0, 0)
    },
    Input: {
      move: createVector(0, 0, 0),
      jump: false
    }
  });

// ========== Main Loader ==========

const loadLevel = async (levelPath, world, collisionWorld) => {
  const response = await fetch(levelPath);
  const levelData = await response.json();

  console.log('Loading level:', levelData.meta.name);

  if (levelData.collision.boxes) {
    levelData.collision.boxes.forEach(box =>
      processBoxCollider(box, world, collisionWorld)
    );
  }

  if (levelData.collision.meshes) {
    await Promise.all(
      levelData.collision.meshes.map(mesh =>
        processMeshCollider(mesh, world, collisionWorld)
      )
    );
  }

  console.log(`Collision world: ${collisionWorld.tris.length} triangles`);

  const player = createPlayer(levelData.playerSpawns[0], world);

  return { levelData, player };
};
