// frustumCulling.js - Frustum and distance culling utilities
// Optimizes rendering by skipping objects outside the camera view

const CULLING_CONFIG = {
  maxRenderDistance: 50.0,    // Don't render objects beyond this distance
  labelMaxDistance: 20.0,     // Labels fade out sooner
  frustumPadding: 2.0,        // Extra margin to prevent pop-in at edges
};

// Test if an AABB is potentially visible from the camera
const isAABBVisible = (aabb, cameraPos, cameraLookAt, maxDistance = CULLING_CONFIG.maxRenderDistance) => {
  // Calculate AABB center
  const centerX = (aabb.minX + aabb.maxX) * 0.5;
  const centerY = (aabb.minY + aabb.maxY) * 0.5;
  const centerZ = (aabb.minZ + aabb.maxZ) * 0.5;

  // Calculate AABB radius (half the diagonal)
  const sizeX = (aabb.maxX - aabb.minX) * 0.5;
  const sizeY = (aabb.maxY - aabb.minY) * 0.5;
  const sizeZ = (aabb.maxZ - aabb.minZ) * 0.5;
  const radius = Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ);

  // Distance culling - check if center is within render distance (+ radius for margin)
  const dx = centerX - cameraPos.x;
  const dy = centerY - cameraPos.y;
  const dz = centerZ - cameraPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const maxDistWithRadius = maxDistance + radius + CULLING_CONFIG.frustumPadding;

  if (distSq > maxDistWithRadius * maxDistWithRadius) {
    return false; // Too far away
  }

  // Behind-camera culling - check if object is behind the camera
  const camDirX = cameraLookAt.x - cameraPos.x;
  const camDirY = cameraLookAt.y - cameraPos.y;
  const camDirZ = cameraLookAt.z - cameraPos.z;

  // Normalize camera direction
  const camDirLen = Math.sqrt(camDirX * camDirX + camDirY * camDirY + camDirZ * camDirZ);
  const camDirNormX = camDirX / camDirLen;
  const camDirNormY = camDirY / camDirLen;
  const camDirNormZ = camDirZ / camDirLen;

  // Vector from camera to object center
  const dot = dx * camDirNormX + dy * camDirNormY + dz * camDirNormZ;

  // If dot product is negative (and object is beyond radius), it's behind camera
  if (dot < -radius) {
    return false; // Behind camera
  }

  // Object is potentially visible
  return true;
};

// Test if a point (like a label position) is visible
const isPointVisible = (point, cameraPos, cameraLookAt, maxDistance = CULLING_CONFIG.maxRenderDistance) => {
  // Distance culling
  const dx = point.x - cameraPos.x;
  const dy = point.y - cameraPos.y;
  const dz = point.z - cameraPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > maxDistance * maxDistance) {
    return false; // Too far
  }

  // Behind-camera culling
  const camDirX = cameraLookAt.x - cameraPos.x;
  const camDirY = cameraLookAt.y - cameraPos.y;
  const camDirZ = cameraLookAt.z - cameraPos.z;

  const camDirLen = Math.sqrt(camDirX * camDirX + camDirY * camDirY + camDirZ * camDirZ);
  const camDirNormX = camDirX / camDirLen;
  const camDirNormY = camDirY / camDirLen;
  const camDirNormZ = camDirZ / camDirLen;

  const dot = dx * camDirNormX + dy * camDirNormY + dz * camDirNormZ;

  if (dot < 0) {
    return false; // Behind camera
  }

  return true;
};

// Calculate alpha for fading labels based on distance
const getLabelAlpha = (point, cameraPos) => {
  const dx = point.x - cameraPos.x;
  const dy = point.y - cameraPos.y;
  const dz = point.z - cameraPos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const fadeStartDist = CULLING_CONFIG.labelMaxDistance * 0.7;
  const fadeEndDist = CULLING_CONFIG.labelMaxDistance;

  if (dist < fadeStartDist) {
    return 1.0; // Full opacity
  } else if (dist > fadeEndDist) {
    return 0.0; // Fully transparent (culled)
  } else {
    // Linear fade
    return 1.0 - (dist - fadeStartDist) / (fadeEndDist - fadeStartDist);
  }
};
