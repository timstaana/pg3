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
const calculateLightboxDistance = (contentWidth, contentHeight) => {
  // Get canvas dimensions
  const canvasWidth = typeof width !== 'undefined' ? width : windowWidth;
  const canvasHeight = typeof height !== 'undefined' ? height : windowHeight;

  // Camera FOV (p5.js default is 60 degrees vertical)
  const fovY = 60 * Math.PI / 180;
  const screenAspect = canvasWidth / canvasHeight;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * screenAspect);

  // Add padding to content dimensions (10% on each side = 1.2x total)
  const paddedWidth = contentWidth * 1.2;
  const paddedHeight = contentHeight * 1.2;

  // Calculate distance needed to fit content in both dimensions
  const distV = (paddedHeight * 0.5) / Math.tan(fovY / 2);
  const distH = (paddedWidth * 0.5) / Math.tan(fovX / 2);

  // Use larger distance to ensure content fits in both dimensions
  return Math.max(distV, distH);
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

    if (!transform) {
      console.error('Lightbox entity missing Transform component');
      return;
    }

    let artworkPos = transform.pos;
    let artworkRot = transform.rot;
    let contentWidth, contentHeight;

    console.log('Lightbox active for:', painting ? 'painting' : 'sculpture',
                'pos:', artworkPos, 'rot:', artworkRot);

    // Get content dimensions
    if (painting) {
      contentWidth = painting.width * painting.scale;
      contentHeight = painting.height * painting.scale;
    } else if (sculpture) {
      // Bounds can be array [w,h,d] or object {width,height,depth}
      const bounds = sculpture.bounds || [1, 1, 1];
      const scale = sculpture.scale?.x || 1; // Uniform scale (same as placeholder rendering)

      // Handle both array and object formats
      const w = Array.isArray(bounds) ? bounds[0] : bounds.width || 1;
      const h = Array.isArray(bounds) ? bounds[1] : bounds.height || 1;
      const d = Array.isArray(bounds) ? bounds[2] : bounds.depth || 1;

      // Use max of width/depth for horizontal, height for vertical
      contentWidth = Math.max(w, d) * scale;
      contentHeight = h * scale;
    }

    if (contentWidth && contentHeight) {
      // Calculate distance needed to fit artwork on screen
      let distance = calculateLightboxDistance(contentWidth, contentHeight);

      // Apply distance multiplier from config
      if (sculpture) {
        const sculptureMultiplier = LIGHTBOX_CONFIG?.sculptureDistanceMultiplier || 1.4;
        distance *= sculptureMultiplier;
      } else if (painting) {
        const paintingMultiplier = LIGHTBOX_CONFIG?.paintingDistanceMultiplier || 1.2;
        distance *= paintingMultiplier;
      }

      // Calculate forward direction from artwork rotation (perpendicular to artwork face)
      const yawRad = artworkRot.y * Math.PI / 180;
      const forward = createVector(Math.sin(yawRad), 0, Math.cos(yawRad));

      // Artwork is already centered at artworkPos (paintings are drawn centered,
      // sculptures are centered via centerOffset)
      const artworkCenter = artworkPos.copy();

      // Position camera in front of artwork, pointing straight at it
      const cameraOffset = p5.Vector.mult(forward, distance);
      lightboxState.targetPos = p5.Vector.add(artworkCenter, cameraOffset);

      // Look at artwork center
      lightboxState.targetLookAt = artworkCenter.copy();

      console.log('Camera setup:', 'distance:', distance, 'forward:', forward,
                  'cameraPos:', lightboxState.targetPos, 'lookAt:', lightboxState.targetLookAt);
    }
  }

  // If blend is 0, clear target positions
  if (lightboxState.blend === 0) {
    lightboxState.targetPos = null;
    lightboxState.targetLookAt = null;
  }
};
