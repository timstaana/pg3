# Minimal ECS 3D Platformer - Gallery 001

A minimal working skeleton of a 3rd-person platform game using p5.js v2 (WEBGL) with a data-driven ECS architecture and unified triangle collision.

## Features

- **Minimal ECS**: Plain objects + arrays/maps, no libraries
- **Unified Triangle Collision**: All colliders (boxes + meshes) converted to world-space triangles
- **Mario-style Slope Walking**: Players walk on gentle slopes without sliding (max 45°)
- **Micro-broadphase**: Simple AABB culling for performance
- **Data-driven Levels**: JSON-based level format
- **Wireframe Rendering**: Debug visualization of all collision geometry

## Controls

- **WASD** or **Arrow Keys**: Move player
- **Space**: Jump
- **Mouse**: (Camera rotation not yet implemented)

## Project Structure

```
/src
  main.js                    - Entry point, game loop
  ecs.js                     - Minimal ECS core
  levelLoader.js             - Load and parse level JSON
  collisionWorld.js          - Build unified triangle world
  math3d.js                  - Vector math and collision helpers
  textRenderer.js            - Text rendering for 3D and screen-space
  systems/
    InputSystem.js           - Handle keyboard input
    PlayerMotionSystem.js    - Apply input to velocity
    GravitySystem.js         - Apply gravity
    IntegrateSystem.js       - Integrate velocity into position
    CollisionSystem.js       - Sphere vs triangle resolution
    CameraSystem.js          - Mario 64 style orbit camera
    RenderSystem.js          - Wireframe rendering
/data
  level.json                 - Level definition
  collision/                 - Optional collision meshes (.obj)
index.html                   - HTML entry point
```

## Technical Details

### World Units

- **WORLD_SCALE** = 50 (1.0 world unit = 50 p5 units)
- All physics/collision in world units
- Rendering converts world → p5 units

### Collision System

- Player is a sphere (radius ~0.4 world units)
- All static geometry converted to triangles at load time
- Per-triangle precompute: normal, AABB
- Broadphase culling: simple AABB test around player
- Mario-style grounding: surfaces with normal.y >= 0.707 are walkable

### Text Rendering System

The game uses a flexible text rendering system that works in WEBGL mode:
- Text is rendered to 2D graphics buffers (cached)
- Buffers are displayed as textured planes in 3D space
- Supports both **screen-fixed** (UI overlays) and **world-space** (3D labels) text

**Usage examples:**

```javascript
// Screen-fixed text (top-left corner)
drawScreenText(
  ['Line 1', 'Line 2'],
  200, 60,        // x, y position on screen
  400, 120,       // width, height
  {
    bgColor: [0, 0, 0, 180],  // optional background
    fontSize: 14,              // optional font size
    color: [255, 255, 255]     // optional text color
  }
);

// World-space text (billboard in 3D)
drawWorldText(
  ['Platform 1'],
  vec3(6, 3, -2), // world position
  200, 40,        // width, height
  {
    bgColor: [100, 50, 150, 200],
    billboard: true  // always face camera
  }
);
```

### Constants

- `MAX_SLOPE_DEG` = 45° (walkable slope limit)
- `GRAVITY` = 20.0 world units/s²
- `queryMargin` = 0.5 (broadphase XZ margin)
- `downMargin` / `upMargin` = 2.0 (broadphase Y margin)

## Running the Game

1. Start a local web server (required for loading JSON/OBJ files):
   ```bash
   python -m http.server 8000
   ```
   or
   ```bash
   npx http-server
   ```

2. Open `http://localhost:8000` in your browser

3. You should see:
   - Wireframe floor, ramp, wall, and platforms
   - Green sphere (player)
   - Yellow line (ground normal when grounded)
   - Debug info (FPS, position, grounded state)

## Level Format

See [data/level.json](data/level.json) for the complete format.

Key elements:
- `playerSpawns`: Array of spawn points with position and yaw
- `collision.boxes`: Box colliders with transform
- `collision.meshes`: OBJ mesh colliders with transform
- `visuals`: (Not yet implemented - for future visual dressing)

## Next Steps (Extension Plan)

Visual dressing without touching collision:
1. Add `ModelRender` and `BillboardRender` components
2. Add `LinkToCollider` component for visual-collider binding
3. Add `VisualLinkSystem` to copy transforms
4. Add `VisualRenderSystem` to draw textured models/billboards

Critical rule: Visuals never generate colliders and are never read by CollisionSystem.

## License

Public domain / MIT
