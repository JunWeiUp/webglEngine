import { mat3 } from 'gl-matrix';
import type { IRenderer } from './IRenderer';
import type { Texture } from './Texture';

/**
 * 渲染批处理助手
 * 
 * 提供通用的 2D 渲染辅助方法，减少 Sprite, Text 等组件的重复代码。
 */
export class RenderBatchHelper {
    /**
     * 绘制一个矩形 Quad
     * @param renderer 渲染器
     * @param worldMatrix 世界变换矩阵
     * @param width 宽度
     * @param height 高度
     * @param texture 纹理对象
     * @param color 颜色 (RGBA)
     */
    public static drawQuad(
        renderer: IRenderer,
        worldMatrix: mat3,
        width: number,
        height: number,
        texture: Texture,
        color: Float32Array
    ) {
        if (!texture || !texture.baseTexture) return;

        // 优化: 使用局部变量减少矩阵访问
        const m = worldMatrix;
        const m00 = m[0], m01 = m[1];
        const m10 = m[3], m11 = m[4];
        const m20 = m[6], m21 = m[7];

        // 提交到渲染器批次
        // 计算四个顶点坐标: TL, TR, BR, BL
        renderer.drawQuadFast(
            texture.baseTexture,
            m20, m21,                                   // TL (0, 0)
            m00 * width + m20, m01 * width + m21,               // TR (w, 0)
            m00 * width + m10 * height + m20, m01 * width + m11 * height + m21, // BR (w, h)
            m10 * height + m20, m11 * height + m21,               // BL (0, h)
            texture.uvs,
            color
        );
    }
}
