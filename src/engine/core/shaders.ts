export const defaultVertexShader = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec4 a_color;
attribute float a_textureIndex;

uniform mat3 u_projectionMatrix;

varying vec2 v_texCoord;
varying vec4 v_color;
varying float v_textureIndex;

void main() {
    // a_position 已经是世界坐标，只需应用投影矩阵
    vec3 position = u_projectionMatrix * vec3(a_position, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
    
    v_texCoord = a_texCoord;
    v_color = a_color;
    v_textureIndex = a_textureIndex;
}
`;

export const defaultFragmentShader = `
precision mediump float;

varying vec2 v_texCoord;
varying vec4 v_color;
varying float v_textureIndex;

uniform sampler2D u_textures[8];

void main() {
    vec4 color = vec4(1.0);
    int index = int(v_textureIndex + 0.5); // Add 0.5 for safe rounding
    
    // 为了兼容 WebGL 1，使用 if-else 链进行纹理索引
    if (index == 0) color = texture2D(u_textures[0], v_texCoord);
    else if (index == 1) color = texture2D(u_textures[1], v_texCoord);
    else if (index == 2) color = texture2D(u_textures[2], v_texCoord);
    else if (index == 3) color = texture2D(u_textures[3], v_texCoord);
    else if (index == 4) color = texture2D(u_textures[4], v_texCoord);
    else if (index == 5) color = texture2D(u_textures[5], v_texCoord);
    else if (index == 6) color = texture2D(u_textures[6], v_texCoord);
    else if (index == 7) color = texture2D(u_textures[7], v_texCoord);
    
    gl_FragColor = color * v_color;
}
`;
