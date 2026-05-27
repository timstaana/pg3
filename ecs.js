// ecs.js - Minimal ECS with query caching
// queryEntities is called 10-15× per frame; caching makes it O(1) after first call.
// Cache is invalidated only when entities are added or removed (rare at runtime).

const createWorld = () => ({
  entities: [],
  nextId:   0,
  _cache:   new Map(), // componentKey → filtered entity[]
  _dirty:   false,     // true = rebuild cache on next query
});

const createEntity = (world, components = {}) => {
  const entity = { id: world.nextId++, ...components };
  world.entities.push(entity);
  world._dirty = true;
  return entity;
};

const removeEntity = (world, entity) => {
  const idx = world.entities.indexOf(entity);
  if (idx !== -1) world.entities.splice(idx, 1);
  world._dirty = true;
};

const queryEntities = (world, ...componentNames) => {
  if (world._dirty) {
    world._cache.clear();
    world._dirty = false;
  }
  const key = componentNames.join('\0');
  let cached = world._cache.get(key);
  if (!cached) {
    cached = world.entities.filter(e => componentNames.every(n => e[n] !== undefined));
    world._cache.set(key, cached);
  }
  return cached;
};
