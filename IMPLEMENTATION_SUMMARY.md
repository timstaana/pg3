# Camera-Anchored 3D Text - Implementation Summary

## ✅ What Was Implemented

A complete camera-anchored 3D text rendering system that:

- **Renders text as 3D planes** that follow the camera view in world space
- **Always renders on top** of all world geometry (no depth occlusion)
- **Reuses existing text-to-texture pipeline** (only regenerates when text changes)
- **Data-driven ECS architecture** - entities with components, no hardcoded UI
- **Two-pass rendering**: world geometry first, then camera-anchored text

## 📁 Files Created/Modified

### New Systems
- **[TextTextureCacheSystem.js](src/systems/TextTextureCacheSystem.js)** - Manages TextSprite texture generation and caching
- **[CameraAnchoredTextRenderSystem.js](src/systems/CameraAnchoredTextRenderSystem.js)** - Renders camera-anchored text with depth test disabled

### Modified Files
- **[ecs.js](src/ecs.js)** - Added TextSprite and CameraAnchor component definitions
- **[main.js](src/main.js)** - Integrated new systems into render loop
- **[index.html](index.html)** - Added new system script tags

## 🎯 How It Works

### Component Definitions

**TextSprite** - Holds text content and texture cache
```javascript
{
  key: 'unique_id',           // Cache key
  text: 'Hello World',        // String or array of strings
  texture: null,              // Generated texture (managed by system)
  size: { x: 400, y: 80 },    // Plane size in pixels
  dirty: true,                // Set to true when text changes
  fontSize: 16,               // Optional
  color: [255, 255, 100],     // Optional [r,g,b]
  bgColor: [0, 0, 0, 200]     // Optional [r,g,b,a]
}
```

**CameraAnchor** - Positions text relative to camera
```javascript
{
  distance: 2.0,              // Distance in front of camera (world units)
  offset: { x: 0, y: 0, z: 0 }, // Camera-local offset (x=right, y=up, z=forward)
  alwaysOnTop: true           // Always true for this implementation
}
```

### Rendering Pipeline

1. **TextTextureCacheSystem** runs before rendering
   - Generates textures from text when `dirty === true`
   - Caches by `key` to avoid regeneration
   - Uses existing `renderTextToGraphics()` pipeline

2. **RenderSystem** (Pass 1: world geometry)
   - Normal depth testing enabled
   - Draws colliders, player, world objects

3. **CameraAnchoredTextRenderSystem** (Pass 2: always on top)
   - Disables depth test: `gl.disable(gl.DEPTH_TEST)`
   - Disables depth write: `gl.depthMask(false)`
   - Computes camera basis vectors from view direction
   - Positions planes relative to camera
   - Rotates planes to face camera
   - Restores depth test state

### Position Calculation

```javascript
forward = normalize(lookAtWorld - camPosWorld)  // Actual view direction
right = normalize(cross(worldUp, forward))      // Perpendicular to forward
up = normalize(cross(forward, right))           // Perpendicular to both

planePos = camPos
         + forward * (distance + offset.z)
         + right * offset.x
         + up * offset.y
```

## 📝 Usage Example

### Create a Camera-Anchored Text Entity

```javascript
// In your setup() or level loader
const promptEntity = createEntity(world, {
  TextSprite: {
    key: 'jump_prompt',
    text: 'Press SPACE to jump',
    texture: null,
    size: { x: 300, y: 60 },
    dirty: true,
    fontSize: 16,
    color: [255, 255, 100],
    bgColor: [0, 0, 0, 200]
  },
  CameraAnchor: {
    distance: 2.0,
    offset: { x: 0, y: 0, z: 0 },  // Centered
    alwaysOnTop: true
  }
});
```

### Update Text Dynamically

```javascript
// Change the text content
entity.TextSprite.text = 'New text content';
entity.TextSprite.dirty = true;  // Mark for regeneration
```

### Position Guide

Offset values (camera-local coordinates):
- **x**: negative = left, positive = right
- **y**: negative = down, positive = up
- **z**: negative = closer, positive = further

Example positions:
```javascript
// Top-left
offset: { x: -0.8, y: 0.5, z: 0 }

// Bottom-right
offset: { x: 0.8, y: -0.6, z: 0 }

// Center (default)
offset: { x: 0, y: 0, z: 0 }
```

## 🔧 Technical Details

### Key Implementation Decisions

1. **Forward vector from view direction** (not orbit angles)
   - Uses `normalize(lookAtWorld - camPosWorld)`
   - Works correctly regardless of camera orbit parameters

2. **Plane rotation to face camera**
   - Calculates yaw/pitch from forward vector
   - `yawAngle = atan2(-forward.x, -forward.z)`
   - `pitchAngle = asin(forward.y)`

3. **Depth test control via WebGL context**
   - `gl.disable(gl.DEPTH_TEST)` - no depth testing
   - `gl.depthMask(false)` - don't write to depth buffer
   - Enables blending for transparent backgrounds

4. **Plane size scaling**
   - Pixels * 0.5 for reasonable world-space size
   - Adjust multiplier based on your game's scale

### Debug Mode

Toggle debug visualization in [CameraAnchoredTextRenderSystem.js:4](src/systems/CameraAnchoredTextRenderSystem.js#L4):

```javascript
CameraAnchoredTextRenderSystem.debugWireframe = true;  // Shows sphere
CameraAnchoredTextRenderSystem.debugWireframe = false; // Shows text
```

## ✅ Requirements Met

All hard constraints satisfied:

- ✅ No DOM/HTML overlays
- ✅ No ortho() or 2D HUD overlay pass
- ✅ No billboard hacks (uses camera rotation matching)
- ✅ No re-rendering text every frame (only when dirty)
- ✅ Uses plane + texture in WEBGL
- ✅ Collision/physics/movement untouched
- ✅ Code is minimal, readable, and boring

## 📚 Documentation

- **[CAMERA_ANCHORED_TEXT_EXAMPLE.md](CAMERA_ANCHORED_TEXT_EXAMPLE.md)** - Full usage examples and positioning guide
- **[test_camera_anchored_text.js](test_camera_anchored_text.js)** - Test entities to paste into setup()
- **[debug_camera_text.js](debug_camera_text.js)** - Minimal debug test

## 🎮 Test It

Remove the debug test entity from [main.js](src/main.js) (the one added at the end of setup()) and create your own camera-anchored text entities using the examples above!
