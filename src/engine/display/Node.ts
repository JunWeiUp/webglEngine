import { mat3, vec2 } from 'gl-matrix';
import { Transform } from '../core/Transform';

// import type { IRenderer } from '../core/IRenderer';

export class Node {
    public transform: Transform = new Transform();
    public children: Node[] = [];
    public parent: Node | null = null;
    
    // Bounding box for interaction (local space)
    public width: number = 0;
    public height: number = 0;
    
    // Interactive flags
    public interactive: boolean = false;
    public isHovered: boolean = false;
    public isSelected: boolean = false;

    // Optional tag for debugging
    public name: string = "Node";

    constructor() {
    }

    addChild(child: Node) {
        if (child.parent) {
            child.parent.removeChild(child);
        }
        child.parent = this;
        this.children.push(child);
    }

    removeChild(child: Node) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.parent = null;
        }
    }

    updateTransform(parentWorldMatrix: mat3 | null) {
        this.transform.updateLocalTransform();
        this.transform.updateWorldTransform(parentWorldMatrix);

        for (const child of this.children) {
            child.updateTransform(this.transform.worldMatrix);
        }
    }

    // Hit testing: checks if a world point is inside this node
    hitTest(worldPoint: vec2): boolean {
        // Invert world matrix to get local point
        const invertMatrix = mat3.create();
        mat3.invert(invertMatrix, this.transform.worldMatrix);
        
        const localPoint = vec2.create();
        vec2.transformMat3(localPoint, worldPoint, invertMatrix);

        // Simple AABB check (assuming anchor is 0,0 top-left)
        return localPoint[0] >= 0 && localPoint[0] <= this.width &&
               localPoint[1] >= 0 && localPoint[1] <= this.height;
    }

    // Override to render
    renderWebGL(_renderer: any) {}
    renderCanvas(_renderer: any) {}
}
