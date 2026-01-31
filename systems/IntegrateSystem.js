// IntegrateSystem.js - Euler integration
// Updates position from velocity using p5.Vector methods

const IntegrateSystem = (world, dt) => {
  const entities = queryEntities(world, 'Transform', 'Velocity');

  entities.forEach(entity => {
    const { Transform: { pos }, Velocity: { vel } } = entity;
    pos.add(p5.Vector.mult(vel, dt));
  });
};
