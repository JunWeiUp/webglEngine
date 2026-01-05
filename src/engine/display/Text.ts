import { Node } from './Node';
import type { IRenderer } from '../core/IRenderer';

export class Text extends Node {
    private _text: string = "";
    private _fontSize: number = 24;
    private _fontFamily: string = "Arial";
    
    public fillStyle: string = "black";
    private dirtyLayout: boolean = true;

    constructor(text: string) {
        super();
        this.text = text;
    }

    get text(): string { return this._text; }
    set text(v: string) {
        if (this._text !== v) {
            this._text = v;
            this.dirtyLayout = true;
            this.invalidate();
        }
    }

    get fontSize(): number { return this._fontSize; }
    set fontSize(v: number) {
        if (this._fontSize !== v) {
            this._fontSize = v;
            this.dirtyLayout = true;
            this.invalidate();
        }
    }

    get fontFamily(): string { return this._fontFamily; }
    set fontFamily(v: string) {
        if (this._fontFamily !== v) {
            this._fontFamily = v;
            this.dirtyLayout = true;
            this.invalidate();
        }
    }

    /**
     * 更新文本布局尺寸
     * 使用 Canvas 测量文本宽度
     */
    private updateLayout(ctx: CanvasRenderingContext2D) {
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        const metrics = ctx.measureText(this.text);
        
        // 更新节点尺寸
        this.width = metrics.width;
        this.height = this.fontSize * 1.2; // 估算高度 (行高)
        
        this.dirtyLayout = false;
        
        // 尺寸改变，可能影响 AABB，标记 transform dirty (虽然 transform 没变，但尺寸变了影响 AABB)
        // 在 Node.ts 的 updateTransform 中，我们检查了 this.width > 0。
        // 为了确保 AABB 更新，我们需要触发一次 world matrix 更新流程或者直接更新 AABB。
        // 由于 Node 没有直接 updateAABB 的公开方法，我们通过标记 transform.dirty 来间接触发。
        this.transform.dirty = true;
    }

    renderCanvas(renderer: IRenderer) {
        const ctx = renderer.ctx;
        
        // 如果布局脏了，先更新尺寸
        // 这对于视锥体剔除很重要。
        // 注意：Renderer 在 renderNode 之前会检查 isVisible。
        // 如果 width/height 为 0，isVisible 可能直接返回 true (或者 false，取决于实现)。
        // 我们的 Renderer 实现是：if (node.width > 0 && node.height > 0) check...
        // 所以如果初始 width=0，它会跳过剔除检查直接渲染（假设可见），或者被剔除。
        // 最好是在 updateTransform 阶段就能更新 layout，但 Node 没有 updateLogic 钩子。
        // 这里我们在渲染前更新，如果是第一帧，可能在剔除检查时尺寸还是旧的。
        // 但对于 Text，通常影响不大。
        
        if (this.dirtyLayout) {
            this.updateLayout(ctx);
        }

        const m = this.transform.worldMatrix;
        ctx.setTransform(m[0], m[1], m[3], m[4], m[6], m[7]);

        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.fillStyle;
        ctx.textBaseline = "top";
        ctx.fillText(this.text, 0, 0);
    }
}
