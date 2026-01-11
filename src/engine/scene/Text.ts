import { Node } from './Node';
import { Renderer } from '../rendering/Renderer';
import type { IRenderer } from '../rendering/IRenderer';
import { Texture } from '../rendering/Texture';
import { AtlasManager } from '../rendering/AtlasManager';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';
import { RenderBatchHelper } from '../rendering/RenderBatchHelper';
import type { Rect } from '../math/Rect';

export class Text extends Node {
    public text: string = "";
    public fontSize: number = 12;
    public fillStyle: string = "black";
    public fontFamily: string = "Arial";

    private _texture: Texture | null = null; // 引用 Atlas 纹理
    private _contentDirty: boolean = true;

    // 静态共享 Canvas，减少数万个 Text 节点创建 Canvas 的开销
    private static sharedCanvas: HTMLCanvasElement | null = null;
    private static sharedCtx: CanvasRenderingContext2D | null = null;

    // 用于 Atlas 重置回调
    private _resetHandler: () => void;

    // --- 颜色属性优化 ---
    // Text 背景默认为透明
    private static readonly DEFAULT_BG_COLOR = (() => {
        const arr = new Float32Array([0, 0, 0, 0]);
        MemoryTracker.getInstance().track(MemoryCategory.CPU_TYPED_ARRAY, 'Text_DEFAULT_BG_COLOR', arr.byteLength, 'Text Default Background Color');
        return arr;
    })();

    /** 文本填充颜色 (RGBA) */
    public get color(): Float32Array {
        const bg = this.style.backgroundColor;
        if (bg instanceof Float32Array) return bg;
        if (Array.isArray(bg)) {
            const arr = new Float32Array(bg);
            this.style.backgroundColor = arr;
            return arr;
        }
        return Text.DEFAULT_BG_COLOR;
    }
    public set color(value: Float32Array) {
        this.style.backgroundColor = value;
        this.invalidate();
    }

    constructor(text: string = "") {
        super();
        this.text = text;
        this.set(this.x, this.y, 100, 20);
        
        // 初始化背景颜色为透明
        this.style = { backgroundColor: Text.DEFAULT_BG_COLOR };

        // 绑定回调，当 Atlas 重置时，标记内容脏，以便下次渲染时重新添加
        this._resetHandler = () => {
            this._contentDirty = true;
            this._texture = null; // 纹理引用可能变了（虽然单例通常不变，但重置意味着 UV 失效）
        };
        AtlasManager.getInstance().onReset(this._resetHandler);
    }

    // 销毁时记得移除回调
    public dispose() {
        AtlasManager.getInstance().offReset(this._resetHandler);
        super.dispose();
    }

    // 覆盖属性 setter 以触发更新
    public set content(v: string) {
        if (this.text !== v) {
            this.text = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    private updateTexture(renderer: Renderer) {
        if (!this._contentDirty && this._texture) return;

        // 确保 AtlasManager 已初始化
        const atlas = AtlasManager.getInstance();
        atlas.init(renderer.gl);

        // 初始化共享 Canvas
        if (!Text.sharedCanvas) {
            Text.sharedCanvas = document.createElement('canvas');
            Text.sharedCtx = Text.sharedCanvas.getContext('2d')!;

            MemoryTracker.getInstance().track(
                MemoryCategory.CPU_CANVAS,
                'Text_SharedCanvas',
                0, // 初始大小为 0
                'Text Shared Temporary Canvas'
            );
        }

        const canvas = Text.sharedCanvas;
        const ctx = Text.sharedCtx!;

        // 1. 测量文本
        const font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.font = font;
        const metrics = ctx.measureText(this.text);
        const textWidth = Math.ceil(metrics.width);
        const textHeight = Math.ceil(this.fontSize * 1.2);

        // 2. 调整 Canvas 大小并更新追踪
        if (canvas.width !== textWidth || canvas.height !== textHeight) {
            canvas.width = textWidth;
            canvas.height = textHeight;

            MemoryTracker.getInstance().track(
                MemoryCategory.CPU_CANVAS,
                'Text_SharedCanvas',
                textWidth * textHeight * 4,
                'Text Shared Temporary Canvas'
            );
        } else {
            ctx.clearRect(0, 0, textWidth, textHeight);
        }

        // 3. 绘制文本
        ctx.font = font;
        ctx.fillStyle = this.fillStyle;
        ctx.textBaseline = 'top';
        ctx.fillText(this.text, 0, 0);

        // 4. 更新节点尺寸
        this.set(this.x, this.y, textWidth, textHeight);


        // 5. 添加到 Atlas (带上 key 进行去重)
        const key = `${this.text}_${this.fontSize}_${this.fillStyle}_${this.fontFamily}`;
        const result = atlas.add(canvas, key);

        if (result) {
            if (this._texture) {
                // 复用 Texture 对象，仅更新引用
                this._texture.baseTexture = result.texture;
                this._texture.uvs = result.uvs;
                this._texture.width = textWidth;
                this._texture.height = textHeight;
            } else {
                this._texture = new Texture(result.texture, textWidth, textHeight);
                this._texture.uvs = result.uvs;
            }
        } else {
            // 如果添加失败（例如图集太小），降级或报错
            console.warn("Failed to add text to atlas");
        }

        this._contentDirty = false;
    }

    // 缓存颜色数组，避免 GC
    private static _sharedColor = new Float32Array([1, 1, 1, 1]);

    renderWebGL(renderer: IRenderer, dirtyRect?: Rect) {
        // 调用基类渲染效果和背景
        super.renderWebGL(renderer, dirtyRect);

        this.updateTexture(renderer as Renderer);

        if (!this._texture || !this._texture.baseTexture) return; // 确保 texture 和 baseTexture 都存在

        // 使用 RenderBatchHelper 提交到渲染器批次
        RenderBatchHelper.drawQuad(
            renderer,
            this.getWorldMatrix(),
            this.width,
            this.height,
            this._texture,
            Text._sharedColor
        );
    }
}
