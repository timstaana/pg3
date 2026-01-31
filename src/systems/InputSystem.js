// InputSystem.js - Handle keyboard input for player

// Key state tracking
const keys = {};

function setupInputListeners() {
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });
}

function InputSystem(world, dt) {
  const players = queryEntities(world, 'Player', 'Input', 'Transform');

  for (let player of players) {
    const input = player.Input;

    // WASD + Arrow keys for movement
    let moveX = 0;
    let moveZ = 0;

    if (keys['w'] || keys['arrowup']) moveZ -= 1;
    if (keys['s'] || keys['arrowdown']) moveZ += 1;
    if (keys['a'] || keys['arrowleft']) moveX += 1;
    if (keys['d'] || keys['arrowright']) moveX -= 1;

    // Normalize diagonal movement
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0.01) {
      moveX /= len;
      moveZ /= len;
    }

    input.move.x = moveX;
    input.move.z = moveZ;

    // Jump input
    input.jump = keys[' '] || false;
  }
}
