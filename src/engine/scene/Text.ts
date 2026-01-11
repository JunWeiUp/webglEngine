import { Node } from './Node';
import { Renderer } from '../rendering/Renderer';
import type { IRenderer } from '../rendering/IRenderer';
import { Texture } from '../rendering/Texture';
import { AtlasManager } from '../rendering/AtlasManager';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';
import { RenderBatchHelper } from '../rendering/RenderBatchHelper';
import type { Rect } from '../math/Rect';
import { mat3 } from 'gl-matrix';

export type TextHighlightType = 'none' | 'mark' | 'rect' | 'wave' | 'line' | 'border' | 'dot' | 'circle';

export class Text extends Node {
    private _text: string = "";
    private _fontSize: number = 12;
    private _fillStyle: string = "black";
    private _fontFamily: string = "Arial";
    private _fontWeight: string = "normal";
    private _fontStyle: string = "normal";
    private _strokeStyle: string | null = null;
    private _strokeWidth: number = 0;
    private _letterSpacing: number = 0;
    private _textAlign: CanvasTextAlign = 'left';
    private _textBaseline: CanvasTextBaseline = 'top';
    private _highlightType: TextHighlightType = 'none';
    private _highlightColor: string = '#FFD700';

    // 内部计算的文字实际尺寸（不含描边 padding 之外的容器宽高）
    private _measuredWidth: number = 0;
    private _measuredHeight: number = 0;
    private _textureWidth: number = 0;
    private _textureHeight: number = 0;
    private _drawPaddingX: number = 0;
    private _drawPaddingY: number = 0;
    private _inkAscent: number = 0;

    public get text(): string { return this._text; }
    public set text(v: string) {
        if (this._text !== v) {
            this._text = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get fontSize(): number { return this._fontSize; }
    public set fontSize(v: number) {
        if (this._fontSize !== v) {
            this._fontSize = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get fillStyle(): string { return this._fillStyle; }
    public set fillStyle(v: string) {
        if (this._fillStyle !== v) {
            this._fillStyle = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get fontFamily(): string { return this._fontFamily; }
    public set fontFamily(v: string) {
        if (this._fontFamily !== v) {
            this._fontFamily = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get fontWeight(): string { return this._fontWeight; }
    public set fontWeight(v: string) {
        if (this._fontWeight !== v) {
            this._fontWeight = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get fontStyle(): string { return this._fontStyle; }
    public set fontStyle(v: string) {
        if (this._fontStyle !== v) {
            this._fontStyle = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get strokeStyle(): string | null { return this._strokeStyle; }
    public set strokeStyle(v: string | null) {
        if (this._strokeStyle !== v) {
            this._strokeStyle = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get strokeWidth(): number { return this._strokeWidth; }
    public set strokeWidth(v: number) {
        if (this._strokeWidth !== v) {
            this._strokeWidth = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get letterSpacing(): number { return this._letterSpacing; }
    public set letterSpacing(v: number) {
        if (this._letterSpacing !== v) {
            this._letterSpacing = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get textAlign(): CanvasTextAlign { return this._textAlign; }
    public set textAlign(v: CanvasTextAlign) {
        if (this._textAlign !== v) {
            this._textAlign = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get textBaseline(): CanvasTextBaseline { return this._textBaseline; }
    public set textBaseline(v: CanvasTextBaseline) {
        if (this._textBaseline !== v) {
            this._textBaseline = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get highlightType(): TextHighlightType { return this._highlightType; }
    public set highlightType(v: TextHighlightType) {
        if (this._highlightType !== v) {
            this._highlightType = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    public get highlightColor(): string { return this._highlightColor; }
    public set highlightColor(v: string) {
        if (this._highlightColor !== v) {
            this._highlightColor = v;
            this._contentDirty = true;
            this.invalidate();
        }
    }

    /**
     * Text 节点的宽高现在允许手动调整，作为文字渲染的“容器范围”
     * 渲染时会根据 textAlign 和 textBaseline 在此范围内对齐，但不会拉伸文字
     */
    public override get width(): number {
        return super.width;
    }
    public override set width(value: number) {
        super.width = value;
    }

    public override get height(): number {
        return super.height;
    }
    public override set height(value: number) {
        super.height = value;
    }

    public override set(x: number, y: number, width: number, height: number) {
        super.set(x, y, width, height);
    }

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
        this._text = text;
        this.setPosition(this.x, this.y);
        
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

    /**
     * 更新文字纹理和测量尺寸
     * @param renderer 渲染器实例
     */
    public updateTexture(renderer: Renderer) {
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
        const font = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        ctx.font = font;
        
        // 设置 letterSpacing (如果支持)
        if ('letterSpacing' in ctx) {
            (ctx as any).letterSpacing = `${this.letterSpacing}px`;
        }

        const metrics = ctx.measureText(this.text);
        
        // 1.1 更加精确的测量 (处理斜体、字母溢出等)
        const inkLeft = metrics.actualBoundingBoxLeft;
        const inkRight = metrics.actualBoundingBoxRight;
        const inkAscent = metrics.actualBoundingBoxAscent;
        const inkDescent = metrics.actualBoundingBoxDescent;
        
        const inkWidth = inkLeft + inkRight;
        const inkHeight = inkAscent + inkDescent;
        
        // 这里的 textWidthBase 是为了保证 Canvas 足够大能放下所有墨迹
        // 我们使用 metrics.width 作为布局宽度，inkWidth 作为绘图边界
        const textWidthBase = Math.max(metrics.width, inkWidth);
        
        // 计算包含描边和高亮的尺寸
        let hPadding = this.strokeWidth > 0 ? this.strokeWidth : 2;
        let vPadding = this.strokeWidth > 0 ? this.strokeWidth : 2;

        // 根据高亮类型增加额外的 padding，防止裁剪
        if (this.highlightType !== 'none') {
            const extraH = Math.max(this.fontSize * 0.35, 20);
            const extraV = Math.max(this.fontSize * 0.25, 12);
            hPadding += extraH;
            vPadding += extraV;
        }

        // 确保 Padding 足够大，不会裁剪墨迹
        hPadding = Math.max(hPadding, inkLeft + 2);
        vPadding = Math.max(vPadding, inkAscent + 2);

        const textWidth = Math.ceil(textWidthBase) + hPadding * 2;
        const textHeight = Math.ceil(inkHeight) + vPadding * 2;

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

        // 内部统一使用 alphabetic 基准线绘制，这样度量最准确且跨平台一致
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        // 文本绘制的基准坐标 (Baseline Position)
        // 我们希望墨迹的顶部对齐到 vPadding
        const baselineX = hPadding;
        const baselineY = vPadding + inkAscent;

        // 3. 绘制高亮 (背景类)
        if (this.highlightType !== 'none') {
            ctx.save();
            ctx.fillStyle = this.highlightColor;
            ctx.strokeStyle = this.highlightColor;
            
            // 重新设置绘制上下文状态
            ctx.font = font;
            ctx.textBaseline = 'alphabetic';
            if ('letterSpacing' in ctx) {
                (ctx as any).letterSpacing = `${this.letterSpacing}px`;
            }

            // 高亮区域计算 - 基于基准线而非墨迹中心，以保证稳定性
            const rawW = inkWidth;
            
            // x, y 是墨迹左上角坐标
            const x = hPadding - inkLeft;
            
            // 计算一个稳定的垂直中心（基准线上方约 0.35 * fontSize 处是 x-height 中心）
            const stableCenterY = baselineY - this.fontSize * 0.35;

            // 背景类高亮设置透明度
            if (this.highlightType === 'mark' || this.highlightType === 'circle') {
                ctx.globalAlpha = 0.5;
            }

            switch (this.highlightType) {
                case 'mark':
                    // 荧光笔效果：使用稳定中心
                    const markH = this.fontSize * 0.8;
                    ctx.save();
                    ctx.translate(x + rawW / 2, stableCenterY);
                    ctx.rotate(-0.01);
                    this.drawRoundedRect(ctx, -rawW / 2 - 4, -markH / 2, rawW + 8, markH, 2);
                    ctx.fill();
                    ctx.restore();
                    break;
                case 'rect':
                    ctx.lineWidth = Math.max(1.5, this.fontSize * 0.06);
                    ctx.lineCap = 'round';
                    const offset = 4;
                    const rx = x - offset;
                    const rw = rawW + offset * 2;
                    // rect 也基于稳定中心对齐
                    const rh = this.fontSize * 1.1;
                    const ry = stableCenterY - rh / 2;
                    
                    ctx.beginPath();
                    ctx.moveTo(rx - 2, ry); ctx.lineTo(rx + rw + 2, ry + 1);
                    ctx.moveTo(rx + rw, ry - 2); ctx.lineTo(rx + rw - 1, ry + rh + 2);
                    ctx.moveTo(rx + rw + 2, ry + rh); ctx.lineTo(rx - 2, ry + rh - 1);
                    ctx.moveTo(rx, ry + rh + 2); ctx.lineTo(rx + 1, ry - 2);
                    ctx.stroke();
                    break;
                case 'circle':
                    ctx.save();
                    ctx.translate(x + rawW / 2, stableCenterY);
                    ctx.rotate(0.01);
                    const circleH = this.fontSize * 1.2;
                    this.drawRoundedRect(ctx, -rawW / 2 - 10, -circleH / 2, rawW + 20, circleH, circleH / 2);
                    ctx.fill();
                    ctx.restore();
                    break;
                case 'border':
                    ctx.lineWidth = Math.max(2, this.fontSize * 0.08);
                    const borderH = this.fontSize * 1.2;
                    this.drawRoundedRect(ctx, x - 8, stableCenterY - borderH / 2, rawW + 16, borderH, 6);
                    ctx.stroke();
                    break;
                case 'line':
                    ctx.lineWidth = Math.max(2, this.fontSize * 0.08);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    // 下划线基于基准线偏移
                    const lineY = baselineY + this.fontSize * 0.1;
                    ctx.moveTo(x - 2, lineY);
                    ctx.quadraticCurveTo(x + rawW / 2, lineY + this.fontSize * 0.1, x + rawW + 2, lineY);
                    ctx.stroke();
                    break;
                case 'dot':
                    const dotRadius = Math.max(1.5, this.fontSize * 0.07);
                    const spacing = dotRadius * 4;
                    // 点也基于基准线偏移
                    const dotY = baselineY + this.fontSize * 0.2;
                    for (let dotX = x + dotRadius; dotX <= x + rawW; dotX += spacing) {
                        ctx.beginPath();
                        ctx.arc(dotX + (Math.random() - 0.5), dotY + (Math.random() - 0.5), dotRadius * (0.9 + Math.random() * 0.2), 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
                case 'wave':
                    ctx.lineWidth = Math.max(2, this.fontSize * 0.07);
                    ctx.lineCap = 'round';
                    // 波浪基于基准线偏移
                    this.drawWave(ctx, x, baselineY + this.fontSize * 0.1, rawW, Math.max(2, this.fontSize * 0.06));
                    break;
            }
            ctx.restore();
        }

        // 4. 绘制文本
        ctx.font = font;
        ctx.textBaseline = 'alphabetic';
        if ('letterSpacing' in ctx) {
            (ctx as any).letterSpacing = `${this.letterSpacing}px`;
        }

        // 绘制描边 (如果有)
        if (this.strokeStyle && this.strokeWidth > 0) {
            ctx.strokeStyle = this.strokeStyle;
            ctx.lineWidth = this.strokeWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(this.text, baselineX, baselineY);
        }

        // 绘制填充
        ctx.fillStyle = this.fillStyle;
        ctx.fillText(this.text, baselineX, baselineY);

        // 5. 记录测量尺寸和绘图偏移
        const oldMeasuredWidth = this._measuredWidth;
        const oldMeasuredHeight = this._measuredHeight;
        
        // 使用 metrics.width 和 fontSize 作为稳定的布局尺寸
        this._measuredWidth = metrics.width;
        this._measuredHeight = this.fontSize;
        this._textureWidth = textWidth;
        this._textureHeight = textHeight;
        this._drawPaddingX = hPadding;
        this._drawPaddingY = vPadding;
        this._inkAscent = inkAscent;

        // 如果节点宽高未初始化（为0），则自动适配为内容尺寸
        if (super.width === 0 || super.width === oldMeasuredWidth) {
            super.width = metrics.width;
        }
        if (super.height === 0 || super.height === oldMeasuredHeight) {
            super.height = this.fontSize;
        }

        // 6. 添加到 Atlas (带上 key 进行去重)
        const key = `${this.text}_${this.fontSize}_${this.fillStyle}_${this.fontFamily}_${this.fontWeight}_${this.fontStyle}_${this.strokeStyle}_${this.strokeWidth}_${this.letterSpacing}_${this.highlightType}_${this.highlightColor}`;
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

    private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    private drawWave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, amplitude: number) {
        const step = amplitude * 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 0; i < w; i += step) {
            // 添加一点随机性，让波浪看起来更像手绘
            const jitter = (Math.random() - 0.5) * (amplitude * 0.3);
            ctx.quadraticCurveTo(
                x + i + step / 4, y - amplitude + jitter, 
                x + i + step / 2, y + jitter
            );
            ctx.quadraticCurveTo(
                x + i + step * 3 / 4, y + amplitude + jitter, 
                x + i + step, y
            );
        }
        ctx.stroke();
    }

    // 缓存颜色数组，避免 GC
    private static _sharedColor = new Float32Array([1, 1, 1, 1]);

    renderWebGL(renderer: IRenderer, dirtyRect?: Rect) {
        // 调用基类渲染效果和背景
        super.renderWebGL(renderer, dirtyRect);

        this.updateTexture(renderer as Renderer);

        if (!this._texture || !this._texture.baseTexture) return;

        // 计算基于对齐方式的偏移
        let offsetX = 0;
        let offsetY = 0;

        // 水平对齐 (基于稳定的 _measuredWidth = metrics.width)
        switch (this.textAlign) {
            case 'center':
                offsetX = (this.width - this._measuredWidth) / 2;
                break;
            case 'right':
                offsetX = this.width - this._measuredWidth;
                break;
            case 'left':
            default:
                offsetX = 0;
                break;
        }

        // 垂直对齐 (基于稳定的 _measuredHeight = fontSize)
        switch (this.textBaseline) {
            case 'middle':
                offsetY = (this.height - this._measuredHeight) / 2;
                break;
            case 'bottom':
                offsetY = this.height - this._measuredHeight;
                break;
            case 'top':
            default:
                offsetY = 0;
                break;
        }

        // 构建局部矩阵以应用偏移
        const worldMatrix = this.getWorldMatrix();
        const drawMatrix = mat3.clone(worldMatrix);
        
        // 为了稳定性，我们不直接对齐墨迹边缘，而是对齐基准线 (Baseline)
        // 我们假设基准线应该在稳定的垂直偏移位置 (例如 fontSize 的 80% 处)
        const stableAscent = this.fontSize * 0.8;
        const targetBaselineY = offsetY + stableAscent;
        const targetBaselineX = offsetX;

        // 纹理中基准线的位置是:
        // x: this._drawPaddingX
        // y: this._drawPaddingY + this._inkAscent
        const finalOffsetX = targetBaselineX - this._drawPaddingX;
        const finalOffsetY = targetBaselineY - (this._drawPaddingY + this._inkAscent);

        if (finalOffsetX !== 0 || finalOffsetY !== 0) {
            mat3.translate(drawMatrix, drawMatrix, [finalOffsetX, finalOffsetY]);
        }

        // 使用 RenderBatchHelper 提交到渲染器批次
        RenderBatchHelper.drawQuad(
            renderer,
            drawMatrix,
            this._textureWidth,
            this._textureHeight,
            this._texture,
            Text._sharedColor
        );
    }
}
