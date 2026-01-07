import { Node } from './Node';
import { mat3, vec2 } from 'gl-matrix';
import type { Rect } from '../core/Rect';

export class AuxiliaryLayer {
    public hoveredNode: Node | null = null;

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


    render(ctx: CanvasRenderingContext2D, scene: Node, dirtyRect?: Rect) {
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
                this.drawBounds(ctx, node, '#0000ff', 2, false, dirtyRect);
            }
        }

        // 2. Draw Hover
        if (this.hoveredNode && !this.selectedNodes.has(this.hoveredNode) && this.hoveredNode !== this.draggingNode) {
            this.drawBounds(ctx, this.hoveredNode, '#ffff00', 2, false, dirtyRect);
        }

        // 3. Draw Dragging Logic
        if (this.draggingNode) {
            // Draw Target Highlight (where we will drop)
            if (this.dragTargetNode) {
                this.drawBounds(ctx, this.dragTargetNode, '#00ff00', 3, true, dirtyRect);

                // Optional: Draw text saying "Drop here"
                const bounds = this.getScreenBounds(this.dragTargetNode);
                if (bounds && this.rectIntersects(bounds, dirtyRect)) {
                    ctx.fillStyle = '#00ff00';
                    ctx.font = '12px Arial';
                    ctx.fillText(`Drop into: ${this.dragTargetNode.name}`, bounds.minX, bounds.minY - 5);
                }
            }

            // Draw Selection for Dragging Node (since it moves with mouse now)
            this.drawBounds(ctx, this.draggingNode, '#0000ff', 2, false, dirtyRect);
        }

        // 4. Draw Selection Box
        if (this.selectionRect) {
            const start = this.selectionRect.start;
            const end = this.selectionRect.end;

            const x = Math.min(start[0], end[0]);
            const y = Math.min(start[1], end[1]);
            const w = Math.abs(end[0] - start[0]);
            const h = Math.abs(end[1] - start[1]);

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
    }

    private rectIntersects(bounds: { minX: number, minY: number, maxX: number, maxY: number }, dirtyRect?: Rect): boolean {
        if (!dirtyRect) return true;
        return !(bounds.minX > dirtyRect.x + dirtyRect.width ||
            bounds.maxX < dirtyRect.x ||
            bounds.minY > dirtyRect.y + dirtyRect.height ||
            bounds.maxY < dirtyRect.y);
    }

    private getGlobalScale(node: Node): number {
        // Approximate global scale
        const m = node.transform.worldMatrix;
        return Math.hypot(m[0], m[1]);
    }

    private getScreenBounds(node: Node): { minX: number, minY: number, maxX: number, maxY: number } | null {
        // Transform 4 corners of the node to screen space
        // Node local corners: (0,0), (w,0), (w,h), (0,h)
        const corners = [
            vec2.fromValues(0, 0),
            vec2.fromValues(node.width, 0),
            vec2.fromValues(node.width, node.height),
            vec2.fromValues(0, node.height)
        ];

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const p of corners) {
            const screen = vec2.create();
            vec2.transformMat3(screen, p, node.transform.worldMatrix);
            minX = Math.min(minX, screen[0]);
            minY = Math.min(minY, screen[1]);
            maxX = Math.max(maxX, screen[0]);
            maxY = Math.max(maxY, screen[1]);
        }

        return { minX, minY, maxX, maxY };
    }

    private drawBounds(ctx: CanvasRenderingContext2D, node: Node, color: string, lineWidth: number, dashed: boolean = false, dirtyRect?: Rect) {
        const bounds = this.getScreenBounds(node);
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

        // We draw an AABB in screen space. 
        // Note: If the node is rotated, AABB might be loose. 
        // For precise bounds, we should draw the polygon connected by the 4 transformed corners.
        // Let's draw the polygon for better visual accuracy.

        const corners = [
            vec2.fromValues(0, 0),
            vec2.fromValues(node.width, 0),
            vec2.fromValues(node.width, node.height),
            vec2.fromValues(0, node.height)
        ];

        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const screen = vec2.create();
            vec2.transformMat3(screen, corners[i], node.transform.worldMatrix);
            if (i === 0) ctx.moveTo(screen[0], screen[1]);
            else ctx.lineTo(screen[0], screen[1]);
        }
        ctx.closePath();
        ctx.stroke();

        // Reset dash
        ctx.setLineDash([]);
    }
}
