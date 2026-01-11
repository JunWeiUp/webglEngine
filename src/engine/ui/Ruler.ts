export class Ruler {
    public horizontalCanvas: HTMLCanvasElement;
    public verticalCanvas: HTMLCanvasElement;
    private cornerCanvas: HTMLCanvasElement;
    private hCtx: CanvasRenderingContext2D;
    private vCtx: CanvasRenderingContext2D;
    private cCtx: CanvasRenderingContext2D;
    
    private rulerSize: number = 20;
    private backgroundColor: string = '#2c2c2c';
    private tickColor: string = '#444444';
    private textColor: string = '#888888';
    private font: string = '10px sans-serif';

    private cameraX: number = 0;
    private cameraY: number = 0;
    private cameraScale: number = 1;

    private mouseX: number = -1;
    private mouseY: number = -1;

    private selectionBounds: { x: number, y: number, width: number, height: number } | null = null;

    constructor(container: HTMLElement) {
        // Create horizontal ruler
        this.horizontalCanvas = document.createElement('canvas');
        this.horizontalCanvas.className = 'ruler horizontal';
        this.hCtx = this.horizontalCanvas.getContext('2d')!;

        // Create vertical ruler
        this.verticalCanvas = document.createElement('canvas');
        this.verticalCanvas.className = 'ruler vertical';
        this.vCtx = this.verticalCanvas.getContext('2d')!;

        // Create corner square
        this.cornerCanvas = document.createElement('canvas');
        this.cornerCanvas.className = 'ruler corner';
        this.cCtx = this.cornerCanvas.getContext('2d')!;

        container.appendChild(this.horizontalCanvas);
        container.appendChild(this.verticalCanvas);
        container.appendChild(this.cornerCanvas);

        this.resize();
    }

    private _dirty: boolean = false;

    public updateTransform(x: number, y: number, scale: number) {
        this.cameraX = x;
        this.cameraY = y;
        this.cameraScale = scale;
        this._dirty = true;
    }

    public updateMousePos(x: number, y: number) {
        if (this.mouseX === x && this.mouseY === y) return;
        this.mouseX = x;
        this.mouseY = y;
        this._dirty = true;
    }

    public updateSelection(bounds: { x: number, y: number, width: number, height: number } | null) {
        this.selectionBounds = bounds;
        this._dirty = true;
    }

    /**
     * 按需渲染标尺
     */
    public maybeRender() {
        if (this._dirty) {
            this.render();
            this._dirty = false;
        }
    }

    public setVisible(visible: boolean) {
        const display = visible ? 'block' : 'none';
        this.horizontalCanvas.style.display = display;
        this.verticalCanvas.style.display = display;
        this.cornerCanvas.style.display = display;
    }

    public resize() {
        const parent = this.horizontalCanvas.parentElement;
        if (!parent) return;

        const width = parent.clientWidth;
        const height = parent.clientHeight;

        const dpr = window.devicePixelRatio || 1;

        this.horizontalCanvas.width = width * dpr;
        this.horizontalCanvas.height = this.rulerSize * dpr;
        this.horizontalCanvas.style.width = `${width}px`;
        this.horizontalCanvas.style.height = `${this.rulerSize}px`;
        this.hCtx.scale(dpr, dpr);

        this.verticalCanvas.width = this.rulerSize * dpr;
        this.verticalCanvas.height = height * dpr;
        this.verticalCanvas.style.width = `${this.rulerSize}px`;
        this.verticalCanvas.style.height = `${height}px`;
        this.vCtx.scale(dpr, dpr);

        this.cornerCanvas.width = this.rulerSize * dpr;
        this.cornerCanvas.height = this.rulerSize * dpr;
        this.cornerCanvas.style.width = `${this.rulerSize}px`;
        this.cornerCanvas.style.height = `${this.rulerSize}px`;
        this.cCtx.scale(dpr, dpr);

        this.render();
    }

    private render() {
        this.renderHorizontal();
        this.renderVertical();
        this.renderCorner();
    }

    private renderCorner() {
        const ctx = this.cCtx;
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.rulerSize, this.rulerSize);
        
        ctx.strokeStyle = this.tickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.rulerSize - 0.5, 0);
        ctx.lineTo(this.rulerSize - 0.5, this.rulerSize);
        ctx.moveTo(0, this.rulerSize - 0.5);
        ctx.lineTo(this.rulerSize, this.rulerSize - 0.5);
        ctx.stroke();
    }

    private getStep(scale: number) {
        const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
        const minSpacing = 50; // pixels
        
        for (const step of steps) {
            if (step * scale >= minSpacing) {
                return step;
            }
        }
        return 10000;
    }

    private renderHorizontal() {
        const ctx = this.hCtx;
        const width = this.horizontalCanvas.width / (window.devicePixelRatio || 1);
        const height = this.rulerSize;

        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Draw selection highlight
        if (this.selectionBounds) {
            const sx = this.selectionBounds.x * this.cameraScale + this.cameraX;
            const sw = this.selectionBounds.width * this.cameraScale;
            ctx.fillStyle = 'rgba(24, 160, 251, 0.15)';
            ctx.fillRect(sx, 0, sw, height);
        }

        const step = this.getStep(this.cameraScale);
        const startWorldX = Math.floor((-this.cameraX) / (step * this.cameraScale)) * step;
        const endWorldX = Math.ceil((width - this.cameraX) / (step * this.cameraScale)) * step;

        ctx.strokeStyle = this.tickColor;
        ctx.fillStyle = this.textColor;
        ctx.font = this.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (let wx = startWorldX; wx <= endWorldX; wx += step) {
            const sx = wx * this.cameraScale + this.cameraX;
            
            // Draw main tick
            ctx.beginPath();
            ctx.moveTo(sx + 0.5, height * 0.5);
            ctx.lineTo(sx + 0.5, height);
            ctx.stroke();

            // Draw text
            ctx.fillText(wx.toString(), sx + 2, 2);

            // Draw sub-ticks
            const subStep = step / 5;
            for (let i = 1; i < 5; i++) {
                const swx = wx + i * subStep;
                const ssx = swx * this.cameraScale + this.cameraX;
                ctx.beginPath();
                ctx.moveTo(ssx + 0.5, height * 0.8);
                ctx.lineTo(ssx + 0.5, height);
                ctx.stroke();
            }
        }

        // Draw bottom border
        ctx.strokeStyle = this.tickColor;
        ctx.beginPath();
        ctx.moveTo(0, height - 0.5);
        ctx.lineTo(width, height - 0.5);
        ctx.stroke();

        // Draw mouse indicator
        if (this.mouseX >= 0) {
            ctx.strokeStyle = '#18a0fb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.mouseX + 0.5, 0);
            ctx.lineTo(this.mouseX + 0.5, height);
            ctx.stroke();
        }
    }

    private renderVertical() {
        const ctx = this.vCtx;
        const width = this.rulerSize;
        const height = this.verticalCanvas.height / (window.devicePixelRatio || 1);

        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Draw selection highlight
        if (this.selectionBounds) {
            const sy = this.selectionBounds.y * this.cameraScale + this.cameraY;
            const sh = this.selectionBounds.height * this.cameraScale;
            ctx.fillStyle = 'rgba(24, 160, 251, 0.15)';
            ctx.fillRect(0, sy, width, sh);
        }

        const step = this.getStep(this.cameraScale);
        const startWorldY = Math.floor((-this.cameraY) / (step * this.cameraScale)) * step;
        const endWorldY = Math.ceil((height - this.cameraY) / (step * this.cameraScale)) * step;

        ctx.strokeStyle = this.tickColor;
        ctx.fillStyle = this.textColor;
        ctx.font = this.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.save();
        for (let wy = startWorldY; wy <= endWorldY; wy += step) {
            const sy = wy * this.cameraScale + this.cameraY;
            
            // Draw main tick
            ctx.beginPath();
            ctx.moveTo(width * 0.5, sy + 0.5);
            ctx.lineTo(width, sy + 0.5);
            ctx.stroke();

            // Draw text (rotated)
            ctx.save();
            ctx.translate(2, sy + 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'right';
            ctx.fillText(wy.toString(), 0, 0);
            ctx.restore();

            // Draw sub-ticks
            const subStep = step / 5;
            for (let i = 1; i < 5; i++) {
                const swy = wy + i * subStep;
                const ssy = swy * this.cameraScale + this.cameraY;
                ctx.beginPath();
                ctx.moveTo(width * 0.8, ssy + 0.5);
                ctx.lineTo(width, ssy + 0.5);
                ctx.stroke();
            }
        }
        ctx.restore();

        // Draw right border
        ctx.strokeStyle = this.tickColor;
        ctx.beginPath();
        ctx.moveTo(width - 0.5, 0);
        ctx.lineTo(width - 0.5, height);
        ctx.stroke();

        // Draw mouse indicator
        if (this.mouseY >= 0) {
            ctx.strokeStyle = '#18a0fb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, this.mouseY + 0.5);
            ctx.lineTo(width, this.mouseY + 0.5);
            ctx.stroke();
        }
    }
}
