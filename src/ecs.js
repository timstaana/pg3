// ecs.js - Minimal Entity Component System
// Plain JavaScript objects for data-driven architecture

// ========== World Management ==========

const createWorld = () => ({
  entities: [],
  nextId: 0
});

const createEntity = (world, components = {}) => {
  const entity = { id: world.nextId++, ...components };
  world.entities.push(entity);
  return entity;
};

const removeEntity = (world, entity) => {
  const idx = world.entities.indexOf(entity);
  if (idx !== -1) world.entities.splice(idx, 1);
};

const queryEntities = (world, ...componentNames) =>
  world.entities.filter(entity =>
    componentNames.every(name => entity[name] !== undefined)
  );

// ========== Component Definitions ==========
// Components are plain object properties attached to entities
//
// Transform: { pos: p5.Vector, rot: p5.Vector, scale: p5.Vector }
// Velocity: { vel: p5.Vector }
// Player: { radius, grounded, groundNormal, jumpSpeed, moveSpeed }
// Input: { move: p5.Vector, jump: boolean }
// Collider: { id, type, pos, rot, scale, size, vertices, faces }
// CanvasOverlay: { x, y, text, fontSize, color, bgColor, padding }
// TextSprite: { key, text, texture, size, dirty, fontSize, color, bgColor }
// CameraAnchor: { distance, offset, alwaysOnTop }
