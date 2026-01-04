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

    private onMouseDown(e: MouseEvent) {
        const pos = this.getMousePos(e);
        this.lastMousePos = pos;

        const hit = this.hitTest(this.scene, pos);

        if (hit) {
            this.auxLayer.selectedNode = hit;
            this.auxLayer.draggingNode = hit;
            vec2.copy(this.auxLayer.dragProxyPos, pos);
        } else {
            this.auxLayer.selectedNode = null;
            this.isPanning = true;
        }
    }

    private onMouseMove(e: MouseEvent) {
        const pos = this.getMousePos(e);
        const deltaX = pos[0] - this.lastMousePos[0];
        const deltaY = pos[1] - this.lastMousePos[1];
        
        // Hover handling (only if not dragging)
        if (!this.auxLayer.draggingNode && !this.isPanning) {
            const hit = this.hitTest(this.scene, pos);
            this.auxLayer.hoveredNode = hit;
            this.renderer.ctx.canvas.style.cursor = hit ? 'pointer' : 'default';
        }

        if (this.auxLayer.draggingNode) {
            // Real-time Dragging Logic
            // Move the node immediately
            
            const draggingNode = this.auxLayer.draggingNode;
            const parent = draggingNode.parent;
            
            if (parent) {
                // Calculate movement in Parent's Local Space
                // LocalDelta = ParentWorldInverseVector * ScreenDelta
                
                const invertParent = mat3.create();
                mat3.invert(invertParent, parent.transform.worldMatrix);

                const m = invertParent;
                const localDeltaX = deltaX * m[0] + deltaY * m[3];
                const localDeltaY = deltaX * m[1] + deltaY * m[4];

                draggingNode.transform.position[0] += localDeltaX;
                draggingNode.transform.position[1] += localDeltaY;
                draggingNode.transform.dirty = true;
            }

            // Check Drop Target (only checking valid containers)
            // Temporarily disable interactive for dragging node to see what's behind
            const originalInteractive = draggingNode.interactive;
            draggingNode.interactive = false;
            
            const hit = this.hitTest(this.scene, pos);
            
            draggingNode.interactive = originalInteractive;

            // Determine valid target
            let target: Node | null = hit;
            if (!target && draggingNode.parent !== this.scene) {
                target = this.scene;
            }

            // Validation (not self, not parent, not descendant)
            if (target && target !== draggingNode && target !== draggingNode.parent && !this.isDescendant(target, draggingNode)) {
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

    private onMouseUp(e: MouseEvent) {
        if (this.auxLayer.draggingNode) {
            // Apply Drag (Reparenting only)
            const target = this.auxLayer.dragTargetNode;
            
            if (target) {
                 // Reparent Logic
                 const draggingNode = this.auxLayer.draggingNode;
                 
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
