import { Node } from './Node';
import { mat3, vec2 } from 'gl-matrix';

export class AuxiliaryLayer {
    public hoveredNode: Node | null = null;
    public selectedNode: Node | null = null;
    
    // Dragging state
    public draggingNode: Node | null = null;
    public dragTargetNode: Node | null = null; // The container we are hovering over while dragging
    public dragProxyPos: vec2 = vec2.create(); // Screen position of the drag proxy

    constructor() {}

    render(ctx: CanvasRenderingContext2D, scene: Node) {
        // Reset transform to identity to draw in screen space
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 1. Draw Selection
        if (this.selectedNode && this.selectedNode !== this.draggingNode) {
            this.drawBounds(ctx, this.selectedNode, '#0000ff', 2);
        }

        // 2. Draw Hover
        if (this.hoveredNode && this.hoveredNode !== this.selectedNode && this.hoveredNode !== this.draggingNode) {
            this.drawBounds(ctx, this.hoveredNode, '#ffff00', 2);
        }

        // 3. Draw Dragging Logic
        if (this.draggingNode) {
            // Draw Target Highlight (where we will drop)
            if (this.dragTargetNode) {
                this.drawBounds(ctx, this.dragTargetNode, '#00ff00', 3, true);
                
                // Optional: Draw text saying "Drop here"
                const bounds = this.getScreenBounds(this.dragTargetNode);
                if (bounds) {
                    ctx.fillStyle = '#00ff00';
                    ctx.font = '12px Arial';
                    ctx.fillText(`Drop into: ${this.dragTargetNode.name}`, bounds.minX, bounds.minY - 5);
                }
            }

            // Draw Selection for Dragging Node (since it moves with mouse now)
            this.drawBounds(ctx, this.draggingNode, '#0000ff', 2);
        }
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

    private drawBounds(ctx: CanvasRenderingContext2D, node: Node, color: string, lineWidth: number, dashed: boolean = false) {
        const bounds = this.getScreenBounds(node);
        if (!bounds) return;

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
