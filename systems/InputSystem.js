// InputSystem.js - Keyboard input (WASD / Arrow keys + Space to jump)
//
// handleUIKeys() (defined in UISystem.js) is called first each frame so it can
// consume the keys it needs (skin cycling, emote) before movement sees them.

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

  document.addEventListener('selectstart', e => e.preventDefault());
};

const InputSystem = (world, dt) => {
  // UI keys run first — skin cycling, emote fire/navigate — may consume keys
  if (typeof handleUIKeys === 'function') handleUIKeys(keys, keysPressed, dt);

  // Block movement while skin select or emote picker is active
  if (typeof uiState !== 'undefined' && (uiState.skinPreview || uiState.emotePickerOpen)) {
    Object.keys(keysPressed).forEach(k => { keysPressed[k] = false; });
    return;
  }

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
