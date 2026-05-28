// RenderSystem.js — OBJ models · 2D sprites · blob shadows

let alphaCutoutShader = null; // assigned in main.js after shader loads



// ─── OBJ model ────────────────────────────────────────────────────────────

const renderModel = ({ pos, rot, scale: scl, geo, tex }) => {
  push();
  translate(pos.x, pos.y, pos.z);
  rotateY(radians(-rot.y));
  rotateX(radians(-rot.x));
  rotateZ(radians(-rot.z));
  scale(scl.x, scl.y, scl.z);
  noStroke();
  if (tex) texture(tex);
  else     ambientMaterial(160);
  model(geo);
  pop();
};

// ─── Blob shadow ──────────────────────────────────────────────────────────
// Optimisations:
//  1. XZ-AABB prefilter — rejects ~90% of triangles before any division.
//  2. Hardcoded downward ray — Möller–Trumbore with dir=(0,−1,0), no allocs.
//  3. 2-frame stagger — even entity ids update on even frames, odd on odd.
//  4. Result cached in _shadowCache until the entity's frame arrives.

const _shadowCache = new Map(); // entityId → { hitY, dist } | null

const _getShadowHit = (entityId, pos, collWorld) => {
  if ((frameCount & 1) !== (entityId & 1)) return _shadowCache.get(entityId) ?? null;

  const px = pos.x, py = pos.y, pz = pos.z;
  let bestT = 10;
  let hitFound = false;

  for (const tri of collWorld.tris) {
    const { aabb } = tri;
    if (px < aabb.minX || px > aabb.maxX ||
        pz < aabb.minZ || pz > aabb.maxZ ||
        aabb.maxY >= py) continue;

    const { a, b, c } = tri;
    const e1x = b.x-a.x, e1y = b.y-a.y, e1z = b.z-a.z;
    const e2x = c.x-a.x, e2y = c.y-a.y, e2z = c.z-a.z;
    const det = e1z*e2x - e1x*e2z;
    if (Math.abs(det) < 1e-8) continue;

    const f  = 1/det;
    const sx = px-a.x, sy = py-a.y, sz = pz-a.z;
    const u  = f*(sz*e2x - sx*e2z);
    if (u < 0 || u > 1) continue;
    const qy = sz*e1x - sx*e1z;
    const v  = -f*qy;
    if (v < 0 || u+v > 1) continue;
    const qx = sy*e1z - sz*e1y;
    const qz = sx*e1y - sy*e1x;
    const t  = f*(e2x*qx + e2y*qy + e2z*qz);
    if (t > 1e-4 && t < bestT) { bestT = t; hitFound = true; }
  }

  const result = hitFound ? { hitY: py - bestT, dist: bestT } : null;
  _shadowCache.set(entityId, result);
  return result;
};

const renderShadow = (entity, collWorld) => {
  const hit = _getShadowHit(entity.id, entity.Transform.pos, collWorld);
  if (!hit) return;

  const alpha = 0.3 - hit.dist / 8;
  if (alpha <= 0) return;

  const p = entity.Transform.pos;
  push();
  translate(p.x, hit.hitY + 0.05, p.z);
  rotateX(HALF_PI);
  noStroke();
  fill(0, 0, 0, alpha * 255);
  circle(0, 0, 0.8);
  pop();
};

// ─── 2D sprite billboard ───────────────────────────────────────────────────
// Zero allocation per call: dot product computed inline instead of via
// p5.Vector.sub + createVector.  Shader is activated once per frame for the
// whole batch (see RenderSystem below) — _spriteBatchActive suppresses the
// per-sprite shader() / resetShader() calls.

let _spriteBatchActive = false; // set by RenderSystem around sprite loops

const renderCharacterSprite = (pos, rot, anim, radius, frontTex, backTex, fadeAlpha = 1.0) => {
  if (!frontTex || !backTex) return;

  // Camera→character XZ direction, normalised — no vector allocations
  const dcx  = cameraRig.camPosWorld.x - pos.x;
  const dcz  = cameraRig.camPosWorld.z - pos.z;
  const dlen = Math.hypot(dcx, dcz) || 1;
  const tcx  = dcx / dlen, tcz = dcz / dlen;

  const yawRad   = radians(-rot.y);
  const useFront = tcx * sin(yawRad) + tcz * cos(yawRad) > 0;

  const fw   = 1 / anim.totalFrames;
  let uMin   = anim.currentFrame * fw;
  let uMax   = uMin + fw;
  if (!useFront) [uMin, uMax] = [uMax, uMin];

  const tex    = useFront ? frontTex : backTex;
  const halfW  = 0.5;
  const height = 1.5;
  const bottom = -radius;

  push();
  translate(pos.x, pos.y, pos.z);
  rotateY(yawRad);
  noLights();
  noStroke();
  fill(255);
  texture(tex);
  textureMode(NORMAL);

  if (alphaCutoutShader) {
    if (!_spriteBatchActive) shader(alphaCutoutShader); // hoisted to batch in RenderSystem
    alphaCutoutShader.setUniform('uTexture',     tex);
    alphaCutoutShader.setUniform('uAlphaCutoff', 0.1);
    alphaCutoutShader.setUniform('uFadeAlpha',   fadeAlpha);
  }

  beginShape();
  vertex(-halfW, bottom,          0, uMin, 1);
  vertex( halfW, bottom,          0, uMax, 1);
  vertex( halfW, bottom + height, 0, uMax, 0);
  vertex(-halfW, bottom + height, 0, uMin, 0);
  endShape(CLOSE);

  if (alphaCutoutShader && !_spriteBatchActive) resetShader();

  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);
  pop();
};

// ─── Main render pass ─────────────────────────────────────────────────────

const RenderSystem = (world, collisionWorld, dt) => {
  background(255);

  push();
  scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE); // Y-up → p5 Y-down

  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  // ── OBJ models: backface culling so camera can see through walls from behind.
  // Blender exports CCW outward normals (Y-up). The global scale(W,−W,W) flips Y,
  // which reverses winding → outward faces are now CW.  Setting frontFace=CW
  // makes those outward faces front-facing; inward (CCW) faces are culled.
  // Result: walls are solid from outside, invisible when camera passes behind them.
  const gl = drawingContext;
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  queryEntities(world, 'Model').forEach(({ Model: m }) => renderModel(m));

  // Sprites and shadows are flat quads/circles — no culling.
  gl.disable(gl.CULL_FACE);

  queryEntities(world, 'Player',         'Transform').forEach(e => renderShadow(e, collisionWorld));
  queryEntities(world, 'NetworkedPlayer','Transform').forEach(e => renderShadow(e, collisionWorld));

  // Activate shader once for all sprites — avoids N GPU state flushes per frame
  _spriteBatchActive = !!alphaCutoutShader;
  if (alphaCutoutShader) shader(alphaCutoutShader);

  queryEntities(world, 'Player', 'Transform', 'Animation').forEach(entity => {
    const { Transform: { pos, rot }, Animation: anim, Player: pd } = entity;
    renderCharacterSprite(pos, rot, anim, pd.radius, PLAYER_FRONT_TEX, PLAYER_BACK_TEX);
  });

  queryEntities(world, 'NetworkedPlayer', 'Transform', 'Animation').forEach(entity => {
    const { Transform: { pos, rot }, Animation: anim, NetworkedPlayer: nd } = entity;
    const skinTexs = (SKIN_TEXTURES && nd.skinId && SKIN_TEXTURES[nd.skinId])
      ? SKIN_TEXTURES[nd.skinId]
      : { front: PLAYER_FRONT_TEX, back: PLAYER_BACK_TEX };
    renderCharacterSprite(pos, rot, anim, nd.radius, skinTexs.front, skinTexs.back, nd.fadeAlpha ?? 1.0);
  });

  if (alphaCutoutShader) resetShader();
  _spriteBatchActive = false;

  pop();
};
