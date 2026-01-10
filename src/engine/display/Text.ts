import { Node } from './Node';
import { Renderer } from '../core/Renderer';
import type { IRenderer } from '../core/IRenderer';
import { Texture } from '../core/Texture';
import { AtlasManager } from '../utils/AtlasManager';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

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

    constructor(text: string = "") {
        super();
        this.text = text;
        // this.width = 100;
        // this.height = 20;
        this.set(this.x, this.y, 100, 20);
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
        // this.width = textWidth;
        // this.height = textHeight;
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
            // 这里暂不做降级处理，因为 Text 通常很小
            console.warn("Failed to add text to atlas");
        }

        this._contentDirty = false;
    }

    // 缓存颜色数组，避免 GC
    private static _sharedColor = new Float32Array([1, 1, 1, 1]);

    renderWebGL(renderer: IRenderer) {
        this.updateTexture(renderer as Renderer);

        if (!this._texture || !this._texture.baseTexture) return; // 确保 texture 和 baseTexture 都存在

        // 渲染纹理 Quad
        const m = this.getWorldMatrix();
        const w = this.width;
        const h = this.height;

        const m00 = m[0], m01 = m[1];
        const m10 = m[3], m11 = m[4];
        const m20 = m[6], m21 = m[7];

        // 计算四个顶点坐标 (无需 new Float32Array)
        // TL (0, 0)
        const x0 = m20;
        const y0 = m21;
        // TR (w, 0)
        const x1 = m00 * w + m20;
        const y1 = m01 * w + m21;
        // BR (w, h)
        const x2 = m00 * w + m10 * h + m20;
        const y2 = m01 * w + m11 * h + m21;
        // BL (0, h)
        const x3 = m10 * h + m20;
        const y3 = m11 * h + m21;

        renderer.drawQuadFast(
            this._texture.baseTexture,
            x0, y0,
            x1, y1,
            x2, y2,
            x3, y3,
            this._texture.uvs,
            Text._sharedColor
        );
    }


}
