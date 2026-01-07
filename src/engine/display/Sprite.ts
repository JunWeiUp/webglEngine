import { Node } from './Node';
import { TextureManager } from '../utils/TextureManager';
import { Texture } from '../core/Texture';
import type { IRenderer } from '../core/IRenderer';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

/**
 * Sprite (精灵) 类
 * 
 * 显示 2D 图像的基本节点。
 * 继承自 Node，具有变换 and 交互能力。
 * 优化了渲染性能，使用静态共享缓冲区来减少 GC。
 */
export class Sprite extends Node {
    /** WebGL 纹理对象 */
    public texture: Texture | null = null;
    /** 纹理图片的 URL */
    public textureUrl: string = "";
    
    // --- 颜色属性优化 ---
    // 默认使用静态共享的白色，直到用户修改
    private static readonly DEFAULT_COLOR = (() => {
        const arr = new Float32Array([1, 1, 1, 1]);
        MemoryTracker.getInstance().track(MemoryCategory.CPU_TYPED_ARRAY, 'Sprite_DEFAULT_COLOR', arr.byteLength, 'Sprite Default Color');
        return arr;
    })();
    private _color: Float32Array = Sprite.DEFAULT_COLOR;

    /** 颜色叠加/混合 (RGBA) */
    public get color(): Float32Array {
        return this._color;
    }
    public set color(value: Float32Array) {
        this._color = value;
    }

    // --- 渲染优化共享缓冲区 (静态) ---
    // 避免每帧创建新数组
    private static sharedVertices: Float32Array = (() => {
        const arr = new Float32Array(8);
        MemoryTracker.getInstance().track(MemoryCategory.CPU_TYPED_ARRAY, 'Sprite_sharedVertices', arr.byteLength, 'Sprite Shared Vertices');
        return arr;
    })();
    // sharedUVs 不再静态共享，因为每个 Sprite 可能不同 (Atlas)
    // 但全屏纹理的 UV 是固定的，Texture 类默认提供。

    /**
     * 构造函数
     * @param gl WebGL 上下文
     * @param textureOrUrl 纹理对象或图片路径
     */
    constructor(gl: WebGL2RenderingContext, textureOrUrl?: string | Texture) {
        super();
        if (typeof textureOrUrl === 'string') {
            this.textureUrl = textureOrUrl;
            // 异步加载纹理
            TextureManager.loadTexture(gl, textureOrUrl).then(tex => {
                this.texture = tex;
                // 如果未设置宽高，默认使用纹理宽高
                if (this.width === 0) this.width = tex.width;
                if (this.height === 0) this.height = tex.height;
                this.invalidate(); // 纹理加载完成，请求重绘
            });
        } else if (textureOrUrl instanceof Texture) {
            this.texture = textureOrUrl;
            this.width = textureOrUrl.width;
            this.height = textureOrUrl.height;
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
        // 注意：现在传递 texture.baseTexture 和 texture.uvs
        renderer.drawQuad(
            this.texture.baseTexture,
            Sprite.sharedVertices,
            this.texture.uvs,
            this.color
        );
    }
}
