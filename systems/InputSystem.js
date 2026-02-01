// InputSystem.js - Keyboard input processing
// Captures WASD/Arrow movement and spacebar jump

const keys = {};
const keysPressed = {}; // Track key press events (not hold)

const setupInputListeners = () => {
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (!keys[key]) {
      keysPressed[key] = true;
    }
    keys[key] = true;
  });
  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });
};

const InputSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Transform');
  const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
  const inLightboxMode = lightbox && lightbox.active;

  // Check if any key was pressed this frame
  const anyKeyPressed = Object.values(keysPressed).some(pressed => pressed);

  // Exit lightbox on any input after cooldown
  if (inLightboxMode && lightbox.cooldown <= 0 && anyKeyPressed) {
    if (typeof deactivateLightbox === 'function') {
      deactivateLightbox();
    }
  }

  // Only process player input if NOT in lightbox mode
  if (!inLightboxMode) {
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
    });

    // Handle Space to enter lightbox or jump
    if (keysPressed[' ']) {
      // Find closest interactable (painting or sculpture) and activate lightbox
      const interactables = queryEntities(world, 'Interaction');
      const closest = interactables.find(e => e.Interaction.isClosest);

      if (closest && typeof activateLightbox === 'function') {
        activateLightbox(closest);
      } else {
        // No interactable nearby, allow jump
        players.forEach(player => {
          if (player.Input) {
            player.Input.jump = true;
          }
        });
      }
    }
  } else {
    // In lightbox mode - disable all player controls
    players.forEach(player => {
      if (player.Input) {
        player.Input.forward = 0;
        player.Input.turn = 0;
        player.Input.jump = false;
      }
    });
  }

  // Clear pressed keys for next frame
  Object.keys(keysPressed).forEach(key => {
    keysPressed[key] = false;
  });
};
