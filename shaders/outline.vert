// Outline vertex shader
// Expands geometry along normals to create outline effect

attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;
uniform float uOutlineWidth;

void main() {
  // Calculate expanded position along normal
  vec3 expandedPosition = aPosition + aNormal * uOutlineWidth;

  // Transform to clip space
  vec4 positionVec4 = vec4(expandedPosition, 1.0);
  gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
}
