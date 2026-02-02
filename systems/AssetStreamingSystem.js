// AssetStreamingSystem.js - Progressive asset loading and memory management
// Streams in painting and sculpture assets based on camera proximity and visibility

// ========== Priority Calculation ==========

const calculateLoadPriority = (distance, isInView) => {
  // Higher priority = loads sooner
  const basePriority = 1000 - distance;
  const viewBonus = isInView ? 500 : 0;
  return basePriority + viewBonus;
};

// ========== Load Queue Management ==========

const queueAssetLoad = (entity, assetType, priority) => {
  const asset = { entity, assetType, priority };

  // Check if already queued
  const existingIndex = ASSET_REGISTRY.loadQueue.findIndex(
    a => a.entity === entity && a.assetType === assetType
  );

  if (existingIndex === -1) {
    ASSET_REGISTRY.loadQueue.push(asset);
    // Sort queue by priority (highest first)
    ASSET_REGISTRY.loadQueue.sort((a, b) => b.priority - a.priority);
  }
};

// ========== Asset Loading Functions ==========

const loadPaintingAsset = async (entity) => {
  const painting = entity.Painting;
  const levelDir = ASSET_REGISTRY.levelDir;
  const imagePath = `${levelDir}/${painting.assetSrc}`;

  // Check if already loading
  if (ASSET_REGISTRY.activeLoads.has(imagePath)) {
    return;
  }

  painting.assetState = 'LOADING';
  ASSET_REGISTRY.activeLoads.add(imagePath);

  try {
    const img = await new Promise((resolve, reject) => {
      loadImage(
        imagePath,
        (loadedImg) => {
          console.log(`Streamed painting: ${painting.assetSrc}, size: ${loadedImg.width}x${loadedImg.height}`);
          resolve(loadedImg);
        },
        (err) => {
          console.error(`Failed to stream painting: ${imagePath}`, err);
          reject(err || new Error(`Failed to load: ${imagePath}`));
        }
      );
    });

    // Calculate aspect ratio and update dimensions
    const aspect = img.width / img.height;
    const boundWidth = painting.width;
    const boundHeight = painting.height;

    let fittedWidth = boundWidth;
    let fittedHeight = boundHeight;

    if (aspect && boundWidth > 0 && boundHeight > 0) {
      const boundRatio = boundWidth / boundHeight;
      if (aspect >= boundRatio) {
        fittedWidth = boundWidth;
        fittedHeight = boundWidth / aspect;
      } else {
        fittedHeight = boundHeight;
        fittedWidth = boundHeight * aspect;
      }
    }

    // Create texture for WebGL compatibility
    let texture;
    const isGif = painting.assetSrc.toLowerCase().endsWith('.gif');

    if (isGif || img.gifProperties) {
      // GIFs need a graphics buffer for WebGL
      const gfx = createGraphics(img.width, img.height);
      gfx.pixelDensity(1); // Lower quality = faster
      gfx.image(img, 0, 0, img.width, img.height);
      texture = gfx;
    } else {
      // Static images can use the image directly
      texture = img;
    }

    // Update painting component
    painting.texture = texture;
    painting.sourceImage = img;
    painting.width = fittedWidth;
    painting.height = fittedHeight;
    painting.assetState = 'LOADED';

    console.log(`✓ Painting loaded: ${painting.assetSrc}`);
  } catch (err) {
    console.error(`✗ Failed to stream painting: ${painting.assetSrc}`, err);
    painting.assetState = 'ERROR';
  } finally {
    ASSET_REGISTRY.activeLoads.delete(imagePath);
  }
};

const loadSculptureAssets = async (entity) => {
  const sculpture = entity.Sculpture;
  const levelDir = ASSET_REGISTRY.levelDir;
  const modelPath = `${levelDir}/${sculpture.modelSrc}`;

  // Check if already loading
  if (ASSET_REGISTRY.activeLoads.has(modelPath)) {
    return;
  }

  sculpture.modelAssetState = 'LOADING';
  ASSET_REGISTRY.activeLoads.add(modelPath);

  try {
    // Load OBJ model
    console.log(`Streaming sculpture model: ${modelPath}`);
    const objResponse = await fetch(modelPath);
    const objText = await objResponse.text();
    const { vertices, uvs, faces } = parseOBJ(objText);

    // Load texture if specified
    let texture = null;
    if (sculpture.textureSrc) {
      sculpture.textureAssetState = 'LOADING';
      const texturePath = `${levelDir}/${sculpture.textureSrc}`;
      console.log(`Streaming sculpture texture: ${texturePath}`);
      texture = await new Promise((resolve, reject) => {
        loadImage(texturePath, resolve, reject);
      });
      sculpture.textureAssetState = 'LOADED';
    }

    // Calculate model bounds
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

    const bounds = {
      width, height, depth,
      center: createVector((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
      minX, maxX, minY, maxY, minZ, maxZ
    };

    // Calculate scale to fit within target size
    const targetSize = sculpture.targetSize || [2, 2, 2];
    const scaleX = targetSize[0] / width;
    const scaleY = targetSize[1] / height;
    const scaleZ = targetSize[2] / depth;
    const uniformScale = Math.min(scaleX, scaleY, scaleZ);

    const finalScale = createVector(
      sculpture.scale.x * uniformScale,
      sculpture.scale.y * uniformScale,
      sculpture.scale.z * uniformScale
    );

    // Update sculpture component
    sculpture.vertices = vertices;
    sculpture.uvs = uvs;
    sculpture.faces = faces;
    sculpture.texture = texture;
    sculpture.bounds = bounds;
    sculpture.scale = finalScale;
    sculpture.modelAssetState = 'LOADED';
    sculpture.geometry = null; // Will be created on first render

    // Update Transform component scale
    if (entity.Transform) {
      entity.Transform.scale = finalScale;
    }

    console.log(`✓ Sculpture loaded: ${sculpture.modelSrc} (${faces.length} faces, scale: ${uniformScale.toFixed(3)})`);
  } catch (err) {
    console.error(`✗ Failed to stream sculpture: ${sculpture.modelSrc}`, err);
    sculpture.modelAssetState = 'ERROR';
    if (sculpture.textureSrc) {
      sculpture.textureAssetState = 'ERROR';
    }
  } finally {
    ASSET_REGISTRY.activeLoads.delete(modelPath);
  }
};

// ========== Priority Update ==========

const updateLoadPriorities = (world) => {
  // cameraRig is a global defined in CameraSystem.js
  if (!cameraRig || !cameraRig.camPosWorld) {
    return; // Camera not initialized yet
  }

  const cameraPos = cameraRig.camPosWorld;
  const cameraLookAt = cameraRig.lookAtWorld;

  // Check paintings
  queryEntities(world, 'Painting').forEach(entity => {
    const painting = entity.Painting;

    // Only queue if not loaded and not already loading/queued
    if (painting.assetState === 'NOT_LOADED' || painting.assetState === 'UNLOADED') {
      const distance = p5.Vector.dist(painting.pos, cameraPos);
      const isVisible = isPointVisible(painting.pos, cameraPos, cameraLookAt, STREAMING_CONFIG.preloadDistance);

      if (isVisible && distance < STREAMING_CONFIG.preloadDistance) {
        painting.loadPriority = calculateLoadPriority(distance, distance < STREAMING_CONFIG.maxRenderDistance);
        queueAssetLoad(entity, 'painting', painting.loadPriority);
      }
    }
  });

  // Check sculptures
  queryEntities(world, 'Sculpture').forEach(entity => {
    const sculpture = entity.Sculpture;

    // Only queue if not loaded and not already loading/queued
    if (sculpture.modelAssetState === 'NOT_LOADED' || sculpture.modelAssetState === 'UNLOADED') {
      const distance = p5.Vector.dist(sculpture.pos, cameraPos);
      const isVisible = isPointVisible(sculpture.pos, cameraPos, cameraLookAt, STREAMING_CONFIG.preloadDistance);

      if (isVisible && distance < STREAMING_CONFIG.preloadDistance) {
        sculpture.loadPriority = calculateLoadPriority(distance, distance < STREAMING_CONFIG.maxRenderDistance);
        queueAssetLoad(entity, 'sculpture', sculpture.loadPriority);
      }
    }
  });
};

// ========== Queue Processing ==========

const processLoadQueue = () => {
  // Only start new loads if cooldown has elapsed (prevents stuttering)
  const framesSinceLastLoad = ASSET_REGISTRY.frameCounter - ASSET_REGISTRY.lastLoadFrame;
  if (framesSinceLastLoad < ASSET_REGISTRY.loadCooldown) {
    return; // Still in cooldown period
  }

  // Respect max concurrent loads
  if (ASSET_REGISTRY.loadQueue.length > 0 &&
      ASSET_REGISTRY.activeLoads.size < ASSET_REGISTRY.maxConcurrentLoads) {

    const { entity, assetType } = ASSET_REGISTRY.loadQueue.shift();

    // Double-check state before loading (might have been loaded by another system)
    if (assetType === 'painting') {
      const painting = entity.Painting;
      if (painting.assetState === 'NOT_LOADED' || painting.assetState === 'UNLOADED') {
        ASSET_REGISTRY.lastLoadFrame = ASSET_REGISTRY.frameCounter; // Update cooldown
        loadPaintingAsset(entity);
      }
    } else if (assetType === 'sculpture') {
      const sculpture = entity.Sculpture;
      if (sculpture.modelAssetState === 'NOT_LOADED' || sculpture.modelAssetState === 'UNLOADED') {
        ASSET_REGISTRY.lastLoadFrame = ASSET_REGISTRY.frameCounter; // Update cooldown
        loadSculptureAssets(entity);
      }
    }
  }
};

// ========== Asset Unloading ==========

const unloadDistantAssets = (world) => {
  // cameraRig is a global defined in CameraSystem.js
  if (!cameraRig || !cameraRig.camPosWorld) {
    return;
  }

  const cameraPos = cameraRig.camPosWorld;
  const currentFrame = ASSET_REGISTRY.frameCounter;
  const frameThreshold = STREAMING_CONFIG.unloadFrameThreshold;

  // Unload paintings that haven't been seen in a while
  queryEntities(world, 'Painting').forEach(entity => {
    const painting = entity.Painting;

    if (painting.assetState === 'LOADED') {
      const distance = p5.Vector.dist(painting.pos, cameraPos);
      const framesSinceLastSeen = currentFrame - painting.lastSeenFrame;

      if (distance > STREAMING_CONFIG.unloadDistance && framesSinceLastSeen > frameThreshold) {
        // Unload texture
        painting.texture = null;
        painting.sourceImage = null;
        painting.assetState = 'UNLOADED';
        console.log(`Unloaded painting: ${painting.assetSrc} (distance: ${distance.toFixed(1)}, unseen: ${framesSinceLastSeen} frames)`);
      }
    }
  });

  // Unload sculptures that haven't been seen in a while
  queryEntities(world, 'Sculpture').forEach(entity => {
    const sculpture = entity.Sculpture;

    if (sculpture.modelAssetState === 'LOADED') {
      const distance = p5.Vector.dist(sculpture.pos, cameraPos);
      const framesSinceLastSeen = currentFrame - sculpture.lastSeenFrame;

      if (distance > STREAMING_CONFIG.unloadDistance && framesSinceLastSeen > frameThreshold) {
        // Unload model and texture
        sculpture.vertices = null;
        sculpture.uvs = null;
        sculpture.faces = null;
        sculpture.texture = null;
        sculpture.geometry = null;
        sculpture.modelAssetState = 'UNLOADED';
        sculpture.textureAssetState = sculpture.textureSrc ? 'UNLOADED' : 'LOADED';
        console.log(`Unloaded sculpture: ${sculpture.modelSrc} (distance: ${distance.toFixed(1)}, unseen: ${framesSinceLastSeen} frames)`);
      }
    }
  });
};

// ========== Main System ==========

const AssetStreamingSystem = (world, dt) => {
  // Increment frame counter for LRU tracking
  ASSET_REGISTRY.frameCounter++;

  // Update priorities periodically
  if (ASSET_REGISTRY.frameCounter % STREAMING_CONFIG.priorityUpdateInterval === 0) {
    updateLoadPriorities(world);
  }

  // Process load queue
  processLoadQueue();

  // Unload distant assets periodically (less frequently)
  if (ASSET_REGISTRY.frameCounter % (STREAMING_CONFIG.priorityUpdateInterval * 2) === 0) {
    unloadDistantAssets(world);
  }
};
