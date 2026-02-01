// levelLoader.js - Data-driven level loading
// Builds ECS world and collision world from JSON

// ========== Utilities ==========

const vecFromArray = (arr) => createVector(...arr);
const defaultScale = () => createVector(1, 1, 1);
const scaleFromValue = (val) => {
  if (typeof val === 'number') {
    return createVector(val, val, val);
  }
  return val ? vecFromArray(val) : defaultScale();
};

// ========== Collider Processing ==========

const processBoxCollider = (box, world, collisionWorld) => {
  const pos = vecFromArray(box.pos);
  const rot = vecFromArray(box.rot);
  const scale = scaleFromValue(box.scale);

  addBoxCollider(collisionWorld, pos, rot, scale, box.size);

  // Compute AABB for frustum culling
  const aabb = computeBoxAABB(pos, rot, scale, box.size);

  createEntity(world, {
    Collider: {
      id: box.id,
      type: 'box',
      pos, rot, scale,
      size: box.size,
      aabb
    }
  });

  // Process entity labels
  if (box.label && Array.isArray(box.label)) {
    box.label.forEach(labelDef => {
      // Calculate centered position above the box with default +2 offset
      const labelPos = createVector(pos.x, pos.y + box.size[1] / 2 + 2, pos.z);

      // Apply additional offset if specified
      if (labelDef.pos) {
        const offset = vecFromArray(labelDef.pos);
        labelPos.add(offset);
      }

      processLabel({ ...labelDef, pos: [labelPos.x, labelPos.y, labelPos.z] }, world);
    });
  }
};

const processMeshCollider = async (mesh, world, collisionWorld) => {
  const pos = vecFromArray(mesh.pos);
  const rot = vecFromArray(mesh.rot);
  const scale = scaleFromValue(mesh.scale);

  try {
    const objResponse = await fetch(mesh.src);
    const objText = await objResponse.text();
    const { vertices, uvs, faces } = parseOBJ(objText);

    const vertexIndices = faces.map(face => face.map(f => f.vertex));
    addMeshCollider(collisionWorld, vertices, vertexIndices, pos, rot, scale);

    // Compute AABB for frustum culling - transform all vertices and find bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    vertices.forEach(v => {
      const transformed = transformPoint(v, pos, rot, scale);
      if (transformed.x < minX) minX = transformed.x;
      if (transformed.x > maxX) maxX = transformed.x;
      if (transformed.y < minY) minY = transformed.y;
      if (transformed.y > maxY) maxY = transformed.y;
      if (transformed.z < minZ) minZ = transformed.z;
      if (transformed.z > maxZ) maxZ = transformed.z;
    });

    const aabb = { minX, maxX, minY, maxY, minZ, maxZ };

    let texture = null;
    if (mesh.texture) {
      texture = await new Promise((resolve, reject) => {
        loadImage(mesh.texture, resolve, reject);
      });
    }

    createEntity(world, {
      Collider: {
        id: mesh.id,
        type: 'mesh',
        pos, rot, scale,
        vertices, uvs, faces, texture,
        aabb
      }
    });

    // Process entity labels
    if (mesh.label && Array.isArray(mesh.label)) {
      mesh.label.forEach(labelDef => {
        // Use mesh position as base with default +1 offset
        const labelPos = createVector(pos.x, pos.y + 1, pos.z);

        // Apply additional offset if specified
        if (labelDef.pos) {
          const offset = vecFromArray(labelDef.pos);
          labelPos.add(offset);
        }

        processLabel({ ...labelDef, pos: [labelPos.x, labelPos.y, labelPos.z] }, world);
      });
    }

    console.log(`Loaded mesh: ${mesh.id} (${faces.length} faces)`);
  } catch (err) {
    console.warn(`Failed to load mesh: ${mesh.src}`, err);
  }
};

// ========== Label Processing ==========

const processLabel = (label, world) => {
  const pos = vecFromArray(label.pos);

  createEntity(world, {
    Label: {
      text: label.text,
      pos,
      width: label.width || null,
      height: label.height || null,
      fontSize: label.fontSize || 14,
      color: label.color || [255, 255, 255, 255],
      bgColor: label.bgColor !== undefined ? label.bgColor : [0, 0, 0, 80],
      billboard: label.billboard !== undefined ? label.billboard : true
    }
  });
};

// ========== Player Creation ==========

const createPlayer = (spawn, world) => {
  // Calculate jump speed from jump height: v = sqrt(2 * g * h)
  const jumpSpeed = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

  return createEntity(world, {
    Player: {
      radius: 0.4,
      grounded: false,
      groundNormal: createVector(0, 1, 0),
      jumpSpeed,
      moveSpeed: PLAYER_MOVE_SPEED,
      turnSpeed: PLAYER_TURN_SPEED,
      spawnPos: vecFromArray(spawn.pos), // Store spawn position for respawning
      spawnYaw: spawn.yaw
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
      forward: 0,
      turn: 0,
      jump: false
    },
    Animation: {
      currentFrame: 0,
      frameTime: 0,
      framesPerSecond: 6,
      totalFrames: 3,
      idleFrame: 0,
      walkFrames: [1, 2]
    }
  });
};

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

  if (levelData.visuals && levelData.visuals.labels) {
    levelData.visuals.labels.forEach(label =>
      processLabel(label, world)
    );
  }

  const player = createPlayer(levelData.playerSpawns[0], world);

  return { levelData, player };
};
