// InputSystem.js - Keyboard input processing
// Captures WASD/Arrow movement and spacebar jump

const keys = {};

const setupInputListeners = () => {
  window.addEventListener('keydown', e =>
    keys[e.key.toLowerCase()] = true
  );
  window.addEventListener('keyup', e =>
    keys[e.key.toLowerCase()] = false
  );
};

const InputSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Transform');

  players.forEach(player => {
    const { Input: input } = player;

    const moveX =
      (keys['d'] || keys['arrowright'] ? 1 : 0) -
      (keys['a'] || keys['arrowleft'] ? 1 : 0);
    const moveZ =
      (keys['s'] || keys['arrowdown'] ? 1 : 0) -
      (keys['w'] || keys['arrowup'] ? 1 : 0);

    const moveVec = createVector(moveX, 0, moveZ);
    const len = moveVec.mag();

    if (len > 0.01) {
      moveVec.normalize();
    }

    input.move.set(moveVec);
    input.jump = keys[' '] || false;
  });
};
