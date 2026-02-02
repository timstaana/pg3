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

const processMeshCollider = async (mesh, world, collisionWorld, levelDir) => {
  const pos = vecFromArray(mesh.pos);
  const rot = vecFromArray(mesh.rot);
  const scale = scaleFromValue(mesh.scale);

  try {
    const objPath = `${levelDir}/${mesh.src}`;
    console.log(`Loading mesh collider: ${objPath}`);

    const objResponse = await fetch(objPath);
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
      const texturePath = `${levelDir}/${mesh.texture}`;
      console.log(`Loading mesh texture: ${texturePath}`);
      texture = await new Promise((resolve, reject) => {
        loadImage(texturePath, resolve, reject);
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

// ========== Sculpture Processing ==========

const calculateModelBounds = (vertices) => {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  vertices.forEach(v => {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  });

  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  const center = createVector(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  );

  return { width, height, depth, center, minX, maxX, minY, maxY, minZ, maxZ };
};

const processSculpture = async (sculpture, world, collisionWorld, levelDir) => {
  const pos = vecFromArray(sculpture.pos);
  const rot = vecFromArray(sculpture.rot || [0, 0, 0]);
  const scale = scaleFromValue(sculpture.scale || 1);

  try {
    // Load OBJ model
    const objPath = `${levelDir}/${sculpture.model}`;
    console.log(`Loading sculpture model: ${objPath}`);

    const objResponse = await fetch(objPath);
    const objText = await objResponse.text();
    const { vertices, uvs, faces } = parseOBJ(objText);

    // Load texture
    let texture = null;
    if (sculpture.texture) {
      const texturePath = `${levelDir}/${sculpture.texture}`;
      console.log(`Loading sculpture texture: ${texturePath}`);
      texture = await new Promise((resolve, reject) => {
        loadImage(texturePath, resolve, reject);
      });
    }

    // Calculate model bounds
    const bounds = calculateModelBounds(vertices);
    console.log(`Model bounds: ${bounds.width.toFixed(2)} x ${bounds.height.toFixed(2)} x ${bounds.depth.toFixed(2)}`);

    // Calculate scale to fit within size bounds
    const targetSize = sculpture.size || [2, 2, 2];
    const scaleX = targetSize[0] / bounds.width;
    const scaleY = targetSize[1] / bounds.height;
    const scaleZ = targetSize[2] / bounds.depth;
    const uniformScale = Math.min(scaleX, scaleY, scaleZ);

    const finalScale = createVector(
      scale.x * uniformScale,
      scale.y * uniformScale,
      scale.z * uniformScale
    );

    console.log(`Sculpture scale: ${uniformScale.toFixed(3)} to fit in [${targetSize}]`);

    // Create sculpture entity
    createEntity(world, {
      Transform: {
        pos,
        rot,
        scale: finalScale
      },
      Sculpture: {
        pos,
        rot,
        scale: finalScale,
        vertices,
        uvs,
        faces,
        texture,
        bounds,
        geometry: null  // Will be created on first render
      },
      ...(sculpture.interaction !== false && {
        Interaction: {
          range: INTERACTION_CONFIG?.range || 4.0,
          requireFacing: sculpture.requireFacing !== false,
          facingDot: sculpture.facingDot || INTERACTION_CONFIG?.facingDot || 0.3,
          inRange: false,
          isClosest: false
        },
        Lightbox: {
          padding: sculpture.lightboxPadding,
          distance: sculpture.lightboxDistance,
          yOffset: sculpture.yOffset || 0
        }
      })
    });

    // Add collision if specified
    if (sculpture.collision !== false) {
      const collisionSize = sculpture.collisionSize || targetSize;
      addBoxCollider(collisionWorld, pos, rot, finalScale, collisionSize);
      console.log(`Added collision box: [${collisionSize}]`);
    }

    console.log(`Successfully loaded sculpture: ${sculpture.model}`);
  } catch (err) {
    console.error(`Failed to load sculpture: ${sculpture.model}`, err);
  }
};

// ========== Painting Processing ==========

const fitSpriteTobounds = (width, height, aspect) => {
  let fittedWidth = width;
  let fittedHeight = height;

  if (aspect && width > 0 && height > 0) {
    const boundRatio = width / height;
    if (aspect >= boundRatio) {
      // Image is wider, fit to width
      fittedWidth = width;
      fittedHeight = width / aspect;
    } else {
      // Image is taller, fit to height
      fittedHeight = height;
      fittedWidth = height * aspect;
    }
  } else if (aspect && width > 0) {
    fittedWidth = width;
    fittedHeight = width / aspect;
  } else if (aspect && height > 0) {
    fittedHeight = height;
    fittedWidth = height * aspect;
  }

  return { width: fittedWidth, height: fittedHeight };
};

const processPainting = async (painting, world, levelDir) => {
  const pos = vecFromArray(painting.pos);
  const rot = vecFromArray(painting.rot || [0, 0, 0]);
  const scale = painting.scale || 1;

  try {
    const imagePath = `${levelDir}/${painting.src}`;
    console.log(`Loading painting from: ${imagePath}`);

    const img = await new Promise((resolve, reject) => {
      loadImage(
        imagePath,
        (loadedImg) => {
          console.log(`Image loaded: ${painting.src}, size: ${loadedImg.width}x${loadedImg.height}`);
          resolve(loadedImg);
        },
        (err) => {
          console.error(`Failed to load image: ${imagePath}`, err);
          reject(err || new Error(`Failed to load: ${imagePath}`));
        }
      );
    });

    // For GIFs and better compatibility, render to a graphics buffer
    let texture;
    const isGif = painting.src.toLowerCase().endsWith('.gif');

    if (isGif || img.gifProperties) {
      // Create a graphics buffer for GIFs
      const gfx = createGraphics(img.width, img.height);
      gfx.pixelDensity(1);
      gfx.image(img, 0, 0, img.width, img.height);
      texture = gfx;
      console.log(`Created graphics buffer for GIF: ${painting.src}`);
    } else {
      // Use the image directly for static images
      texture = img;
    }

    // Calculate aspect ratio and fit to bounds
    const aspect = img.width / img.height;
    const boundWidth = painting.width || 2;
    const boundHeight = painting.height || 2;
    const fitted = fitSpriteTobounds(boundWidth, boundHeight, aspect);

    console.log(`Aspect ratio: ${aspect.toFixed(2)}, fitted size: ${fitted.width.toFixed(2)}x${fitted.height.toFixed(2)}`);

    createEntity(world, {
      Transform: {
        pos,
        rot,
        scale: defaultScale()
      },
      Painting: {
        pos,
        rot,
        scale,
        texture,
        sourceImage: img,  // Keep reference to source for animation
        width: fitted.width,
        height: fitted.height
      },
      Interaction: {
        range: INTERACTION_CONFIG?.range || 4.0,
        requireFacing: INTERACTION_CONFIG?.requireFacing !== false,
        facingDot: INTERACTION_CONFIG?.facingDot || 0.3,
        inRange: false,
        isClosest: false
      },
      Lightbox: {
        padding: painting.lightboxPadding,
        distance: painting.lightboxDistance,
        yOffset: painting.yOffset || 0
      }
    });

    console.log(`Successfully loaded painting: ${painting.src}`);
  } catch (err) {
    console.error(`Failed to load painting: ${painting.src}`, err);
    console.error('Error details:', err.message, err.stack);
  }
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

  // Extract directory path from level path for relative asset loading
  const levelDir = levelPath.substring(0, levelPath.lastIndexOf('/'));

  if (levelData.collision.boxes) {
    levelData.collision.boxes.forEach(box =>
      processBoxCollider(box, world, collisionWorld)
    );
  }

  if (levelData.collision.meshes) {
    await Promise.all(
      levelData.collision.meshes.map(mesh =>
        processMeshCollider(mesh, world, collisionWorld, levelDir)
      )
    );
  }

  console.log(`Collision world: ${collisionWorld.tris.length} triangles`);

  if (levelData.visuals && levelData.visuals.labels) {
    levelData.visuals.labels.forEach(label =>
      processLabel(label, world)
    );
  }

  if (levelData.visuals && levelData.visuals.paintings) {
    await Promise.all(
      levelData.visuals.paintings.map(painting =>
        processPainting(painting, world, levelDir)
      )
    );
  }

  if (levelData.visuals && levelData.visuals.sculptures) {
    await Promise.all(
      levelData.visuals.sculptures.map(sculpture =>
        processSculpture(sculpture, world, collisionWorld, levelDir)
      )
    );
  }

  // Get player spawn from player config (with backward compatibility)
  const playerConfig = levelData.player || {};
  const spawns = playerConfig.spawns || levelData.playerSpawns || [{ pos: [0, 3, 0], yaw: 0 }];
  const player = createPlayer(spawns[0], world);

  return { levelData, player };
};
