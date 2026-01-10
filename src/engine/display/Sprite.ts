import { Node } from './Node';
import { TextureManager } from '../utils/TextureManager';
import { Texture } from '../core/Texture';
import { Renderer } from '../core/Renderer';
import type { IRenderer } from '../core/IRenderer';
import type { Rect } from '../core/Rect';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

/**
 * Sprite (精灵) 类
 * 
 * 显示 2D 图像的基本节点。
 * 继承自 Node，具有变换 and 交互能力。
 * 优化了渲染性能，使用静态共享缓冲区来减少 GC。
 */
export class Sprite extends Node {
    /** 内部纹理存储 */
    private _texture: Texture | null = null;
    /** 用于恢复纹理的 URL，只有在需要按需加载时才存储 */
    private _textureUrl: string | null = null;
    /** 上次在屏幕上可见的时间戳 (ms) */
    private _lastVisibleTime: number = 0;
    /** 是否正在加载中 */
    private _isLoading: boolean = false;

    public get texture(): Texture | null {
        return this._texture || TextureManager.getWhiteTexture();
    }

    public set texture(value: Texture | null) {
        // 如果旧纹理是通过 URL 加载的，且正在更换，则需要处理引用计数
        if (this._texture && this._textureUrl && Renderer.instance && this._texture !== value) {
            TextureManager.disposeTexture(Renderer.instance.gl, this._textureUrl);
        }
        this._texture = value;
        this.invalidate();
    }

    /** 纹理的 URL 地址 */
    public get textureUrl(): string | null {
        return this._textureUrl;
    }

    public set textureUrl(url: string | null) {
        if (this._textureUrl === url) return;

        // 如果旧纹理存在且有 URL，则先释放旧纹理引用
        if (this._texture && this._textureUrl && Renderer.instance) {
            TextureManager.disposeTexture(Renderer.instance.gl, this._textureUrl);
            this._texture = null;
        }

        this._textureUrl = url;
        
        if (url && Renderer.instance) {
            this._isLoading = true;
            TextureManager.loadTexture(Renderer.instance.gl, url).then(texture => {
                if (this._textureUrl === url) {
                    this._texture = texture;
                    this._isLoading = false;
                    // 如果没有设置宽高，则使用纹理宽高
                    if (this.width === 100 && this.height === 100) {
                        this.set(this.x, this.y, texture.width, texture.height);
                    }
                    this.invalidate();
                }
            }).catch(err => {
                console.error(`Failed to load texture: ${url}`, err);
                this._isLoading = false;
            });
        }
        
        this.invalidate();
    }
    
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

    // sharedUVs 不再静态共享，因为每个 Sprite 可能不同 (Atlas)
    // 但全屏纹理的 UV 是固定的，Texture 类默认提供。

    /**
     * 构造函数
     * @param gl WebGL 上下文
     * @param textureOrUrl 纹理对象或图片路径
     */
    constructor(gl: WebGL2RenderingContext, textureOrUrl?: string | Texture, key?: string) {
        super();
        if (typeof textureOrUrl === 'string') {
            this._textureUrl = key || textureOrUrl; // 如果提供了 key，优先使用 key 作为缓存标识
            // 初始时不立即加载，等待第一次渲染时按需加载
        } else if (textureOrUrl instanceof Texture) {
            this._texture = textureOrUrl;
            // this.width = textureOrUrl.width;
            // this.height = textureOrUrl.height;
            this.set(this.x, this.y, textureOrUrl.width, textureOrUrl.height);
        } else {
            // 默认情况下 _texture 为 null，getter 会返回共享的白色纹理
            // 确保全局白色纹理已创建
            TextureManager.createWhiteTexture(gl);
            // this.width = 100;
            // this.height = 100;
            this.set(this.x, this.y, 100, 100);
        }
    }

    /**
     * 生命周期钩子：每帧检查是否需要卸载纹理以节省内存
     */
    public onUpdate() {
        // 性能优化：不需要每帧都检查，每 60 帧检查一次卸载
        if (this._texture && this._textureUrl && (this.id % 60 === Renderer.currentTime % 60)) {
            if (Renderer.currentTime - this._lastVisibleTime > 10000) {
                // 如果有 Renderer 实例且有 GL 上下文，则安全卸载
                if (Renderer.instance && Renderer.instance.gl) {
                    TextureManager.disposeTexture(Renderer.instance.gl, this._textureUrl);
                    this._texture = null;
                    // console.log(`[Sprite] Unloaded texture due to inactivity: ${this._textureUrl}`);
                }
            }
        }
    }

    /**
     * WebGL 渲染实现
     * 计算世界坐标并提交给渲染器进行批处理
     */
    renderWebGL(renderer: IRenderer, cullingRect?: Rect) {
        // 记录最后一次可见时间 (使用全局缓存的时间戳)
        this._lastVisibleTime = Renderer.currentTime;

        const hasEffects = Object.keys(this.effects).length > 0 || 
                          this.style.borderRadius || 
                          this.style.backgroundColor || 
                          this.style.borderWidth;
        
        // 如果有圆角等特效，且只是一个纯色块（使用白色纹理），则由 super.renderWebGL() 中的 drawRectWithEffects 处理背景色
        // 我们跳过这里的批处理绘制，以避免重复绘制（且批处理是直角的）
        const isPureColorWithEffects = hasEffects && (!this._texture || this._texture === TextureManager.getWhiteTexture());

        // 调用基类渲染效果和背景
        super.renderWebGL(renderer);

        if (isPureColorWithEffects) return;

        // 按需加载逻辑
        if (!this._texture && this._textureUrl && !this._isLoading) {
            this._isLoading = true;
            TextureManager.loadTexture(renderer.gl, this._textureUrl).then(tex => {
                this._texture = tex;
                this._isLoading = false;
                if (this.width === 0) this.set(this.x, this.y, tex.width, tex.height);
                if (this.height === 0) this.set(this.x, this.y, this.width, tex.height);
                this.invalidate();
            }).catch(() => {
                this._isLoading = false;
            });
        }

        const tex = this.texture;
        if (!tex || !tex.baseTexture) return;
        
        // 计算四个顶点的世界坐标
        // 顺序: TL, TR, BR, BL
        const m = this.getWorldMatrix();
        const w = this.width;
        const h = this.height;

        // 优化: 使用局部变量减少访问
        const m00 = m[0], m01 = m[1];
        const m10 = m[3], m11 = m[4];
        const m20 = m[6], m21 = m[7];

        // 提交到渲染器批次
        const baseTexture = tex.baseTexture;
        if (baseTexture) {
            renderer.drawQuadFast(
                baseTexture,
                m20, m21,                                   // TL (0, 0)
                m00 * w + m20, m01 * w + m21,               // TR (w, 0)
                m00 * w + m10 * h + m20, m01 * w + m11 * h + m21, // BR (w, h)
                m10 * h + m20, m11 * h + m21,               // BL (0, h)
                tex.uvs,
                this.color
            );
        }
    }

    /**
     * 销毁精灵，释放纹理引用
     */
    dispose() {
        if (this._texture && this._textureUrl && Renderer.instance) {
            TextureManager.disposeTexture(Renderer.instance.gl, this._textureUrl);
            this._texture = null;
        }
        super.dispose();
    }
}
