// IntegrateSystem.js - Euler integration
// Updates position from velocity using p5.Vector methods

const IntegrateSystem = (world, dt) => {
  const entities = queryEntities(world, 'Transform', 'Velocity');

  entities.forEach(entity => {
    const { Transform: { pos }, Velocity: { vel } } = entity;
    // Optimize: modify position in-place without allocating new vector
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;
  });
};
