// Alpha cutout + Bayer ordered-dither fade fragment shader
//
// uAlphaCutoff — hard discard threshold for transparent edge pixels
// uFadeAlpha   — 0.0→1.0 lifetime opacity; drives Bayer dither during fade-out.
//                At 1.0 the max Bayer threshold is 15/16 so nothing is discarded.
//
// All array accesses use constant indices (GLSL ES 1.0 compatible).
precision mediump float;

varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uAlphaCutoff;
uniform float uFadeAlpha;

// 4×4 Bayer ordered-dither threshold in [0, 15/16].
// Uses vec4 rows + step()-based one-hot selectors — no dynamic array indexing.
float bayerThreshold(vec2 fragCoord) {
  vec2 p = floor(mod(fragCoord, 4.0));   // p.x, p.y each in {0,1,2,3}

  // 4×4 Bayer matrix rows, normalised to [0, 1)
  vec4 row0 = vec4( 0.0,  8.0,  2.0, 10.0) / 16.0;
  vec4 row1 = vec4(12.0,  4.0, 14.0,  6.0) / 16.0;
  vec4 row2 = vec4( 3.0, 11.0,  1.0,  9.0) / 16.0;
  vec4 row3 = vec4(15.0,  7.0, 13.0,  5.0) / 16.0;

  // One-hot row selector based on p.y
  float r0 = 1.0 - step(1.0, p.y);
  float r1 = step(1.0, p.y) - step(2.0, p.y);
  float r2 = step(2.0, p.y) - step(3.0, p.y);
  float r3 = step(3.0, p.y);
  vec4 row = row0 * r0 + row1 * r1 + row2 * r2 + row3 * r3;

  // One-hot column selector based on p.x
  vec4 col = vec4(
    1.0 - step(1.0, p.x),
    step(1.0, p.x) - step(2.0, p.x),
    step(2.0, p.x) - step(3.0, p.x),
    step(3.0, p.x)
  );

  return dot(row, col);
}

void main() {
  vec4 texColor = texture2D(uTexture, vTexCoord);

  // Hard edge cutout — discard fully transparent background pixels
  if (texColor.a < uAlphaCutoff) discard;

  // Bayer dither — discard if pixel's screen-space threshold exceeds current opacity
  if (uFadeAlpha < bayerThreshold(gl_FragCoord.xy)) discard;

  gl_FragColor = vec4(texColor.rgb, texColor.a);
}
