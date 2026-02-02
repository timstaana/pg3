// Bloom fragment shader
// Combines original image with blurred version for glow effect

precision mediump float;

uniform sampler2D original;
uniform sampler2D blurred;
uniform vec2 canvasSize;
uniform float bloomStrength;
uniform float bloomThreshold;

varying vec2 vVertTexCoord;

void main() {
  vec2 uv = vVertTexCoord;

  // Sample both textures
  vec4 originalColor = texture2D(original, uv);
  vec4 blurredColor = texture2D(blurred, uv);

  // Calculate intensity based on brightness of original
  float brightness = max(max(originalColor.r, originalColor.g), originalColor.b);
  float intensity = max(brightness - bloomThreshold, 0.0) * bloomStrength;

  // Combine original + bloomed blur
  vec3 bloom = originalColor.rgb + blurredColor.rgb * intensity;

  gl_FragColor = vec4(bloom, originalColor.a);
}
