// EmoteSystem.js — PNG billboard sprites rendered in 3D world space
//
// loadEmoteTextures()           — call once during setup() to pre-load PNGs
// spawnEmote(wx, wy, wz, id)   — spawn a sprite at a world position
// EmoteSystem(dt)               — age particles + render as depth-tested quads
//
// Each emote is a camera-facing quad drawn inside the same WORLD_SCALE/Y-flip
// transform as RenderSystem, so GPU depth testing, perspective foreshortening,
// and wall occlusion all work for free.

const EMOTE_DURATION = 2.5;  // seconds
const EMOTE_RISE     = 1.8;  // world units upward over lifetime
const EMOTE_SIZE     = 0.55; // world-unit half-size at birth

const _emotePool = [];
const _texCache  = new Map(); // emote id → p5.Image
const TAU        = Math.PI * 2;

// ── Texture loader (call once in setup) ──────────────────────────────────────

const loadEmoteTextures = () =>
  Promise.all(EMOTES.map(emote =>
    new Promise((res, rej) => loadImage(emote.src, res, rej))
      .then(img => _texCache.set(emote.id, img))
      .catch(e  => console.warn(`EmoteSystem: failed to load ${emote.src}`, e))
  ));

// ── Public API ────────────────────────────────────────────────────────────────

const spawnEmote = (wx, wy, wz, emoteId) => {
  if (!_texCache.has(emoteId)) return;  // texture not loaded, skip silently
  _emotePool.push({
    wx, wy, wz, emoteId, age: 0,
    // Per-particle randomised sway so no two emotes move in sync
    phaseX: Math.random() * TAU,
    phaseZ: Math.random() * TAU,
    freqX:  0.6 + Math.random() * 0.8,    // 0.6 – 1.4 cycles/sec
    freqZ:  0.5 + Math.random() * 0.7,    // 0.5 – 1.2 cycles/sec
    ampX:   0.10 + Math.random() * 0.12,  // 0.10 – 0.22 world units
    ampZ:   0.10 + Math.random() * 0.12,
  });
};

// ── System ────────────────────────────────────────────────────────────────────

const EmoteSystem = (dt) => {
  // Age and prune expired particles
  for (let i = _emotePool.length - 1; i >= 0; i--) {
    _emotePool[i].age += dt;
    if (_emotePool[i].age >= EMOTE_DURATION) _emotePool.splice(i, 1);
  }
  if (_emotePool.length === 0) return;

  // ── Render in world space ────────────────────────────────────────────────
  // Same scale as RenderSystem → quads share the scene depth buffer.
  //
  // alphaCutoutShader discards fully-transparent pixels so the PNG background
  // never appears over other emotes.  uFadeAlpha drives the lifetime fade on
  // the non-discarded (sprite body) pixels via standard alpha blending.
  //
  // depthMask(false): the depth buffer is still TESTED (walls occlude emotes)
  // but NOT WRITTEN, so semi-transparent fade pixels don't block geometry or
  // other emotes behind them.  Back-to-front sort ensures the blending order
  // is always correct when emotes overlap.

  const camX = cameraRig?.camPosWorld?.x ?? 0;
  const camY = cameraRig?.camPosWorld?.y ?? 0;
  const camZ = cameraRig?.camPosWorld?.z ?? 0;

  // Sort back-to-front so closer emotes blend on top of farther ones
  _emotePool.sort((a, b) => {
    const da = (a.wx-camX)**2 + (a.wy-camY)**2 + (a.wz-camZ)**2;
    const db = (b.wx-camX)**2 + (b.wy-camY)**2 + (b.wz-camZ)**2;
    return db - da;
  });

  const gl = drawingContext;
  gl.depthMask(false);

  push();
  scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE);
  noStroke();
  noLights();
  textureMode(NORMAL);

  for (const p of _emotePool) {
    const tex = _texCache.get(p.emoteId);
    if (!tex) continue;

    const t   = p.age / EMOTE_DURATION;
    const age = p.age;

    // Wavy drift: independent sine waves on X and Z give an organic path.
    // A small vertical ripple breaks up the perfectly linear rise.
    const wx = p.wx + p.ampX * Math.sin(p.phaseX + age * p.freqX * TAU);
    const wz = p.wz + p.ampZ * Math.sin(p.phaseZ + age * p.freqZ * TAU);
    const wy = p.wy + t * EMOTE_RISE
             + 0.06 * Math.sin(p.phaseX * 1.7 + age * 2.1);

    // Spherical billboard: face the camera in all directions
    const dxz   = Math.hypot(camX - wx, camZ - wz);
    const angle = Math.atan2(camX - wx, camZ - wz);
    const pitch = Math.atan2(camY - wy, dxz);

    // Grow slightly as it rises; fade out during the final 40 %
    const s         = EMOTE_SIZE * (0.75 + t * 0.5);
    const fadeAlpha = t < 0.6 ? 1.0 : 1.0 - (t - 0.6) / 0.4;

    push();
    translate(wx, wy, wz);
    rotateY(angle);
    rotateX(-pitch);  // negate: scale(W,-W,W) flips Y so rotateX direction is reversed

    if (alphaCutoutShader) {
      shader(alphaCutoutShader);
      alphaCutoutShader.setUniform('uTexture',     tex);
      alphaCutoutShader.setUniform('uAlphaCutoff', 0.05);
      alphaCutoutShader.setUniform('uFadeAlpha',   fadeAlpha);
    } else {
      tint(255, fadeAlpha * 255);
      texture(tex);
    }

    beginShape();
    vertex(-s, -s, 0,  0, 1);  // bottom-left
    vertex( s, -s, 0,  1, 1);  // bottom-right
    vertex( s,  s, 0,  1, 0);  // top-right
    vertex(-s,  s, 0,  0, 0);  // top-left
    endShape(CLOSE);

    if (alphaCutoutShader) resetShader();
    else noTint();
    pop();
  }

  pop();
  gl.depthMask(true);
};
