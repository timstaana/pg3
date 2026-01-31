// ecs.js - Minimal ECS using plain objects + arrays/maps

// ========== World ==========

function createWorld() {
  return {
    entities: [],
    nextId: 0
  };
}

function createEntity(world, components = {}) {
  const entity = {
    id: world.nextId++,
    ...components
  };
  world.entities.push(entity);
  return entity;
}

function removeEntity(world, entity) {
  const idx = world.entities.indexOf(entity);
  if (idx !== -1) {
    world.entities.splice(idx, 1);
  }
}

// Query entities with specific components
function queryEntities(world, ...componentNames) {
  return world.entities.filter(e => {
    return componentNames.every(name => e[name] !== undefined);
  });
}

// ========== Components ==========
// Components are just properties on entity objects
// Examples:
// { Transform: { pos, rot, scale } }
// { Velocity: { vel } }
// { Player: { radius, grounded } }
// { Collider: { ... } }
