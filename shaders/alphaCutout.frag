// Alpha cutout fragment shader
precision mediump float;

varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uAlphaCutoff; // Threshold for discarding fragments

void main() {
  vec4 texColor = texture2D(uTexture, vTexCoord);

  // Discard fragments below alpha threshold
  if (texColor.a < uAlphaCutoff) {
    discard;
  }

  gl_FragColor = texColor;
}
