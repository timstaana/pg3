// Outline fragment shader
// Renders solid color with animated pulse

precision mediump float;

uniform vec3 uOutlineColor;
uniform float uPulseAmount;

void main() {
  // Apply pulse to opacity for animation effect
  float alpha = 1.0 - uPulseAmount * 0.3;
  gl_FragColor = vec4(uOutlineColor, alpha);
}
