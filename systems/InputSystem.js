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

    // Tank controls: forward/back and turn left/right
    const forward =
      (keys['w'] || keys['arrowup'] ? 1 : 0) -
      (keys['s'] || keys['arrowdown'] ? 1 : 0);
    const turn =
      (keys['d'] || keys['arrowright'] ? 1 : 0) -
      (keys['a'] || keys['arrowleft'] ? 1 : 0);

    input.forward = forward;
    input.turn = turn;
    input.jump = keys[' '] || false;
  });
};
