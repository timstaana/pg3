// RenderSystem.js — boxes · OBJ models · 2D sprites · blob shadows

let alphaCutoutShader = null; // assigned in main.js after shader loads

// ─── Box collider ──────────────────────────────────────────────────────────

const renderBoxCollider = (col) => {
  push();
  translate(col.pos.x, col.pos.y, col.pos.z);
  rotateY(radians( col.rot.y));
  rotateX(radians(-col.rot.x));
  rotateZ(radians(-col.rot.z));
  scale(col.scale.x, col.scale.y, col.scale.z);
  fill(...(col.color || [80, 120, 160]));
  noStroke();
  box(col.size[0], col.size[1], col.size[2]);
  pop();
};

// ─── OBJ model ────────────────────────────────────────────────────────────

const renderModel = ({ pos, rot, scale, geo, tex }) => {
  push();
  translate(pos.x, pos.y, pos.z);
  rotateY(radians(-rot.y));
  rotateX(radians(-rot.x));
  rotateZ(radians(-rot.z));
  scale(scale.x, scale.y, scale.z);
  noStroke();
  if (tex) texture(tex);
  else     ambientMaterial(160);
  model(geo);
  pop();
};

// ─── Blob shadow ──────────────────────────────────────────────────────────
// Optimisations vs naïve version:
//  1. XZ-AABB prefilter — only test triangles whose X/Z range contains the player.
//     Rejects ~90 % of triangles before any float-division touches them.
//  2. Hardcoded downward ray (0,−1,0) — Möller–Trumbore simplified so several
//     terms vanish, no temporary p5.Vector allocations at all.
//  3. Per-entity 2-frame stagger — entity with even id updates on even frames,
//     odd id on odd frames.  Halves the per-frame cost for every character.
//  4. Result cached in _shadowCache until the entity's frame arrives.

const _shadowCache = new Map(); // entityId → { hitY, dist } | null

const _getShadowHit = (entityId, pos, collWorld) => {
  // Only recompute on this entity's designated frame
  if ((frameCount & 1) !== (entityId & 1)) return _shadowCache.get(entityId) ?? null;

  const px = pos.x, py = pos.y, pz = pos.z;
  let bestT  = 10;       // max shadow distance (world units)
  let hitFound = false;

  for (const tri of collWorld.tris) {
    const { aabb } = tri;

    // ── 1. XZ prefilter (no trig, just bounds compare)
    if (px < aabb.minX || px > aabb.maxX ||
        pz < aabb.minZ || pz > aabb.maxZ ||
        aabb.maxY >= py) continue;         // triangle above player → skip

    // ── 2. Möller–Trumbore with ray dir = (0, −1, 0)
    //   h = dir × e2 = (0,−1,0) × e2 = (−e2z, 0, e2x)
    //   det = e1·h = e1z·e2x − e1x·e2z
    const { a, b, c } = tri;
    const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
    const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;

    const det = e1z * e2x - e1x * e2z;
    if (Math.abs(det) < 1e-8) continue;

    const f  = 1 / det;
    const sx = px - a.x, sy = py - a.y, sz = pz - a.z;

    //   u = f · (s·h) = f · (sz·e2x − sx·e2z)
    const u = f * (sz * e2x - sx * e2z);
    if (u < 0 || u > 1) continue;

    //   q = s × e1;  v = f · (dir·q) = f · (−qy)
    const qy = sz * e1x - sx * e1z;
    const v  = -f * qy;
    if (v < 0 || u + v > 1) continue;

    //   t = f · (e2·q)
    const qx = sy * e1z - sz * e1y;
    const qz = sx * e1y - sy * e1x;
    const t  = f * (e2x * qx + e2y * qy + e2z * qz);

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

const renderCharacterSprite = (pos, rot, anim, radius, frontTex, backTex) => {
  if (!frontTex || !backTex) return;

  // Choose front vs back texture from camera–character dot product
  const toCam   = p5.Vector.sub(cameraRig.camPosWorld, pos);
  toCam.y = 0;
  toCam.normalize();
  const yawRad   = radians(-rot.y);
  const useFront = toCam.dot(createVector(sin(yawRad), 0, cos(yawRad))) > 0;

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
  rotateY(yawRad); // reuse already-computed value
  noLights();
  noStroke();
  fill(255);
  texture(tex);
  textureMode(NORMAL);

  if (alphaCutoutShader) {
    shader(alphaCutoutShader);
    alphaCutoutShader.setUniform('uTexture', tex);
    alphaCutoutShader.setUniform('uAlphaCutoff', 0.1);
  }

  beginShape();
  vertex(-halfW, bottom,          0, uMin, 1);
  vertex( halfW, bottom,          0, uMax, 1);
  vertex( halfW, bottom + height, 0, uMax, 0);
  vertex(-halfW, bottom + height, 0, uMin, 0);
  endShape(CLOSE);

  if (alphaCutoutShader) resetShader();

  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);
  pop();
};

// ─── Main render pass ─────────────────────────────────────────────────────

const RenderSystem = (world, collisionWorld, dt) => {
  background(20);

  push();
  scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE); // Y-up → p5 Y-down

  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  const gl = drawingContext;
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // Solid geometry
  queryEntities(world, 'Collider').forEach(({ Collider: col }) => {
    if (col.type === 'box') renderBoxCollider(col);
  });
  queryEntities(world, 'Model').forEach(({ Model: m }) => renderModel(m));

  // Sprites + shadows — no backface culling (flat quads / circles)
  gl.disable(gl.CULL_FACE);

  queryEntities(world, 'Player',         'Transform').forEach(e => renderShadow(e, collisionWorld));
  queryEntities(world, 'NetworkedPlayer','Transform').forEach(e => renderShadow(e, collisionWorld));

  queryEntities(world, 'Player', 'Transform', 'Animation').forEach(entity => {
    const { Transform: { pos, rot }, Animation: anim, Player: pd } = entity;
    renderCharacterSprite(pos, rot, anim, pd.radius, PLAYER_FRONT_TEX, PLAYER_BACK_TEX);
  });

  queryEntities(world, 'NetworkedPlayer', 'Transform', 'Animation').forEach(entity => {
    const { Transform: { pos, rot }, Animation: anim, NetworkedPlayer: nd } = entity;
    renderCharacterSprite(pos, rot, anim, nd.radius, PLAYER_FRONT_TEX, PLAYER_BACK_TEX);
  });

  pop();
};
