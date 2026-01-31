// IntegrateSystem.js - Integrate velocity into position

function IntegrateSystem(world, dt) {
  const entities = queryEntities(world, 'Transform', 'Velocity');

  for (let entity of entities) {
    const pos = entity.Transform.pos;
    const vel = entity.Velocity.vel;

    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;
  }
}
