import { Node } from './Node';
import { TextureManager } from '../rendering/TextureManager';
import { Texture } from '../rendering/Texture';
import { Renderer } from '../rendering/Renderer';
import type { IRenderer } from '../rendering/IRenderer';
import type { Rect } from '../math/Rect';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';
import { RenderBatchHelper } from '../rendering/RenderBatchHelper';

/**
 * Sprite (精灵) 类
 * 
 * 显示 2D 图像的基本节点。
 * 继承自 Node，具有变换 and 交互能力。
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

    /** 颜色叠加/混合 (RGBA) */
    public get color(): Float32Array {
        const bg = this.style.backgroundColor;
        if (bg instanceof Float32Array) return bg;
        if (Array.isArray(bg)) {
            const arr = new Float32Array(bg);
            this.style.backgroundColor = arr;
            return arr;
        }
        return Sprite.DEFAULT_COLOR;
    }
    public set color(value: Float32Array) {
        this.style.backgroundColor = value;
        this.invalidate();
    }

    /**
     * 构造函数
     * @param gl WebGL 上下文
     * @param textureOrUrl 纹理对象或图片路径
     */
    constructor(gl: WebGL2RenderingContext, textureOrUrl?: string | Texture, key?: string) {
        super();
        this.style = { backgroundColor: Sprite.DEFAULT_COLOR };
        if (typeof textureOrUrl === 'string') {
            this._textureUrl = key || textureOrUrl; 
        } else if (textureOrUrl instanceof Texture) {
            this._texture = textureOrUrl;
            this.set(this.x, this.y, textureOrUrl.width, textureOrUrl.height);
        } else {
            TextureManager.createWhiteTexture(gl);
            this.set(this.x, this.y, 100, 100);
        }
    }

    /**
     * 生命周期钩子：每帧检查是否需要卸载纹理以节省内存
     */
    public onUpdate() {
        if (this._texture && this._textureUrl && (this.id % 60 === Renderer.currentTime % 60)) {
            if (Renderer.currentTime - this._lastVisibleTime > 10000) {
                if (Renderer.instance && Renderer.instance.gl) {
                    TextureManager.disposeTexture(Renderer.instance.gl, this._textureUrl);
                    this._texture = null;
                }
            }
        }
    }

    /**
     * WebGL 渲染实现
     */
    renderWebGL(renderer: IRenderer, _cullingRect?: Rect) {
        this._lastVisibleTime = Renderer.currentTime;

        const hasEffects = Object.keys(this.effects).length > 0 || 
                          this.style.borderRadius || 
                          this.style.backgroundColor || 
                          this.style.borderWidth;
        
        const isPureColorWithEffects = hasEffects && !this._textureUrl && (!this._texture || this._texture === TextureManager.getWhiteTexture());

        // 调用基类渲染效果和背景
        super.renderWebGL(renderer);

        if (isPureColorWithEffects && !this._textureUrl) return;

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
        
        // 使用 RenderBatchHelper 提交到渲染器批次
        RenderBatchHelper.drawQuad(
            renderer,
            this.getWorldMatrix(),
            this.width,
            this.height,
            tex,
            this.color
        );
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
