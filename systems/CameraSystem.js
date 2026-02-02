// CameraSystem.js - Third-person camera with collision avoidance

const SMOOTH = 0.12;

// Runtime camera state
const cameraRig = {
  eye: null,
  center: null,
  initialized: false,
  camPosWorld: null,
  lookAtWorld: null
};

const worldToP5 = (pos) => createVector(
  pos.x * WORLD_SCALE,
  -pos.y * WORLD_SCALE,
  pos.z * WORLD_SCALE
);

// Raycast to check for obstacles between two points
const raycastObstacle = (from, to, collisionWorld, checkRadius = 0.3) => {
  const dir = p5.Vector.sub(to, from);
  const maxDist = dir.mag();

  if (maxDist < 0.001) return null;

  dir.normalize();

  // Use AABB to quickly filter triangles near the ray
  const rayMin = createVector(
    Math.min(from.x, to.x) - checkRadius,
    Math.min(from.y, to.y) - checkRadius,
    Math.min(from.z, to.z) - checkRadius
  );
  const rayMax = createVector(
    Math.max(from.x, to.x) + checkRadius,
    Math.max(from.y, to.y) + checkRadius,
    Math.max(from.z, to.z) + checkRadius
  );

  // Only check triangles that overlap the ray bounding box
  const candidates = collisionWorld.tris.filter(tri => {
    const aabb = tri.aabb;
    return !(aabb.maxX < rayMin.x || aabb.minX > rayMax.x ||
             aabb.maxY < rayMin.y || aabb.minY > rayMax.y ||
             aabb.maxZ < rayMin.z || aabb.minZ > rayMax.z);
  });

  const steps = Math.min(8, Math.ceil(maxDist * 1.5));
  const point = createVector(0, 0, 0);

  for (const tri of candidates) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const offset = maxDist * t;

      point.x = from.x + dir.x * offset;
      point.y = from.y + dir.y * offset;
      point.z = from.z + dir.z * offset;

      const closest = closestPointOnTriangle(point, tri.a, tri.b, tri.c);
      const dist = p5.Vector.dist(point, closest);

      if (dist < checkRadius) {
        return {
          hit: true,
          distance: offset
        };
      }
    }
  }

  return null;
};

const CameraSystem = (world, collisionWorld) => {
  const players = queryEntities(world, 'Player', 'Transform');
  if (players.length === 0) return;

  const player = players[0];
  const playerPos = player.Transform.pos;
  const playerYaw = player.Transform.rot.y;

  const cfg = CAMERA_CONFIG;

  // Mario 64 style: Camera on a boom arm behind player
  const yawRad = radians(-playerYaw);
  const pitchRad = radians(cfg.pitch);

  // Calculate boom arm position (distance back, height up, with pitch angle)
  const horizontalDist = cfg.distance * cos(pitchRad);
  const verticalOffset = cfg.distance * sin(pitchRad) + cfg.height;

  // Desired camera position: behind and above player
  const desiredX = playerPos.x - sin(yawRad) * horizontalDist;
  const desiredY = playerPos.y + verticalOffset;
  const desiredZ = playerPos.z - cos(yawRad) * horizontalDist;

  // Raycast from player to camera to check for obstacles
  const playerCenter = createVector(playerPos.x, playerPos.y + cfg.lookAtYOffset, playerPos.z);
  const desiredCamPos = createVector(desiredX, desiredY, desiredZ);
  const obstacle = raycastObstacle(playerCenter, desiredCamPos, collisionWorld, 0.5);

  // If blocked, pull camera closer
  let finalX = desiredX;
  let finalY = desiredY;
  let finalZ = desiredZ;

  if (obstacle && obstacle.hit) {
    const blockedDist = obstacle.distance * 0.9;
    const adjustedDist = Math.max(cfg.minDistance, blockedDist);

    const adjustedHorizontalDist = adjustedDist * cos(pitchRad);
    const adjustedVerticalOffset = adjustedDist * sin(pitchRad) + cfg.height;

    finalX = playerPos.x - sin(yawRad) * adjustedHorizontalDist;
    finalY = playerPos.y + adjustedVerticalOffset;
    finalZ = playerPos.z - cos(yawRad) * adjustedHorizontalDist;
  }

  // Look-at point: slightly above player's position
  const lookAtX = playerPos.x;
  const lookAtY = playerPos.y + cfg.lookAtYOffset;
  const lookAtZ = playerPos.z;

  // Blend with lightbox camera if active
  const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
  const lightboxBlend = lightbox ? lightbox.blend : 0;

  // Blend with dialogue camera if active
  const dialogue = typeof getDialogueState === 'function' ? getDialogueState() : null;
  const dialogueActive = dialogue && dialogue.active;

  let targetEyeX = finalX;
  let targetEyeY = finalY;
  let targetEyeZ = finalZ;
  let targetCenterX = lookAtX;
  let targetCenterY = lookAtY;
  let targetCenterZ = lookAtZ;

  // Prioritize dialogue camera over lightbox
  if (dialogueActive && dialogue.focusPos) {
    // Position camera in front of NPC, looking at NPC
    const npcPos = dialogue.focusPos;
    const dialogueDist = dialogue.focusDistance || 3.5;

    // Get player-to-NPC direction to position camera between them
    const toNpc = p5.Vector.sub(npcPos, playerPos);
    toNpc.y = 0;
    toNpc.normalize();

    // Camera positioned slightly to the side and closer to player
    const camOffset = p5.Vector.mult(toNpc, dialogueDist * 0.6);
    const sideOffset = createVector(-toNpc.z, 0, toNpc.x);
    sideOffset.mult(1.2); // Offset to side

    targetEyeX = playerPos.x + camOffset.x + sideOffset.x;
    targetEyeY = playerPos.y + 1.2; // Eye level
    targetEyeZ = playerPos.z + camOffset.z + sideOffset.z;
    targetCenterX = npcPos.x;
    targetCenterY = npcPos.y;
    targetCenterZ = npcPos.z;
  }
  // If lightbox is active (and dialogue is not), blend towards lightbox camera
  else if (lightboxBlend > 0 && lightbox.targetPos && lightbox.targetLookAt) {
    targetEyeX = lerp(finalX, lightbox.targetPos.x, lightboxBlend);
    targetEyeY = lerp(finalY, lightbox.targetPos.y, lightboxBlend);
    targetEyeZ = lerp(finalZ, lightbox.targetPos.z, lightboxBlend);
    targetCenterX = lerp(lookAtX, lightbox.targetLookAt.x, lightboxBlend);
    targetCenterY = lerp(lookAtY, lightbox.targetLookAt.y, lightboxBlend);
    targetCenterZ = lerp(lookAtZ, lightbox.targetLookAt.z, lightboxBlend);
  }

  // Smooth camera movement (Lakitu lag)
  if (!cameraRig.initialized) {
    cameraRig.eye = { x: targetEyeX, y: targetEyeY, z: targetEyeZ };
    cameraRig.center = { x: targetCenterX, y: targetCenterY, z: targetCenterZ };
    cameraRig.initialized = true;
  } else {
    // Slower smoothing in dialogue or lightbox mode
    const smooth = (dialogueActive || lightboxBlend > 0.5) ? SMOOTH * 1.5 : SMOOTH;
    cameraRig.eye.x = lerp(cameraRig.eye.x, targetEyeX, smooth);
    cameraRig.eye.y = lerp(cameraRig.eye.y, targetEyeY, smooth);
    cameraRig.eye.z = lerp(cameraRig.eye.z, targetEyeZ, smooth);
    cameraRig.center.x = lerp(cameraRig.center.x, targetCenterX, smooth);
    cameraRig.center.y = lerp(cameraRig.center.y, targetCenterY, smooth);
    cameraRig.center.z = lerp(cameraRig.center.z, targetCenterZ, smooth);
  }

  // Store for use by other systems
  cameraRig.camPosWorld = createVector(cameraRig.eye.x, cameraRig.eye.y, cameraRig.eye.z);
  cameraRig.lookAtWorld = createVector(cameraRig.center.x, cameraRig.center.y, cameraRig.center.z);

  // Apply to p5 camera
  const eyeP5 = worldToP5(cameraRig.camPosWorld);
  const centerP5 = worldToP5(cameraRig.lookAtWorld);

  camera(
    eyeP5.x, eyeP5.y, eyeP5.z,
    centerP5.x, centerP5.y, centerP5.z,
    0, 1, 0
  );
};
