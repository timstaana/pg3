// InteractionSystem.js - Detects nearby interactable objects
// Checks distance and facing direction to highlight interactable entities

const InteractionSystem = (world) => {
  const player = queryEntities(world, 'Player', 'Transform')[0];
  if (!player) return;

  const playerTransform = player.Transform;
  const playerPos = playerTransform.pos;

  // Calculate player forward direction from yaw (negated to match movement system)
  const playerYawRad = radians(-playerTransform.rot.y);
  const playerForward = createVector(
    Math.sin(playerYawRad),
    0,
    Math.cos(playerYawRad)
  );

  let closestInteractable = null;
  let closestDistance = Infinity;

  // Check all entities with Interaction component
  queryEntities(world, 'Interaction', 'Transform').forEach(entity => {
    const interaction = entity.Interaction;
    const transform = entity.Transform;

    // Calculate distance to player
    const dx = transform.pos.x - playerPos.x;
    const dy = transform.pos.y - playerPos.y;
    const dz = transform.pos.z - playerPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check if within interaction range
    const range = interaction.range || 2.5;
    if (distance > range) {
      interaction.inRange = false;
      return;
    }

    // Check if player is facing the object (if required)
    if (interaction.requireFacing !== false) {
      const toObject = createVector(dx, 0, dz);
      toObject.normalize();

      const facingDot = playerForward.dot(toObject);
      const facingThreshold = interaction.facingDot || 0.3;

      if (facingDot < facingThreshold) {
        interaction.inRange = false;
        return;
      }
    }

    // This object is interactable
    interaction.inRange = true;

    // Track closest interactable
    if (distance < closestDistance) {
      closestDistance = distance;
      closestInteractable = entity;
    }
  });

  // Update which entity is the active interactable
  queryEntities(world, 'Interaction').forEach(entity => {
    entity.Interaction.isClosest = (entity === closestInteractable);
  });
};
