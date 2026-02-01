// LightboxSystem.js - Camera focus system for viewing paintings
// Moves camera to view paintings face-on within screen bounds

// Global state for lightbox mode
let lightboxState = {
  active: false,
  targetEntity: null,
  blend: 0, // 0 = normal camera, 1 = lightbox view
  targetPos: null,
  targetLookAt: null,
  cooldown: 0 // Time before inputs can exit lightbox
};

const getLightboxState = () => lightboxState;

const activateLightbox = (entity) => {
  if (!entity) return;
  lightboxState.active = true;
  lightboxState.targetEntity = entity;
  const cooldownDuration = LIGHTBOX_CONFIG?.cooldownDuration || 0.5;
  lightboxState.cooldown = cooldownDuration; // Reset cooldown
};

const deactivateLightbox = () => {
  lightboxState.active = false;
  lightboxState.targetEntity = null;
};

// Calculate camera distance to fit content within screen bounds
const calculateLightboxDistance = (contentWidth, contentHeight, padding) => {
  // Get canvas dimensions
  const canvasWidth = typeof width !== 'undefined' ? width : windowWidth;
  const canvasHeight = typeof height !== 'undefined' ? height : windowHeight;

  // Camera FOV (p5.js default is 60 degrees vertical)
  const fovY = 60 * Math.PI / 180;
  const screenAspect = canvasWidth / canvasHeight;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * screenAspect);

  // Calculate distance needed to fit content in both dimensions
  const distV = (contentHeight * 0.5) / Math.tan(fovY / 2);
  const distH = (contentWidth * 0.5) / Math.tan(fovX / 2);

  // Use larger distance to ensure content fits, then apply padding
  return Math.max(distV, distH) * padding;
};

const LightboxSystem = (world, dt) => {
  const player = queryEntities(world, 'Player', 'Transform')[0];
  if (!player) return;

  // Update cooldown timer
  if (lightboxState.cooldown > 0) {
    lightboxState.cooldown = Math.max(0, lightboxState.cooldown - dt);
  }

  // Smoothly blend in/out of lightbox mode
  const blendSpeed = LIGHTBOX_CONFIG?.blendSpeed || 5.0;
  if (lightboxState.active && lightboxState.targetEntity) {
    lightboxState.blend = Math.min(1, lightboxState.blend + blendSpeed * dt);
  } else {
    lightboxState.blend = Math.max(0, lightboxState.blend - blendSpeed * dt);
  }

  // Calculate lightbox camera position if active
  if (lightboxState.blend > 0 && lightboxState.targetEntity) {
    const painting = lightboxState.targetEntity.Painting;
    const sculpture = lightboxState.targetEntity.Sculpture;
    const transform = lightboxState.targetEntity.Transform;
    const lightbox = lightboxState.targetEntity.Lightbox || {};

    let targetPos = transform.pos;
    let targetRot = transform.rot;
    let contentWidth, contentHeight;
    let lookAtOffset = 0;

    // Get content dimensions
    if (painting) {
      contentWidth = painting.width * painting.scale;
      contentHeight = painting.height * painting.scale;
      lookAtOffset = lightbox.yOffset || 0;
    } else if (sculpture) {
      const scaledWidth = sculpture.bounds.width * sculpture.scale.x;
      const scaledHeight = sculpture.bounds.height * sculpture.scale.y;
      const scaledDepth = sculpture.bounds.depth * sculpture.scale.z;

      // Use max of width/depth for horizontal, height for vertical
      contentWidth = Math.max(scaledWidth, scaledDepth);
      contentHeight = scaledHeight;
      lookAtOffset = lightbox.yOffset !== undefined ? lightbox.yOffset : scaledHeight * 0.25;
    }

    if (contentWidth && contentHeight) {
      // Determine distance: use fixed distance if specified, otherwise calculate with padding
      let distance;

      if (lightbox.distance !== undefined) {
        // Use per-entity fixed distance
        distance = lightbox.distance;
      } else if (LIGHTBOX_CONFIG?.distance && lightbox.padding === undefined) {
        // Use global fixed distance if no padding override
        distance = LIGHTBOX_CONFIG.distance;
      } else {
        // Calculate distance with padding (default behavior)
        const defaultPadding = LIGHTBOX_CONFIG?.padding || 1.5;
        const padding = lightbox.padding !== undefined ? lightbox.padding : defaultPadding;
        distance = calculateLightboxDistance(contentWidth, contentHeight, padding);
      }

      // Calculate forward direction from rotation
      const yawRad = targetRot.y * Math.PI / 180;
      const forward = createVector(Math.sin(yawRad), 0, Math.cos(yawRad));

      // Position camera in front of content
      const cameraOffset = p5.Vector.mult(forward, distance);
      lightboxState.targetPos = p5.Vector.add(targetPos, cameraOffset);

      // For sculptures, place camera at center height; for paintings, use lookAtOffset
      if (sculpture) {
        lightboxState.targetPos.y = targetPos.y + contentHeight * 0.5;
      } else {
        lightboxState.targetPos.y += lookAtOffset;
      }

      // Look at content center (for sculptures, look at vertical center)
      lightboxState.targetLookAt = targetPos.copy();
      if (sculpture) {
        lightboxState.targetLookAt.y += contentHeight * 0.5;
      }
    }
  }

  // If blend is 0, clear target positions
  if (lightboxState.blend === 0) {
    lightboxState.targetPos = null;
    lightboxState.targetLookAt = null;
  }
};
