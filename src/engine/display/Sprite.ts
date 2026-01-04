import { Node } from './Node';
import { TextureManager } from '../utils/TextureManager';
import type { IRenderer } from '../core/IRenderer';
// import { mat3 } from 'gl-matrix'; // 移除未使用的 mat3

/**
 * Sprite (精灵) 类
 * 
 * 显示 2D 图像的基本节点。
 * 继承自 Node，具有变换和交互能力。
 * 优化了渲染性能，使用静态共享缓冲区来减少 GC。
 */
export class Sprite extends Node {
    /** WebGL 纹理对象 */
    public texture: WebGLTexture | null = null;
    /** 纹理图片的 URL */
    public textureUrl: string = "";
    /** 颜色叠加/混合 (RGBA) */
    public color: Float32Array = new Float32Array([1, 1, 1, 1]);

    // --- 渲染优化共享缓冲区 (静态) ---
    // 避免每帧创建新数组
    private static sharedVertices: Float32Array = new Float32Array(8);
    private static sharedUVs: Float32Array = new Float32Array([
        0, 0, // Top-Left
        1, 0, // Top-Right
        1, 1, // Bottom-Right
        0, 1  // Bottom-Left
    ]);

    /**
     * 构造函数
     * @param gl WebGL 上下文
     * @param url 纹理图片路径 (可选)
     */
    constructor(gl: WebGLRenderingContext, url?: string) {
        super();
        if (url) {
            this.textureUrl = url;
            // 异步加载纹理
            TextureManager.loadTexture(gl, url).then(tex => {
                this.texture = tex;
                // 如果未设置宽高，默认使用 100x100 (实际项目中可能需要获取图片原始宽高)
                if (this.width === 0) this.width = 100;
                if (this.height === 0) this.height = 100;
                this.invalidate(); // 纹理加载完成，请求重绘
            });
        } else {
            // 创建默认白色纹理
            this.texture = TextureManager.createWhiteTexture(gl);
            this.width = 100;
            this.height = 100;
        }
    }

    /**
     * WebGL 渲染实现
     * 计算世界坐标并提交给渲染器进行批处理
     */
    renderWebGL(renderer: IRenderer) {
        if (!this.texture) return;
        
        // 计算四个顶点的世界坐标
        // 顺序: TL, TR, BR, BL
        const m = this.transform.worldMatrix;
        const w = this.width;
        const h = this.height;

        // 优化: 使用局部变量减少访问
        const m00 = m[0], m01 = m[1];
        const m10 = m[3], m11 = m[4];
        const m20 = m[6], m21 = m[7];

        const v = Sprite.sharedVertices;

        // 0: Top-Left (0, 0)
        v[0] = m20;
        v[1] = m21;

        // 1: Top-Right (w, 0)
        v[2] = m00 * w + m20;
        v[3] = m01 * w + m21;

        // 2: Bottom-Right (w, h)
        v[4] = m00 * w + m10 * h + m20;
        v[5] = m01 * w + m11 * h + m21;

        // 3: Bottom-Left (0, h)
        v[6] = m10 * h + m20;
        v[7] = m11 * h + m21;

        // 提交到渲染器批次
        renderer.drawQuad(
            this.texture,
            Sprite.sharedVertices,
            Sprite.sharedUVs,
            this.color
        );
    }
}
