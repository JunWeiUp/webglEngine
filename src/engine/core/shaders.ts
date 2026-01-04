export const defaultVertexShader = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform mat3 u_matrix;

varying vec2 v_texCoord;

void main() {
    vec3 position = u_matrix * vec3(a_position, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

export const defaultFragmentShader = `
precision mediump float;

varying vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec4 u_color;

void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord) * u_color;
}
`;
