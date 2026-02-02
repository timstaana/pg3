// DialogueSystem.js - NPC dialogue and conversation management
// Handles dialogue state, NPC pausing, camera focus, and line progression

// Global dialogue state
let dialogueState = {
  active: false,
  targetEntity: null, // The NPC or entity being talked to
  conversation: null, // Current conversation data
  currentLine: 0,
  currentSpeaker: null, // Name of current speaker
  waitingForInput: false,
  focusPos: null, // Camera focus position
  focusDistance: 3.5, // Distance from NPC for dialogue camera
  cooldown: 0 // Prevent rapid toggling
};

// Helper function to find NPC by name
const findNPCByName = (world, name) => {
  const npcs = queryEntities(world, 'NPC', 'Transform');
  return npcs.find(npc => npc.NPC.name === name);
};

// Helper function to update camera focus to speaker
const updateFocusToSpeaker = (world, speakerName) => {
  const speaker = findNPCByName(world, speakerName);
  if (speaker && speaker.Transform) {
    const speakerPos = speaker.Transform.pos;
    dialogueState.focusPos = createVector(speakerPos.x, speakerPos.y + 0.75, speakerPos.z);
    dialogueState.currentSpeaker = speakerName;
    return speaker;
  }
  return null;
};

// Activate dialogue with an entity
const activateDialogue = (entity) => {
  if (!entity.Dialogue || dialogueState.cooldown > 0) return;

  const dialogue = entity.Dialogue;

  // Get first conversation (for now)
  if (!dialogue.conversations || dialogue.conversations.length === 0) {
    console.warn('No conversations defined for entity');
    return;
  }

  const conversation = dialogue.conversations[0];

  dialogueState.active = true;
  dialogueState.targetEntity = entity;
  dialogueState.conversation = conversation;
  dialogueState.currentLine = 0;
  dialogueState.waitingForInput = true;
  dialogueState.cooldown = 0.3;

  // Set camera focus to first speaker
  const firstLine = conversation.lines[0];
  if (firstLine && firstLine.speaker) {
    updateFocusToSpeaker(world, firstLine.speaker);
  } else if (entity.Transform) {
    // Fallback to entity position if no speaker specified
    const npcPos = entity.Transform.pos;
    dialogueState.focusPos = createVector(npcPos.x, npcPos.y + 0.75, npcPos.z);
  }

  // Pause NPC script if it has one (likely already paused from interaction range)
  if (entity.Script) {
    entity.Script.paused = true;
    entity.Script._pausedForInteraction = true;
  }

  // Make NPC face the player
  if (entity.Transform && entity.NPC) {
    const player = queryEntities(world, 'Player', 'Transform')[0];
    if (player) {
      const npcPos = entity.Transform.pos;
      const playerPos = player.Transform.pos;
      const toPlayer = p5.Vector.sub(playerPos, npcPos);
      toPlayer.y = 0;

      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      entity.Transform.rot.y = -degrees(angle);
    }
  }

  console.log(`Started dialogue: ${conversation.name || 'Unnamed conversation'}`);
};

// Deactivate dialogue and restore NPC state
const deactivateDialogue = () => {
  if (!dialogueState.active) return;

  const entity = dialogueState.targetEntity;

  // Don't resume script here - let the interaction range logic handle it
  // Just clear the dialogue-specific paused state
  if (entity && entity.Script) {
    // Script will be resumed by interaction range check if player is still nearby
    // or by leaving range check if player moved away
    entity.Script.paused = false;
    entity.Script._pausedForInteraction = false;
  }

  dialogueState.active = false;
  dialogueState.targetEntity = null;
  dialogueState.conversation = null;
  dialogueState.currentLine = 0;
  dialogueState.currentSpeaker = null;
  dialogueState.waitingForInput = false;
  dialogueState.focusPos = null;
  dialogueState.cooldown = 0.3;

  console.log('Dialogue ended');
};

// Progress to next dialogue line
const advanceDialogue = () => {
  if (!dialogueState.active || !dialogueState.waitingForInput) return;

  dialogueState.currentLine++;

  // Check if conversation is complete
  if (dialogueState.currentLine >= dialogueState.conversation.lines.length) {
    deactivateDialogue();
  } else {
    dialogueState.waitingForInput = true;

    // Check if speaker changed and update camera focus
    const currentLine = dialogueState.conversation.lines[dialogueState.currentLine];
    if (currentLine && currentLine.speaker && currentLine.speaker !== dialogueState.currentSpeaker) {
      updateFocusToSpeaker(world, currentLine.speaker);
    }
  }
};

// Get current dialogue state (for rendering and other systems)
const getDialogueState = () => dialogueState;

const DialogueSystem = (world, dt) => {
  // Update cooldown
  if (dialogueState.cooldown > 0) {
    dialogueState.cooldown -= dt;
  }

  // Handle NPCs in interaction range (before dialogue starts)
  if (!dialogueState.active) {
    // Only query NPCs if there are any with dialogue
    const interactableNPCs = queryEntities(world, 'NPC', 'Dialogue', 'Interaction');

    // Optimization: Only process if there are interactable NPCs
    if (interactableNPCs.length === 0) return;

    const player = queryEntities(world, 'Player', 'Transform')[0];
    if (!player) return;

    // Process each NPC efficiently
    for (const npc of interactableNPCs) {
      const interaction = npc.Interaction;

      // If this NPC is the closest interactable, pause and face player
      if (interaction.isClosest && interaction.inRange) {
        // Pause script and stop movement (only once)
        if (npc.Script && !npc.Script.paused) {
          npc.Script.paused = true;
          npc.Script._pausedForInteraction = true;
          // Clear velocity to stop NPC movement
          if (npc.Velocity) {
            npc.Velocity.vel.set(0, 0, 0);
          }
        }

        // Smoothly rotate to face player
        if (npc.Transform) {
          const npcPos = npc.Transform.pos;
          const playerPos = player.Transform.pos;
          const dx = playerPos.x - npcPos.x;
          const dz = playerPos.z - npcPos.z;

          const targetAngle = Math.atan2(dx, dz);
          const targetYaw = -degrees(targetAngle);

          let currentYaw = npc.Transform.rot.y;
          let diff = targetYaw - currentYaw;

          // Normalize angle difference
          if (diff > 180) diff -= 360;
          else if (diff < -180) diff += 360;

          const rotSpeed = 360;
          const step = rotSpeed * dt;

          if (Math.abs(diff) < step) {
            npc.Transform.rot.y = targetYaw;
          } else {
            npc.Transform.rot.y += Math.sign(diff) * step;
          }
        }
      }
      // If player left range, resume script
      else if (npc.Script && npc.Script._pausedForInteraction) {
        npc.Script.paused = false;
        npc.Script._pausedForInteraction = false;
      }
    }

    return; // Don't process dialogue mode
  }

  const player = queryEntities(world, 'Player', 'Transform')[0];
  if (!player) return;

  // Keep current speaker facing player during dialogue
  if (dialogueState.currentSpeaker) {
    const speakerEntity = findNPCByName(world, dialogueState.currentSpeaker);

    if (speakerEntity && speakerEntity.Transform) {
      const npcPos = speakerEntity.Transform.pos;
      const playerPos = player.Transform.pos;
      const dx = playerPos.x - npcPos.x;
      const dz = playerPos.z - npcPos.z;

      // Smoothly rotate to face player
      const targetAngle = Math.atan2(dx, dz);
      const targetYaw = -degrees(targetAngle);

      let currentYaw = speakerEntity.Transform.rot.y;
      let diff = targetYaw - currentYaw;

      // Normalize angle difference
      if (diff > 180) diff -= 360;
      else if (diff < -180) diff += 360;

      const rotSpeed = 360; // degrees per second
      const step = rotSpeed * dt;

      if (Math.abs(diff) < step) {
        speakerEntity.Transform.rot.y = targetYaw;
      } else {
        speakerEntity.Transform.rot.y += Math.sign(diff) * step;
      }
    }
  }
};
