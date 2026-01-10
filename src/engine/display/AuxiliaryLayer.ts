import { Node } from './Node';
import { mat3, vec2 } from 'gl-matrix';
import type { Rect } from '../core/Rect';
import type { IRenderer } from '../core/IRenderer';

export type HandleType = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'r' | 'rnw' | 'rne' | 'rse' | 'rsw';

export interface Handle {
    type: HandleType;
    x: number;
    y: number;
}

export interface AlignmentLine {
    type: 'v' | 'h'; // vertical or horizontal
    value: number;   // coordinate in world space
}

export interface Guide {
    type: 'v' | 'h';
    value: number; // World space coordinate
}

export class AuxiliaryLayer {
    public static readonly HANDLE_SIZE = 8;
    public hoveredNode: Node | null = null;
    public hoveredHandle: HandleType | null = null;
    public activeHandle: HandleType | null = null;
    public alignmentLines: AlignmentLine[] = [];
    public guides: Guide[] = [];
    public hoveredGuide: Guide | null = null;
    public selectedGuide: Guide | null = null;

    // --- 预分配临时变量 (GC 优化) ---
    private _tempMat3a = mat3.create();
    private _tempMat3b = mat3.create();
    private _tempVec2a = vec2.create();
    private _tempVec2b = vec2.create();
    private _tempVec2c = vec2.create();
    private _tempVec2d = vec2.create();
    private _tempCorners = [vec2.create(), vec2.create(), vec2.create(), vec2.create()];

    // Multi-selection support
    public selectedNodes: Set<Node> = new Set();

    // Backward compatibility wrapper (returns first selected or null)
    get selectedNode(): Node | null {
        if (this.selectedNodes.size === 0) return null;
        const first = this.selectedNodes.values().next();
        return first.value || null;
    }

    set selectedNode(node: Node | null) {
        this.selectedNodes.clear();
        if (node) {
            this.selectedNodes.add(node);
        }
    }

    // Dragging state
    public draggingNode: Node | null = null;
    public dragTargetNode: Node | null = null; // The container we are hovering over while dragging
    public dragProxyPos: vec2 = vec2.create(); // Screen position of the drag proxy

    // Box Selection
    public selectionRect: { start: vec2, end: vec2 } | null = null;

    constructor() { }


    render(ctx: CanvasRenderingContext2D, scene: Node, renderer: IRenderer, dirtyRect?: Rect) {
        const viewMatrix = renderer.getViewMatrix();
        // Reset transform to identity to draw in screen space
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (dirtyRect) {
            // 使用 Math.floor 和 Math.ceil 确保物理像素层面的完全清除
            const x = Math.floor(dirtyRect.x);
            const y = Math.floor(dirtyRect.y);
            const w = Math.ceil(dirtyRect.x + dirtyRect.width) - x;
            const h = Math.ceil(dirtyRect.y + dirtyRect.height) - y;
            ctx.clearRect(x, y, w, h);
        } else {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }

        // 1. Draw Selection
        // Iterate over all selected nodes
        for (const node of this.selectedNodes) {
            if (node !== this.draggingNode) {
                this.drawBounds(ctx, node, viewMatrix, '#0000ff', 2, false, dirtyRect);
                
                // Only draw handles for the first selected node (or all if you prefer)
                // For simplicity, let's draw handles if only one node is selected
                if (this.selectedNodes.size === 1) {
                    this.drawHandles(ctx, node, viewMatrix, dirtyRect);
                }
            }
        }

        // 2. Draw Hover
        if (this.hoveredNode && !this.selectedNodes.has(this.hoveredNode) && this.hoveredNode !== this.draggingNode) {
            this.drawBounds(ctx, this.hoveredNode, viewMatrix, '#ffff00', 2, false, dirtyRect);
        }

        // 3. Draw Dragging Logic
        if (this.draggingNode) {
            // Draw Target Highlight (where we will drop)
            if (this.dragTargetNode) {
                this.drawBounds(ctx, this.dragTargetNode, viewMatrix, '#00ff00', 3, true, dirtyRect);

                // Optional: Draw text saying "Drop here"
                const bounds = this.getScreenBounds(this.dragTargetNode, viewMatrix);
                if (bounds && this.rectIntersects(bounds, dirtyRect)) {
                    ctx.fillStyle = '#00ff00';
                    ctx.font = '12px Arial';
                    ctx.fillText(`Drop into: ${this.dragTargetNode.name}`, bounds.minX, bounds.minY - 5);
                }
            }

            // Draw Selection for Dragging Node (since it moves with mouse now)
            this.drawBounds(ctx, this.draggingNode, viewMatrix, '#0000ff', 2, false, dirtyRect);
        }

        // 4. Draw Selection Box
        if (this.selectionRect) {
            const start = this.selectionRect.start;
            const end = this.selectionRect.end;

            // 转换世界坐标到屏幕坐标
            const sStart = this._tempVec2a;
            const sEnd = this._tempVec2b;
            vec2.transformMat3(sStart, start, viewMatrix);
            vec2.transformMat3(sEnd, end, viewMatrix);

            const x = Math.min(sStart[0], sEnd[0]);
            const y = Math.min(sStart[1], sEnd[1]);
            const w = Math.abs(sEnd[0] - sStart[0]);
            const h = Math.abs(sEnd[1] - sStart[1]);

            // Check intersection
            if (!dirtyRect || (
                x < dirtyRect.x + dirtyRect.width &&
                x + w > dirtyRect.x &&
                y < dirtyRect.y + dirtyRect.height &&
                y + h > dirtyRect.y
            )) {
                // Fill
                ctx.fillStyle = 'rgba(0, 100, 255, 0.2)';
                ctx.fillRect(x, y, w, h);

                // Border
                ctx.strokeStyle = 'rgba(0, 100, 255, 0.8)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(x, y, w, h);
                ctx.setLineDash([]);
            }
        }

        // 5. Draw Alignment Lines (Smart Guides)
        if (this.alignmentLines.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#ff00ff'; // Magenta for guides
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            const viewMatrix = renderer.getViewMatrix();
            const width = ctx.canvas.width;
            const height = ctx.canvas.height;

            for (const line of this.alignmentLines) {
                ctx.beginPath();
                if (line.type === 'v') {
                    // Vertical line: constant X in screen space
                    const screenPos = this._tempVec2a;
                    const worldPos = this._tempVec2b;
                    vec2.set(worldPos, line.value, 0);
                    vec2.transformMat3(screenPos, worldPos, viewMatrix);
                    const x = screenPos[0];
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                } else {
                    // Horizontal line: constant Y in screen space
                    const screenPos = this._tempVec2a;
                    const worldPos = this._tempVec2b;
                    vec2.set(worldPos, 0, line.value);
                    vec2.transformMat3(screenPos, worldPos, viewMatrix);
                    const y = screenPos[1];
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        // 6. Draw Guides
        this.drawGuides(ctx, viewMatrix);
    }

    private drawGuides(ctx: CanvasRenderingContext2D, viewMatrix: mat3) {
        if (this.guides.length === 0) return;

        const defaultColor = '#18a0fb';
        const hoverColor = '#6bbdff';
        const selectedColor = '#ff7b00';

        for (const guide of this.guides) {
            let color = defaultColor;
            let lineWidth = 1;

            if (guide === this.selectedGuide) {
                color = selectedColor;
                lineWidth = 2;
            } else if (guide === this.hoveredGuide) {
                color = hoverColor;
                lineWidth = 1;
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;

            if (guide.type === 'v') {
                const sx = guide.value * viewMatrix[0] + viewMatrix[6];
                ctx.beginPath();
                ctx.moveTo(sx + 0.5, 0);
                ctx.lineTo(sx + 0.5, ctx.canvas.height);
                ctx.stroke();
            } else {
                const sy = guide.value * viewMatrix[4] + viewMatrix[7];
                ctx.beginPath();
                ctx.moveTo(0, sy + 0.5);
                ctx.lineTo(ctx.canvas.width, sy + 0.5);
                ctx.stroke();
            }
        }
    }

    private rectIntersects(bounds: { minX: number, minY: number, maxX: number, maxY: number }, dirtyRect?: Rect): boolean {
        if (!dirtyRect) return true;
        return !(bounds.minX > dirtyRect.x + dirtyRect.width ||
            bounds.maxX < dirtyRect.x ||
            bounds.minY > dirtyRect.y + dirtyRect.height ||
            bounds.maxY < dirtyRect.y);
    }

    private getGlobalScale(node: Node, viewMatrix: mat3): number {
        // Approximate global scale including view matrix
        const m = this._tempMat3a;
        mat3.multiply(m, viewMatrix, node.getWorldMatrix());
        return Math.hypot(m[0], m[1]);
    }

    private getScreenBounds(node: Node, viewMatrix: mat3): { minX: number, minY: number, maxX: number, maxY: number } | null {
        // Combined matrix: view * world
        const combined = this._tempMat3a;
        mat3.multiply(combined, viewMatrix, node.getWorldMatrix());

        // Transform 4 corners of the node to screen space
        // Node local corners: (0,0), (w,0), (w,h), (0,h)
        const corners = this._tempCorners;
        vec2.set(corners[0], 0, 0);
        vec2.set(corners[1], node.width, 0);
        vec2.set(corners[2], node.width, node.height);
        vec2.set(corners[3], 0, node.height);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const screen = this._tempVec2b;
        for (const p of corners) {
            vec2.transformMat3(screen, p, combined);
            minX = Math.min(minX, screen[0]);
            minY = Math.min(minY, screen[1]);
            maxX = Math.max(maxX, screen[0]);
            maxY = Math.max(maxY, screen[1]);
        }

        return { minX, minY, maxX, maxY };
    }

    public getHandles(node: Node, viewMatrix: mat3): Handle[] {
        const combined = this._tempMat3a;
        mat3.multiply(combined, viewMatrix, node.getWorldMatrix());

        const w = node.width;
        const h = node.height;

        const handleConfigs: { type: HandleType, lx: number, ly: number }[] = [
            { type: 'nw', lx: 0, ly: 0 },
            { type: 'n', lx: w / 2, ly: 0 },
            { type: 'ne', lx: w, ly: 0 },
            { type: 'e', lx: w, ly: h / 2 },
            { type: 'se', lx: w, ly: h },
            { type: 's', lx: w / 2, ly: h },
            { type: 'sw', lx: 0, ly: h },
            { type: 'w', lx: 0, ly: h / 2 },
            { type: 'r', lx: w / 2, ly: -20 }, // Rotation handle 20px above top-center
            { type: 'rnw', lx: -15, ly: -15 }, // Corner rotation handles
            { type: 'rne', lx: w + 15, ly: -15 },
            { type: 'rse', lx: w + 15, ly: h + 15 },
            { type: 'rsw', lx: -15, ly: h + 15 },
        ];

        const localPos = this._tempVec2b;
        const screenPos = this._tempVec2c;

        return handleConfigs.map(config => {
            vec2.set(localPos, config.lx, config.ly);
            vec2.transformMat3(screenPos, localPos, combined);
            return { type: config.type, x: screenPos[0], y: screenPos[1] };
        });
    }

    private drawHandles(ctx: CanvasRenderingContext2D, node: Node, viewMatrix: mat3, dirtyRect?: Rect) {
        const handles = this.getHandles(node, viewMatrix);
        const size = AuxiliaryLayer.HANDLE_SIZE;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0000ff';
        ctx.lineWidth = 1;

        for (const handle of handles) {
            // Culling
            if (dirtyRect && (
                handle.x + size / 2 < dirtyRect.x ||
                handle.x - size / 2 > dirtyRect.x + dirtyRect.width ||
                handle.y + size / 2 < dirtyRect.y ||
                handle.y - size / 2 > dirtyRect.y + dirtyRect.height
            )) {
                continue;
            }

            if (handle.type === 'r' || handle.type === 'rnw' || handle.type === 'rne' || handle.type === 'rse' || handle.type === 'rsw') {
                // Draw a line from the corresponding anchor point to the rotation handle
                let anchorType: HandleType | null = null;
                if (handle.type === 'r') anchorType = 'n';
                else if (handle.type === 'rnw') anchorType = 'nw';
                else if (handle.type === 'rne') anchorType = 'ne';
                else if (handle.type === 'rse') anchorType = 'se';
                else if (handle.type === 'rsw') anchorType = 'sw';

                if (anchorType) {
                    const anchorHandle = handles.find(h => h.type === anchorType);
                    if (anchorHandle) {
                        ctx.beginPath();
                        ctx.moveTo(anchorHandle.x, anchorHandle.y);
                        ctx.lineTo(handle.x, handle.y);
                        ctx.stroke();
                    }
                }

                // Draw rotation handle as a circle
                ctx.beginPath();
                ctx.arc(handle.x, handle.y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.rect(handle.x - size / 2, handle.y - size / 2, size, size);
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    private drawBounds(ctx: CanvasRenderingContext2D, node: Node, viewMatrix: mat3, color: string, lineWidth: number, dashed: boolean = false, dirtyRect?: Rect) {
        const bounds = this.getScreenBounds(node, viewMatrix);
        if (!bounds) return;

        // Culling
        if (dirtyRect && !this.rectIntersects(bounds, dirtyRect)) {
            return;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        if (dashed) {
            ctx.setLineDash([5, 5]);
        } else {
            ctx.setLineDash([]);
        }

        // Combined matrix: view * world
        const combined = this._tempMat3a;
        mat3.multiply(combined, viewMatrix, node.getWorldMatrix());

        const corners = this._tempCorners;
        vec2.set(corners[0], 0, 0);
        vec2.set(corners[1], node.width, 0);
        vec2.set(corners[2], node.width, node.height);
        vec2.set(corners[3], 0, node.height);

        const screen = this._tempVec2b;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            vec2.transformMat3(screen, corners[i], combined);
            if (i === 0) ctx.moveTo(screen[0], screen[1]);
            else ctx.lineTo(screen[0], screen[1]);
        }
        ctx.closePath();
        ctx.stroke();

        // Reset dash
        ctx.setLineDash([]);
    }
}
