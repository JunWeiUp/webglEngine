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

/**
 * 矩形特效着色器 (SDF)
 * 支持圆角、描边、外阴影、内阴影
 */
export const rectVertexShader = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_localCoord;

uniform mat3 u_projectionMatrix;
uniform mat3 u_viewMatrix;
uniform mat3 u_worldMatrix;
uniform vec2 u_size;
uniform float u_padding;

out vec2 v_localCoord;
out vec2 v_pixelCoord;

void main() {
    // 将 0..1 的 a_position 映射到包含 padding 的范围
    // 范围从 -padding 到 size + padding
    vec2 pos = (a_position - 0.5) * (u_size + u_padding * 2.0) + u_size * 0.5;
    
    v_pixelCoord = pos;
    v_localCoord = pos / u_size; // 注意：此时 localCoord 可能会超出 0..1
    
    vec3 worldPos = u_worldMatrix * vec3(pos, 1.0);
    vec3 clipPos = u_projectionMatrix * u_viewMatrix * worldPos;
    gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
`;

export const rectFragmentShader = `#version 300 es
precision highp float;

in vec2 v_localCoord;
in vec2 v_pixelCoord;

// 基础属性
uniform vec2 u_size;
uniform vec4 u_backgroundColor;
uniform vec4 u_borderRadius; // TL, TR, BR, BL
uniform vec4 u_borderColor;
uniform float u_borderWidth;
uniform int u_strokeType; // 0: inner, 1: center, 2: outer
uniform int u_strokeStyle; // 0: solid, 1: dashed
uniform vec2 u_strokeDash; // [dash, gap]

// 外阴影
uniform vec4 u_outerShadowColor;
uniform float u_outerShadowBlur;
uniform vec2 u_outerShadowOffset;
uniform float u_outerShadowSpread;

// 内阴影
uniform vec4 u_innerShadowColor;
uniform float u_innerShadowBlur;
uniform vec2 u_innerShadowOffset;
uniform float u_innerShadowSpread;

// 背景模糊相关
uniform sampler2D u_backgroundTexture;
uniform float u_backgroundBlur;
uniform float u_layerBlur;
uniform bool u_hasBackgroundBlur;
uniform bool u_isMask;

out vec4 fragColor;

// SDF for rounded rectangle with 4 different radii
// r = [top-left, top-right, bottom-right, bottom-left]
float sdRoundedRect(vec2 p, vec2 b, vec4 r) {
    vec2 radius;
    radius.x = (p.x > 0.0) ? r.y : r.x; // right: TR, left: TL
    radius.y = (p.x > 0.0) ? r.z : r.w; // right: BR, left: BL
    float res = (p.y > 0.0) ? radius.y : radius.x;
    vec2 q = abs(p) - b + res;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - res;
}

// 模拟高斯模糊的解析解 (用于阴影)
// 基于: https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/
float boxShadow(vec2 p, vec2 b, float r, float blur) {
    vec2 d = abs(p) - b + r;
    vec2 q = max(d, 0.0);
    float dist = length(q) - r;
    return 1.0 - smoothstep(-blur, blur, dist);
}

void main() {
    vec2 halfSize = u_size * 0.5;
    vec2 center = v_pixelCoord - halfSize;
    
    // 1. 计算基础形状 SDF
    float dist = sdRoundedRect(center, halfSize, u_borderRadius);
    
    // 如果是遮罩模式，只保留形状内部
    if (u_isMask) {
        if (dist > 0.0) discard;
        fragColor = vec4(1.0);
        return;
    }
    
    // 2. 处理背景模糊 (如果启用)
    vec4 bgColor = u_backgroundColor;
    if (u_hasBackgroundBlur) {
        // 改进：简单的多重采样模糊
        vec2 texSize = vec2(textureSize(u_backgroundTexture, 0));
        vec2 uv = gl_FragCoord.xy / texSize;
        
        vec4 blurColor = vec4(0.0);
        float blurRadius = u_backgroundBlur * 0.5; // 控制采样范围
        
        // 9-tap blur
        blurColor += texture(u_backgroundTexture, uv + vec2(-1.0, -1.0) * blurRadius / texSize) * 0.0625;
        blurColor += texture(u_backgroundTexture, uv + vec2(0.0, -1.0) * blurRadius / texSize) * 0.125;
        blurColor += texture(u_backgroundTexture, uv + vec2(1.0, -1.0) * blurRadius / texSize) * 0.0625;
        
        blurColor += texture(u_backgroundTexture, uv + vec2(-1.0, 0.0) * blurRadius / texSize) * 0.125;
        blurColor += texture(u_backgroundTexture, uv + vec2(0.0, 0.0) * blurRadius / texSize) * 0.25;
        blurColor += texture(u_backgroundTexture, uv + vec2(1.0, 0.0) * blurRadius / texSize) * 0.125;
        
        blurColor += texture(u_backgroundTexture, uv + vec2(-1.0, 1.0) * blurRadius / texSize) * 0.0625;
        blurColor += texture(u_backgroundTexture, uv + vec2(0.0, 1.0) * blurRadius / texSize) * 0.125;
        blurColor += texture(u_backgroundTexture, uv + vec2(1.0, 1.0) * blurRadius / texSize) * 0.0625;
        
        bgColor = mix(blurColor, bgColor, bgColor.a);
    }
    
    // 3. 计算外阴影
    vec4 outerShadow = vec4(0.0);
    if (u_outerShadowColor.a > 0.0) {
        vec2 shadowCenter = center - u_outerShadowOffset;
        float shadowDist = sdRoundedRect(shadowCenter, halfSize + u_outerShadowSpread, u_borderRadius);
        float blur = max(u_outerShadowBlur, u_layerBlur);
        float shadowAlpha = 1.0 - smoothstep(-blur, blur, shadowDist);
        outerShadow = u_outerShadowColor * shadowAlpha;
    }
    
    // 4. 计算内阴影
    vec4 innerShadow = vec4(0.0);
    if (u_innerShadowColor.a > 0.0) {
        vec2 shadowCenter = center - u_innerShadowOffset;
        // 内阴影是反向的 SDF
        float shadowDist = sdRoundedRect(shadowCenter, halfSize - u_innerShadowSpread, u_borderRadius);
        float blur = max(u_innerShadowBlur, u_layerBlur);
        float shadowAlpha = smoothstep(-blur, blur, shadowDist);
        // 只在形状内部显示
        float mask = smoothstep(0.5 + u_layerBlur, -0.5 - u_layerBlur, dist);
        innerShadow = u_innerShadowColor * shadowAlpha * mask;
    }
    
    // 5. 合成
    // 混合外阴影
    fragColor = outerShadow;
    
    // 混合背景颜色
    float edgeBlur = max(0.5, u_layerBlur);
    float shapeAlpha = smoothstep(edgeBlur, -edgeBlur, dist);
    fragColor = mix(fragColor, bgColor, shapeAlpha);
    
    // 混合内阴影
    fragColor = mix(fragColor, vec4(innerShadow.rgb, 1.0), innerShadow.a * shapeAlpha);
    
    // 6. 描边
    if (u_borderWidth > 0.0) {
        float borderDist;
        if (u_strokeType == 0) { // inner
            borderDist = abs(dist + u_borderWidth * 0.5) - u_borderWidth * 0.5;
        } else if (u_strokeType == 1) { // center
            borderDist = abs(dist) - u_borderWidth * 0.5;
        } else { // outer
            borderDist = abs(dist - u_borderWidth * 0.5) - u_borderWidth * 0.5;
        }
        float blur = max(0.5, u_layerBlur);
        float borderAlpha = smoothstep(blur, -blur, borderDist);
        
        // 虚线处理
        if (u_strokeStyle == 1 && borderAlpha > 0.0) {
            // 计算近似周长位置
            float pDist = 0.0;
            vec2 p = center;
            vec2 s = halfSize;
            
            // 简单的展开逻辑
            if (abs(p.x) * s.y > abs(p.y) * s.x) {
                // 左右边缘
                pDist = (p.x > 0.0) ? (s.x + s.y - p.y) : (s.x * 2.0 + s.y * 2.0 - (s.y - p.y));
            } else {
                // 上下边缘
                pDist = (p.y < 0.0) ? (s.x + p.x) : (s.x * 2.0 + s.y - (s.x - p.x));
            }
            
            float dashLen = u_strokeDash.x;
            float gapLen = u_strokeDash.y;
            float totalLen = dashLen + gapLen;
            
            if (totalLen > 0.0) {
                float m = mod(pDist, totalLen);
                if (m > dashLen) {
                    // 在间隔内，应用淡出
                    float dashEdgeBlur = 1.0; 
                    float dashAlpha = smoothstep(dashLen + dashEdgeBlur, dashLen, m) + smoothstep(totalLen - dashEdgeBlur, totalLen, m);
                    borderAlpha *= clamp(dashAlpha, 0.0, 1.0);
                }
            }
        }
        
        fragColor = mix(fragColor, u_borderColor, borderAlpha);
    }
}
`;
