// Edge detection vertex shader
// Standard passthrough using p5.js matrices

attribute vec3 aPosition;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec2 vTexCoord;

void main() {
  // Pass through texture coordinates
  vTexCoord = aTexCoord;

  // Transform position using p5.js matrices
  vec4 positionVec4 = vec4(aPosition, 1.0);
  gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
}
