// Edge detection fragment shader
// Detects edges based on alpha/color discontinuity

precision mediump float;

uniform sampler2D tex0;
uniform vec2 texelSize;
uniform vec3 outlineColor;
uniform float threshold;
uniform float outlineWidth;

varying vec2 vTexCoord;

void main() {
  vec2 uv = vTexCoord;

  // Sample center pixel
  vec4 center = texture2D(tex0, uv);

  // Early exit if we're far from any content
  if (center.a < 0.01) {
    // Check if any neighbor has alpha - if so, we might be on an edge
    float maxAlpha = 0.0;

    // Use fixed loop bounds (GLSL requires constants)
    // Check in a 5x5 neighborhood
    for (float y = -2.0; y <= 2.0; y += 1.0) {
      for (float x = -2.0; x <= 2.0; x += 1.0) {
        vec2 offset = vec2(x, y) * texelSize * outlineWidth;
        vec4 sample = texture2D(tex0, uv + offset);
        maxAlpha = max(maxAlpha, sample.a);
      }
    }

    // If we found opaque pixels nearby, render outline
    if (maxAlpha > threshold) {
      gl_FragColor = vec4(outlineColor, 1.0);
    } else {
      gl_FragColor = vec4(0.0);
    }
  } else {
    // We're on an opaque pixel - check neighbors for edge
    float minAlpha = 1.0;

    // Check immediate neighbors (4-way connectivity)
    minAlpha = min(minAlpha, texture2D(tex0, uv + vec2(0.0, texelSize.y)).a);
    minAlpha = min(minAlpha, texture2D(tex0, uv + vec2(0.0, -texelSize.y)).a);
    minAlpha = min(minAlpha, texture2D(tex0, uv + vec2(texelSize.x, 0.0)).a);
    minAlpha = min(minAlpha, texture2D(tex0, uv + vec2(-texelSize.x, 0.0)).a);

    // If there's a significant drop in alpha, we're on an edge
    if (minAlpha < threshold) {
      gl_FragColor = vec4(outlineColor, 1.0);
    } else {
      // Not an edge, make transparent so only outline shows
      gl_FragColor = vec4(0.0);
    }
  }
}
