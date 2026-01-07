export const defaultVertexShader = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_textureIndex;

uniform mat3 u_projectionMatrix;

out vec2 v_texCoord;
out vec4 v_color;
out float v_textureIndex;

void main() {
    // a_position 已经是世界坐标，只需应用投影矩阵
    vec3 position = u_projectionMatrix * vec3(a_position, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
    
    v_texCoord = a_texCoord;
    v_color = a_color;
    v_textureIndex = a_textureIndex;
}
`;

export const defaultFragmentShader = `#version 300 es
precision mediump float;

in vec2 v_texCoord;
in vec4 v_color;
in float v_textureIndex;

uniform sampler2D u_textures[8];
out vec4 outColor;

void main() {
    int index = int(v_textureIndex + 0.5);
    // WebGL 2 supports non-constant index for sampler arrays if they are within bounds
    // but some drivers still have issues. ES 3.0 specs allow it.
    outColor = texture(u_textures[index], v_texCoord) * v_color;
}
`;
