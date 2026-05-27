// RenderSystem.js - Renders box colliders + 2D player sprites in 3D space

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

// ─── 2D sprite billboard ───────────────────────────────────────────────────

const renderCharacterSprite = (pos, rot, anim, radius, frontTex, backTex) => {
  if (!frontTex || !backTex) return;

  // Choose front or back texture based on camera angle
  const camPos  = cameraRig.camPosWorld;
  const toCam   = p5.Vector.sub(camPos, pos);
  toCam.y = 0;
  toCam.normalize();

  const yawRad  = radians(-rot.y);
  const forward = createVector(sin(yawRad), 0, cos(yawRad));
  const useFront = toCam.dot(forward) > 0;

  // UV strip for current animation frame
  const fw   = 1 / anim.totalFrames;
  let uMin   = anim.currentFrame * fw;
  let uMax   = uMin + fw;
  if (!useFront) [uMin, uMax] = [uMax, uMin]; // flip for back texture

  const tex          = useFront ? frontTex : backTex;
  const halfW        = 0.5;
  const spriteHeight = 1.5;
  const bottom       = -radius;

  push();
  translate(pos.x, pos.y, pos.z);
  rotateY(radians(-rot.y));

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
  vertex(-halfW, bottom,               0, uMin, 1);
  vertex( halfW, bottom,               0, uMax, 1);
  vertex( halfW, bottom + spriteHeight, 0, uMax, 0);
  vertex(-halfW, bottom + spriteHeight, 0, uMin, 0);
  endShape(CLOSE);

  if (alphaCutoutShader) resetShader();

  // Restore scene lighting for subsequent objects
  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  pop();
};

// ─── Blob shadow ──────────────────────────────────────────────────────────

const raycastDown = (origin, collWorld, maxDist = 10) => {
  let closestDist = maxDist;
  let hitPoint    = null;

  collWorld.tris.forEach(tri => {
    const { a: v0, b: v1, c: v2 } = tri;
    if (!v0 || !v1 || !v2) return;

    const edge1 = p5.Vector.sub(v1, v0);
    const edge2 = p5.Vector.sub(v2, v0);
    const h     = p5.Vector.cross(createVector(0, -1, 0), edge2);
    const det   = p5.Vector.dot(edge1, h);
    if (Math.abs(det) < 0.0001) return;

    const f  = 1 / det;
    const s  = p5.Vector.sub(origin, v0);
    const u  = f * p5.Vector.dot(s, h);
    if (u < 0 || u > 1) return;

    const q  = p5.Vector.cross(s, edge1);
    const v  = f * p5.Vector.dot(createVector(0, -1, 0), q);
    if (v < 0 || u + v > 1) return;

    const t  = f * p5.Vector.dot(edge2, q);
    if (t > 0.0001 && t < closestDist) {
      closestDist = t;
      hitPoint    = p5.Vector.add(origin, p5.Vector.mult(createVector(0, -1, 0), t));
    }
  });

  return hitPoint ? { point: hitPoint, distance: closestDist } : null;
};

const renderShadow = (position, collWorld) => {
  const hit = raycastDown(position, collWorld, 10);
  if (!hit) return;

  const alpha = Math.max(0, 0.3 - hit.distance / 8);
  if (alpha <= 0) return;

  push();
  translate(position.x, hit.point.y + 0.05, position.z);
  rotateX(HALF_PI);
  noStroke();
  fill(0, 0, 0, alpha * 255);
  circle(0, 0, 0.8);
  pop();
};

// ─── Main render pass ─────────────────────────────────────────────────────

const RenderSystem = (world, collisionWorld, dt) => {
  background(20);

  push();
  // Convert Y-up world space to p5.js Y-down space
  scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE);

  ambientLight(100);
  directionalLight(200, 200, 200, 0, 1, 0);

  const gl = drawingContext;

  // ── Box colliders (backface culled for performance)
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  queryEntities(world, 'Collider').forEach(({ Collider: col }) => {
    if (col.type === 'box') renderBoxCollider(col);
  });

  // ── Sprites and shadows (no backface culling — double-sided quads)
  gl.disable(gl.CULL_FACE);

  // Shadows first (drawn behind sprites in depth buffer)
  queryEntities(world, 'Player', 'Transform').forEach(({ Transform: t }) => {
    renderShadow(t.pos, collisionWorld);
  });
  queryEntities(world, 'NetworkedPlayer', 'Transform').forEach(({ Transform: t }) => {
    renderShadow(t.pos, collisionWorld);
  });

  // Local player
  queryEntities(world, 'Player', 'Transform', 'Animation').forEach(entity => {
    const { Transform: { pos, rot }, Animation: anim, Player: pd } = entity;
    renderCharacterSprite(pos, rot, anim, pd.radius, PLAYER_FRONT_TEX, PLAYER_BACK_TEX);
  });

  // Remote (multiplayer) players — share the same sprite as the local player
  queryEntities(world, 'NetworkedPlayer', 'Transform', 'Animation').forEach(entity => {
    const { Transform: { pos, rot }, Animation: anim, NetworkedPlayer: nd } = entity;
    renderCharacterSprite(pos, rot, anim, nd.radius, PLAYER_FRONT_TEX, PLAYER_BACK_TEX);
  });

  pop();
};
