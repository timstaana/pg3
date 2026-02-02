// ScriptSystem.js - Entity scripting and behavior
// Handles scripted movement, transformations, and actions for NPCs and other entities

const ScriptSystem = (world, dt) => {
  // Process entities with Script component
  const scriptedEntities = queryEntities(world, 'Script', 'Transform');

  scriptedEntities.forEach(entity => {
    const { Script: script, Transform: { pos, rot } } = entity;

    // Skip if script is paused (during dialogue/interaction)
    if (script.paused) return;

    // Skip if no active commands
    if (!script.commands || script.commands.length === 0) return;

    // Process current command
    const currentCommand = script.commands[0];
    if (!currentCommand) return;

    switch (currentCommand.type) {
      case 'moveTo':
        handleMoveTo(entity, currentCommand, dt);
        break;

      case 'rotateTo':
        handleRotateTo(entity, currentCommand, dt);
        break;

      case 'wait':
        handleWait(entity, currentCommand, dt);
        break;

      default:
        console.warn(`Unknown script command: ${currentCommand.type}`);
        script.commands.shift(); // Remove unknown command
    }

    // Check if command completed and remove it
    if (currentCommand.completed) {
      script.commands.shift();

      // If all commands completed and loop is enabled, restart
      if (script.commands.length === 0 && script.loop) {
        // Save original commands for looping
        if (!script._originalCommands) {
          console.warn('Loop enabled but no original commands saved');
        } else {
          // Deep copy original commands to reset them
          script.commands = JSON.parse(JSON.stringify(script._originalCommands));
        }
      }
    }
  });
};

// Move entity to target position
const handleMoveTo = (entity, command, dt) => {
  const { Transform: { pos }, Velocity: { vel } } = entity;

  if (!entity.Velocity) {
    console.warn('MoveTo requires Velocity component');
    command.completed = true;
    return;
  }

  const target = createVector(command.target[0], command.target[1], command.target[2]);
  const speed = command.speed || 2.0;
  const fly = command.fly !== undefined ? command.fly : false; // Enable 3D movement including Y

  // Calculate direction to target
  const toTarget = p5.Vector.sub(target, pos);

  // For fly mode, check 3D distance; otherwise only horizontal distance
  let distance;
  if (fly) {
    distance = toTarget.mag();
  } else {
    const horizontalTarget = toTarget.copy();
    horizontalTarget.y = 0;
    distance = horizontalTarget.mag();
  }

  // Check if reached target
  if (distance < 0.1) {
    if (fly) {
      vel.set(0, 0, 0); // Stop all movement
    } else {
      vel.set(0, vel.y, 0); // Keep Y velocity (gravity)
    }
    command.completed = true;
    return;
  }

  // Move towards target
  if (fly) {
    // 3D movement including Y axis (flying/gliding)
    toTarget.normalize();
    vel.x = toTarget.x * speed;
    vel.y = toTarget.y * speed;
    vel.z = toTarget.z * speed;
  } else {
    // Horizontal movement only (walking with gravity)
    toTarget.y = 0; // Ignore Y difference
    toTarget.normalize();
    vel.x = toTarget.x * speed;
    vel.z = toTarget.z * speed;
  }

  // Update rotation to face movement direction (horizontal only)
  if (entity.Transform.rot) {
    const angle = Math.atan2(toTarget.x, toTarget.z);
    entity.Transform.rot.y = -degrees(angle);
  }
};

// Rotate entity to target yaw
const handleRotateTo = (entity, command, dt) => {
  const { Transform: { rot } } = entity;
  const targetYaw = command.yaw;
  const speed = command.speed || 180; // degrees per second

  // Calculate shortest angle difference
  let diff = targetYaw - rot.y;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  // Check if reached target
  if (Math.abs(diff) < 1) {
    rot.y = targetYaw;
    command.completed = true;
    return;
  }

  // Rotate towards target
  const step = speed * dt;
  if (Math.abs(diff) < step) {
    rot.y = targetYaw;
    command.completed = true;
  } else {
    rot.y += Math.sign(diff) * step;
  }
};

// Wait for specified duration
const handleWait = (entity, command, dt) => {
  if (!command.elapsed) {
    command.elapsed = 0;
  }

  command.elapsed += dt;

  if (command.elapsed >= command.duration) {
    command.completed = true;
  }
};
