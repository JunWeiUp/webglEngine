/**
 * 阴影效果配置
 */
export interface ShadowEffect {
    color: [number, number, number, number]; // [r, g, b, a] 0-1
    blur: number;
    offsetX: number;
    offsetY: number;
    spread?: number;
}

/**
 * 节点效果配置
 */
export interface NodeEffects {
    /** 外阴影 */
    outerShadow?: ShadowEffect;
    /** 内阴影 */
    innerShadow?: ShadowEffect;
    /** 背景模糊 (毛玻璃效果) */
    backgroundBlur?: number;
    /** 图层模糊 */
    layerBlur?: number;
}

/**
 * 边框位置类型
 */
export type StrokeType = 'inner' | 'center' | 'outer';

/**
 * 描边样式
 */
export type StrokeStyle = 'solid' | 'dashed';

/**
 * 约束配置 (Constraints)
 * 
 * 决定当父节点尺寸改变时，子节点如何调整自己的位置或大小。
 */
export interface Constraints {
    horizontal: 'min' | 'max' | 'center' | 'scale' | 'both'; // min=left/top, max=right/bottom
    vertical: 'min' | 'max' | 'center' | 'scale' | 'both';
}

/**
 * 节点基础样式配置 (针对矩形元素)
 */
export interface NodeStyle {
    /** 背景颜色 [r, g, b, a] */
    backgroundColor?: [number, number, number, number] | Float32Array;
    /** 圆角半径 [topLeft, topRight, bottomRight, bottomLeft] 或 单个数字 */
    borderRadius?: number | [number, number, number, number];
    /** 边框颜色 */
    borderColor?: [number, number, number, number];
    /** 边框宽度 */
    borderWidth?: number;
    /** 边框位置类型 */
    strokeType?: StrokeType;
    /** 描边样式 */
    strokeStyle?: StrokeStyle;
    /** 虚线配置 [实线长度, 间隔长度] */
    strokeDashArray?: [number, number];
    /** 是否裁剪子节点 (溢出隐藏) */
    clipChildren?: boolean;
    /** 约束配置 */
    constraints?: Constraints;
}
