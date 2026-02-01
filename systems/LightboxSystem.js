// LightboxSystem.js - Camera focus system for viewing paintings
// Moves camera to view paintings face-on within screen bounds

// Global state for lightbox mode
let lightboxState = {
  active: false,
  targetEntity: null,
  blend: 0, // 0 = normal camera, 1 = lightbox view
  targetPos: null,
  targetLookAt: null,
  cooldown: 0, // Time before inputs can exit lightbox
  cooldownDuration: 0.5 // Cooldown duration in seconds
};

const getLightboxState = () => lightboxState;

const activateLightbox = (entity) => {
  if (!entity) return;
  lightboxState.active = true;
  lightboxState.targetEntity = entity;
  lightboxState.cooldown = lightboxState.cooldownDuration; // Reset cooldown
};

const deactivateLightbox = () => {
  lightboxState.active = false;
  lightboxState.targetEntity = null;
};

const LightboxSystem = (world, dt) => {
  const player = queryEntities(world, 'Player', 'Transform')[0];
  if (!player) return;

  const playerPos = player.Transform.pos;

  // Update cooldown timer
  if (lightboxState.cooldown > 0) {
    lightboxState.cooldown = Math.max(0, lightboxState.cooldown - dt);
  }

  // Smoothly blend in/out of lightbox mode
  const blendSpeed = 5.0;
  if (lightboxState.active && lightboxState.targetEntity) {
    lightboxState.blend = Math.min(1, lightboxState.blend + blendSpeed * dt);
  } else {
    lightboxState.blend = Math.max(0, lightboxState.blend - blendSpeed * dt);
  }

  // Calculate lightbox camera position if active
  if (lightboxState.blend > 0 && lightboxState.targetEntity) {
    const painting = lightboxState.targetEntity.Painting;
    const transform = lightboxState.targetEntity.Transform;
    const lightbox = lightboxState.targetEntity.Lightbox || {};

    if (painting && transform) {
      // Get painting properties
      const paintingPos = transform.pos;
      const paintingYaw = transform.rot.y;

      // Calculate painting's forward direction (normal pointing out from painting)
      const yawRad = paintingYaw * Math.PI / 180;
      const paintingForward = createVector(
        Math.sin(yawRad),
        0,
        Math.cos(yawRad)
      );

      // Calculate distance to fit painting within screen bounds
      const paintingWidth = painting.width * painting.scale;
      const paintingHeight = painting.height * painting.scale;

      // Get canvas dimensions (use windowWidth/Height as fallback)
      const canvasWidth = typeof width !== 'undefined' ? width : windowWidth;
      const canvasHeight = typeof height !== 'undefined' ? height : windowHeight;

      // Get camera FOV (p5.js default is 60 degrees vertical FOV)
      const fovY = 60 * Math.PI / 180; // Convert to radians
      const screenAspect = canvasWidth / canvasHeight;

      // Calculate horizontal FOV from vertical FOV and screen aspect
      const fovX = 2 * Math.atan(Math.tan(fovY / 2) * screenAspect);

      // Calculate distance needed to fit painting vertically and horizontally
      const distV = (paintingHeight * 0.5) / Math.tan(fovY / 2);
      const distH = (paintingWidth * 0.5) / Math.tan(fovX / 2);

      // Take the larger distance to ensure painting fits in both dimensions
      const baseDistance = Math.max(distV, distH);

      // Apply padding multiplier for margin
      const padding = lightbox.padding || 2;
      const distance = baseDistance * padding;

      // Position camera in front of painting (add offset to be on the side the painting faces)
      const cameraOffset = p5.Vector.mult(paintingForward, distance);
      lightboxState.targetPos = p5.Vector.add(paintingPos, cameraOffset);

      // Add Y offset
      const yOffset = lightbox.yOffset || 0;
      lightboxState.targetPos.y += yOffset;

      // Look at the painting center
      lightboxState.targetLookAt = paintingPos.copy();
    }
  }

  // If blend is 0, clear target positions
  if (lightboxState.blend === 0) {
    lightboxState.targetPos = null;
    lightboxState.targetLookAt = null;
  }
};
