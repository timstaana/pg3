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
    const keyboardForward =
      (keys['w'] || keys['arrowup'] ? 1 : 0) -
      (keys['s'] || keys['arrowdown'] ? 1 : 0);
    const keyboardTurn =
      (keys['d'] || keys['arrowright'] ? 1 : 0) -
      (keys['a'] || keys['arrowleft'] ? 1 : 0);

    // Merge keyboard and touch input (keyboard takes priority)
    // Touch input is set by TouchInputSystem, keyboard overrides if pressed
    if (keyboardForward !== 0) {
      input.forward = keyboardForward;
    }
    if (keyboardTurn !== 0) {
      input.turn = keyboardTurn;
    }
    if (keys[' ']) {
      input.jump = true;
    }
  });
};
