import { Node } from '../display/Node';
import type { Rect } from '../core/Rect';
export type { Rect };

export class QuadTree {
    private bounds: Rect;
    private capacity: number;
    private maxDepth: number;
    private depth: number;
    private objects: Node[] = [];
    private nodes: QuadTree[] = [];

    private useLocalBounds: boolean = false;

    constructor(bounds: Rect, capacity: number = 10, maxDepth: number = 5, depth: number = 0, useLocalBounds: boolean = false) {
        this.bounds = bounds;
        this.capacity = capacity;
        this.maxDepth = maxDepth;
        this.depth = depth;
        this.useLocalBounds = useLocalBounds;
    }

    /**
     * Clear the quadtree
     */
    public clear() {
        this.objects = [];
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                this.nodes[i].clear();
            }
        }
        this.nodes = [];
    }

    /**
     * Split the node into 4 subnodes
     */
    private split() {
        const subWidth = this.bounds.width / 2;
        const subHeight = this.bounds.height / 2;
        const x = this.bounds.x;
        const y = this.bounds.y;

        this.nodes[0] = new QuadTree({ x: x + subWidth, y: y, width: subWidth, height: subHeight }, this.capacity, this.maxDepth, this.depth + 1, this.useLocalBounds); // TR
        this.nodes[1] = new QuadTree({ x: x, y: y, width: subWidth, height: subHeight }, this.capacity, this.maxDepth, this.depth + 1, this.useLocalBounds); // TL
        this.nodes[2] = new QuadTree({ x: x, y: y + subHeight, width: subWidth, height: subHeight }, this.capacity, this.maxDepth, this.depth + 1, this.useLocalBounds); // BL
        this.nodes[3] = new QuadTree({ x: x + subWidth, y: y + subHeight, width: subWidth, height: subHeight }, this.capacity, this.maxDepth, this.depth + 1, this.useLocalBounds); // BR
    }

    /**
     * Determine which quadrant the object belongs to
     * @returns -1 if object cannot completely fit within a child node and is part of the parent node
     */
    private getIndex(node: Node): number {
        let index = -1;
        let minX, minY, maxX, maxY;

        if (this.useLocalBounds) {
            // Use Local Bounds (x, y, width, height) - ignoring rotation for simplicity in StaticLayer
            // StaticLayer assumes children are relatively static and simple
            minX = node.x;
            minY = node.y;
            maxX = node.x + node.width;
            maxY = node.y + node.height;
        } else {
            // Use cached World AABB if available
            if (node.worldAABB) {
                minX = node.worldAABB.x;
                minY = node.worldAABB.y;
                maxX = minX + node.worldAABB.width;
                maxY = minY + node.worldAABB.height;
            } else {
                // Fallback: Calculate World AABB
                const m = node.transform.worldMatrix;
                const w = node.width;
                const h = node.height;
                
                minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
                const corners = [0, 0, w, 0, w, h, 0, h];
                for(let i=0; i<4; i++) {
                    const lx = corners[i*2];
                    const ly = corners[i*2+1];
                    const wx = lx * m[0] + ly * m[3] + m[6];
                    const wy = lx * m[1] + ly * m[4] + m[7];
                    if(wx < minX) minX = wx;
                    if(wx > maxX) maxX = wx;
                    if(wy < minY) minY = wy;
                    if(wy > maxY) maxY = wy;
                }
            }
        }

        const verticalMidpoint = this.bounds.x + (this.bounds.width / 2);
        const horizontalMidpoint = this.bounds.y + (this.bounds.height / 2);

        const topQuadrant = (minY < horizontalMidpoint && maxY < horizontalMidpoint);
        const bottomQuadrant = (minY > horizontalMidpoint);

        if (minX < verticalMidpoint && maxX < verticalMidpoint) {
            if (topQuadrant) {
                index = 1; // TL
            } else if (bottomQuadrant) {
                index = 2; // BL
            }
        } else if (minX > verticalMidpoint) {
            if (topQuadrant) {
                index = 0; // TR
            } else if (bottomQuadrant) {
                index = 3; // BR
            }
        }

        return index;
    }

    /**
     * Insert the object into the quadtree
     */
    public insert(node: Node) {
        // If we have subnodes...
        if (this.nodes.length > 0) {
            const index = this.getIndex(node);

            if (index !== -1) {
                this.nodes[index].insert(node);
                return;
            }
        }

        this.objects.push(node);

        if (this.objects.length > this.capacity && this.depth < this.maxDepth) {
            if (this.nodes.length === 0) {
                this.split();
            }

            let i = 0;
            while (i < this.objects.length) {
                const index = this.getIndex(this.objects[i]);
                if (index !== -1) {
                    const removedObject = this.objects.splice(i, 1)[0];
                    this.nodes[index].insert(removedObject);
                } else {
                    i++;
                }
            }
        }
    }

    /**
     * Return all objects that could collide with the given bounds
     */
    public retrieve(returnObjects: Node[], rect: Rect): Node[] {
        const index = this.getIndexRect(rect);
        if (index !== -1 && this.nodes.length > 0) {
            this.nodes[index].retrieve(returnObjects, rect);
        } else {
            // If rect overlaps multiple quadrants or we are leaf, retrieve from all relevant nodes?
            // Actually standard QuadTree retrieve usually adds objects from THIS node
            // AND recurses if possible.
            // If index is -1, it means the rect spans the split line, so we must check ALL subnodes.
            if (this.nodes.length > 0) {
                 // Optimization: Check intersection with each quadrant
                 for(let i=0; i<4; i++) {
                     if (this.rectIntersects(rect, this.nodes[i].bounds)) {
                         this.nodes[i].retrieve(returnObjects, rect);
                     }
                 }
            }
        }

        // Add objects from this node
        for (const obj of this.objects) {
            returnObjects.push(obj);
        }

        return returnObjects;
    }
    
    private rectIntersects(r1: Rect, r2: Rect): boolean {
        return !(r2.x > r1.x + r1.width || 
                 r2.x + r2.width < r1.x || 
                 r2.y > r1.y + r1.height || 
                 r2.y + r2.height < r1.y);
    }

    private getIndexRect(rect: Rect): number {
        let index = -1;
        const verticalMidpoint = this.bounds.x + (this.bounds.width / 2);
        const horizontalMidpoint = this.bounds.y + (this.bounds.height / 2);

        const topQuadrant = (rect.y < horizontalMidpoint && rect.y + rect.height < horizontalMidpoint);
        const bottomQuadrant = (rect.y > horizontalMidpoint);

        if (rect.x < verticalMidpoint && rect.x + rect.width < verticalMidpoint) {
            if (topQuadrant) {
                index = 1;
            } else if (bottomQuadrant) {
                index = 2;
            }
        } else if (rect.x > verticalMidpoint) {
            if (topQuadrant) {
                index = 0;
            } else if (bottomQuadrant) {
                index = 3;
            }
        }

        return index;
    }
}
