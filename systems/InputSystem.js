// InputSystem.js - Keyboard input (WASD / Arrow keys + Space to jump)

const keys        = {};
const keysPressed = {};

const setupInputListeners = () => {
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (!keys[key]) keysPressed[key] = true;
    keys[key] = true;
  });
  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });
};

const InputSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Transform');

  players.forEach(player => {
    const { Input: input } = player;

    // Tank controls: W/S = forward/back, A/D = turn left/right
    const fwd =
      (keys['w'] || keys['arrowup']    ? 1 : 0) -
      (keys['s'] || keys['arrowdown']  ? 1 : 0);
    const turn =
      (keys['d'] || keys['arrowright'] ? 1 : 0) -
      (keys['a'] || keys['arrowleft']  ? 1 : 0);

    // Keyboard overrides touch input when pressed
    if (fwd  !== 0) input.forward = fwd;
    if (turn !== 0) input.turn    = turn;
  });

  // Space = jump
  if (keysPressed[' ']) {
    players.forEach(p => { p.Input.jump = true; });
  }

  // Clear single-frame press events
  Object.keys(keysPressed).forEach(k => { keysPressed[k] = false; });
};
