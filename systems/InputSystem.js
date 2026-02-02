// InputSystem.js - Keyboard input processing
// Captures WASD/Arrow movement and spacebar jump

const keys = {};
const keysPressed = {}; // Track key press events (not hold)

// Mouse position for inspection mode (normalized -1 to 1 from screen center)
const mouseState = {
  x: 0, // Horizontal offset from center (-1 = left edge, 1 = right edge)
  y: 0  // Vertical offset from center (-1 = top edge, 1 = bottom edge)
};

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

  // Track mouse movement for inspection mode
  window.addEventListener('mousemove', e => {
    const canvasWidth = typeof width !== 'undefined' ? width : windowWidth;
    const canvasHeight = typeof height !== 'undefined' ? height : windowHeight;

    // Normalize to -1 to 1 range from screen center
    mouseState.x = (e.clientX / canvasWidth) * 2 - 1;
    mouseState.y = (e.clientY / canvasHeight) * 2 - 1;
  });
};

// Make mouse state available globally
const getMouseState = () => mouseState;

const InputSystem = (world, dt) => {
  const players = queryEntities(world, 'Player', 'Input', 'Transform');
  const lightbox = typeof getLightboxState === 'function' ? getLightboxState() : null;
  const inLightboxMode = lightbox && lightbox.active;
  const dialogue = typeof getDialogueState === 'function' ? getDialogueState() : null;
  const inDialogueMode = dialogue && dialogue.active;

  // Check if any key was pressed this frame
  const anyKeyPressed = Object.values(keysPressed).some(pressed => pressed);

  // Handle dialogue mode input
  if (inDialogueMode && dialogue.cooldown <= 0 && anyKeyPressed) {
    if (typeof advanceDialogue === 'function') {
      advanceDialogue();
    }
  }
  // Exit lightbox on any input after cooldown
  else if (inLightboxMode && lightbox.cooldown <= 0 && anyKeyPressed) {
    if (typeof deactivateLightbox === 'function') {
      deactivateLightbox();
    }
  }

  // Only process player input if NOT in lightbox or dialogue mode
  if (!inLightboxMode && !inDialogueMode) {
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

    // Handle Space to enter dialogue, lightbox, or jump
    if (keysPressed[' ']) {
      // Find closest interactable
      const interactables = queryEntities(world, 'Interaction');
      const closest = interactables.find(e => e.Interaction.isClosest);

      if (closest) {
        // Check if it's an NPC with dialogue
        if (closest.Dialogue && typeof activateDialogue === 'function') {
          activateDialogue(closest);
        }
        // Otherwise activate lightbox (paintings/sculptures)
        else if (typeof activateLightbox === 'function') {
          activateLightbox(closest);
        }
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
    // In lightbox or dialogue mode - disable all player controls
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
