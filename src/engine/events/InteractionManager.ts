import { Node } from '../display/Node';
import { Renderer } from '../core/Renderer';
import { vec2, mat3 } from 'gl-matrix';
import { AuxiliaryLayer } from '../display/AuxiliaryLayer';

export class InteractionManager {
    private renderer: Renderer;
    private scene: Node;
    private auxLayer: AuxiliaryLayer;
    
    private hoveredNode: Node | null = null;
    // Add callback for tree updates
    public onStructureChange: (() => void) | null = null;
    private draggingNode: Node | null = null;
    
    private isPanning: boolean = false;
    private isBoxSelecting: boolean = false;
    private boxSelectStart: vec2 = vec2.create();
    private lastMousePos: vec2 = vec2.create();

    constructor(renderer: Renderer, scene: Node, auxLayer: AuxiliaryLayer) {
        this.renderer = renderer;
        this.scene = scene;
        this.auxLayer = auxLayer;
        this.initListeners();
    }

    private initListeners() {
        const canvas = this.renderer.ctx.canvas; // Use the top canvas (2D) for events

        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }

    private getMousePos(e: MouseEvent): vec2 {
        const rect = this.renderer.ctx.canvas.getBoundingClientRect();
        return vec2.fromValues(e.clientX - rect.left, e.clientY - rect.top);
    }

    private hitTest(node: Node, point: vec2): Node | null {
        // Reverse order for hit testing (topmost first)
        for (let i = node.children.length - 1; i >= 0; i--) {
            const child = node.children[i];
            const hit = this.hitTest(child, point);
            if (hit) return hit;
        }

        if (node.interactive && node.hitTest(point)) {
            return node;
        }

        return null;
    }

    // Helper to get only top-level selected nodes (to avoid double moving children)
    private getTopLevelSelectedNodes(): Node[] {
        const topLevel: Node[] = [];
        for (const node of this.auxLayer.selectedNodes) {
            // Check if any ancestor is also selected
            let isChildOfSelected = false;
            let current = node.parent;
            while (current) {
                if (this.auxLayer.selectedNodes.has(current)) {
                    isChildOfSelected = true;
                    break;
                }
                current = current.parent;
            }
            
            if (!isChildOfSelected) {
                topLevel.push(node);
            }
        }
        return topLevel;
    }

    private onMouseDown(e: MouseEvent) {
        const pos = this.getMousePos(e);
        this.lastMousePos = pos;

        // Check for Box Selection (Shift + Click/Drag)
        if (e.shiftKey) {
            this.isBoxSelecting = true;
            vec2.copy(this.boxSelectStart, pos);
            this.auxLayer.selectionRect = { start: vec2.clone(pos), end: vec2.clone(pos) };
            
            // Clear selection if not holding Ctrl (optional, usually Shift adds to selection or starts new box)
            // Let's assume Shift starts a new box selection, clearing old one unless we want complex logic.
            // For simplicity: Clear selection on start
            this.auxLayer.selectedNodes.clear();
            return;
        }

        const hit = this.hitTest(this.scene, pos);

        if (hit) {
            // Check if hit node is already selected
            if (this.auxLayer.selectedNodes.has(hit)) {
                // If already selected, don't clear selection, just start dragging
                this.auxLayer.draggingNode = hit; // Main drag handle
                vec2.copy(this.auxLayer.dragProxyPos, pos);
            } else {
                // Single selection (replace)
                this.auxLayer.selectedNode = hit; // Uses the setter to clear and add
                this.auxLayer.draggingNode = hit;
                vec2.copy(this.auxLayer.dragProxyPos, pos);
            }
        } else {
            this.auxLayer.selectedNodes.clear();
            this.isPanning = true;
        }
    }

    private onMouseMove(e: MouseEvent) {
        const pos = this.getMousePos(e);
        const deltaX = pos[0] - this.lastMousePos[0];
        const deltaY = pos[1] - this.lastMousePos[1];
        
        // Box Selection Logic
        if (this.isBoxSelecting && this.auxLayer.selectionRect) {
             vec2.copy(this.auxLayer.selectionRect.end, pos);
             this.lastMousePos = pos;
             return;
        }

        // Hover handling (only if not dragging)
        if (!this.auxLayer.draggingNode && !this.isPanning && !this.isBoxSelecting) {
            const hit = this.hitTest(this.scene, pos);
            this.auxLayer.hoveredNode = hit;
            this.renderer.ctx.canvas.style.cursor = hit ? 'pointer' : 'default';
        }

        if (this.auxLayer.draggingNode) {
            // Real-time Dragging Logic
            // Move ALL selected nodes (top-level only)
            
            const draggingNode = this.auxLayer.draggingNode;
            const topLevelNodes = this.getTopLevelSelectedNodes();
            
            // Apply delta to all top-level nodes
            for (const node of topLevelNodes) {
                const parent = node.parent;
                if (parent) {
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, parent.transform.worldMatrix);

                    const m = invertParent;
                    const localDeltaX = deltaX * m[0] + deltaY * m[3];
                    const localDeltaY = deltaX * m[1] + deltaY * m[4];

                    node.transform.position[0] += localDeltaX;
                    node.transform.position[1] += localDeltaY;
                    node.transform.dirty = true;
                }
            }

            // Check Drop Target (only checking valid containers)
            // Temporarily disable interactive for ALL dragging nodes to see what's behind
            // Optimization: Just disable the main dragging node + others
            
            const originalInteractives = new Map<Node, boolean>();
            for (const node of topLevelNodes) {
                originalInteractives.set(node, node.interactive);
                node.interactive = false;
            }
            
            const hit = this.hitTest(this.scene, pos);
            
            // Restore interactive
            for (const node of topLevelNodes) {
                node.interactive = originalInteractives.get(node) || false;
            }

            // Determine valid target
            let target: Node | null = hit;
            if (!target && draggingNode.parent !== this.scene) {
                target = this.scene;
            }

            // Validation (target must not be descendant of ANY dragged node)
            let isValidTarget = true;
            if (target) {
                for (const node of topLevelNodes) {
                    if (target === node || target === node.parent || this.isDescendant(target, node)) {
                        isValidTarget = false;
                        break;
                    }
                }
            }

            if (target && isValidTarget) {
                this.auxLayer.dragTargetNode = target;
            } else {
                this.auxLayer.dragTargetNode = null;
            }

        } else if (this.isPanning) {
            // Pan the scene
            this.scene.transform.position[0] += deltaX;
            this.scene.transform.position[1] += deltaY;
            this.scene.transform.dirty = true;
        }

        this.lastMousePos = pos;
    }

    // 检查 parent 是否是 child 的后代（防止循环引用）
    private isDescendant(parent: Node, child: Node): boolean {
        let current = parent;
        while (current.parent) {
            if (current.parent === child) return true;
            current = current.parent;
        }
        return false;
    }

    // Recursive box selection
    private boxSelect(node: Node, minX: number, minY: number, maxX: number, maxY: number) {
        if (node.interactive && node !== this.scene) { // Don't select the scene root itself
            // Get Bounds in Screen Space
            const corners = [
                vec2.fromValues(0, 0),
                vec2.fromValues(node.width, 0),
                vec2.fromValues(node.width, node.height),
                vec2.fromValues(0, node.height)
            ];
            
            let nodeMinX = Infinity, nodeMinY = Infinity, nodeMaxX = -Infinity, nodeMaxY = -Infinity;
            
            for (const p of corners) {
                const screen = vec2.create();
                vec2.transformMat3(screen, p, node.transform.worldMatrix);
                nodeMinX = Math.min(nodeMinX, screen[0]);
                nodeMinY = Math.min(nodeMinY, screen[1]);
                nodeMaxX = Math.max(nodeMaxX, screen[0]);
                nodeMaxY = Math.max(nodeMaxY, screen[1]);
            }
            
            // Check AABB intersection
            const overlaps = (minX < nodeMaxX && maxX > nodeMinX &&
                              minY < nodeMaxY && maxY > nodeMinY);
                              
            if (overlaps) {
                this.auxLayer.selectedNodes.add(node);
            }
        }
        
        for (const child of node.children) {
            this.boxSelect(child, minX, minY, maxX, maxY);
        }
    }

    private onMouseUp(e: MouseEvent) {
        if (this.isBoxSelecting && this.auxLayer.selectionRect) {
            // Finalize Box Selection
            const start = this.auxLayer.selectionRect.start;
            const end = this.auxLayer.selectionRect.end;
            
            const minX = Math.min(start[0], end[0]);
            const minY = Math.min(start[1], end[1]);
            const maxX = Math.max(start[0], end[0]);
            const maxY = Math.max(start[1], end[1]);
            
            // Perform selection test on scene
            this.boxSelect(this.scene, minX, minY, maxX, maxY);
            
            // Reset
            this.isBoxSelecting = false;
            this.auxLayer.selectionRect = null;
            return;
        }

        if (this.auxLayer.draggingNode) {
            // Apply Drag (Reparenting only)
            const target = this.auxLayer.dragTargetNode;
            
            if (target) {
                 // Reparent ALL selected nodes (top-level only)
                 const topLevelNodes = this.getTopLevelSelectedNodes();
                 
                 for (const draggingNode of topLevelNodes) {
                     // 1. Calculate current World Position
                     const worldPos = vec2.create();
                     const wm = draggingNode.transform.worldMatrix;
                     vec2.set(worldPos, wm[6], wm[7]); // Translation component
                     
                     // 2. Reparent
                     target.addChild(draggingNode);
                     
                     // 3. Recalculate Local Position to maintain World Position
                     // NewLocal = NewParentWorldInverse * WorldPos
                     const invertParent = mat3.create();
                     mat3.invert(invertParent, target.transform.worldMatrix);
                     
                     const newLocal = vec2.create();
                     vec2.transformMat3(newLocal, worldPos, invertParent);
                     
                     draggingNode.transform.position = newLocal;
                     draggingNode.transform.dirty = true;
                     
                     console.log(`Reparented ${draggingNode.name} to ${target.name}`);
                 }
                 
                 // Trigger structure update
                 if (this.onStructureChange) {
                     this.onStructureChange();
                 }
            }
            
            // Reset
            this.auxLayer.draggingNode = null;
            this.auxLayer.dragTargetNode = null;
        }
        
        this.isPanning = false;
    }

    private onWheel(e: WheelEvent) {
        e.preventDefault();
        
        const zoomSpeed = 0.001;
        const scaleChange = 1 - e.deltaY * zoomSpeed;
        
        // Zoom towards mouse position
        // 1. Get mouse pos in World Space (relative to Scene, before zoom)
        const pos = this.getMousePos(e);
        
        // Scene Local Point (if Scene is at 0,0)
        // We want the point under mouse to stay under mouse.
        // P_screen = P_local * Scale + Trans
        // P_screen = (P_local * Scale * Delta) + NewTrans
        
        // Simple implementation: Scale around Scene origin
        // this.scene.transform.scale[0] *= scaleChange;
        // this.scene.transform.scale[1] *= scaleChange;
        
        // Better: Zoom towards pointer
        // NewScale = OldScale * Delta
        // NewTrans = Mouse - (Mouse - OldTrans) * Delta
        
        const oldScale = this.scene.transform.scale[0];
        const newScale = oldScale * scaleChange;
        
        // Limit zoom
        if (newScale < 0.1 || newScale > 10) return;
        
        const mouseX = pos[0];
        const mouseY = pos[1];
        const transX = this.scene.transform.position[0];
        const transY = this.scene.transform.position[1];
        
        const newTransX = mouseX - (mouseX - transX) * scaleChange;
        const newTransY = mouseY - (mouseY - transY) * scaleChange;
        
        this.scene.transform.scale[0] = newScale;
        this.scene.transform.scale[1] = newScale;
        this.scene.transform.position[0] = newTransX;
        this.scene.transform.position[1] = newTransY;
        this.scene.transform.dirty = true;
    }
}
