import { Node } from '../display/Node';
import { AuxiliaryLayer } from '../display/AuxiliaryLayer';

export class OutlineView {
    private container: HTMLElement;
    private rootNode: Node;
    private auxLayer: AuxiliaryLayer;
    private updateInterval: number | null = null;
    private lastVersion: number = -1; // Simple version tracking
    
    // Map node to its DOM element for efficient updates
    private nodeMap: Map<Node, HTMLElement> = new Map();

    constructor(rootNode: Node, auxLayer: AuxiliaryLayer) {
        this.rootNode = rootNode;
        this.auxLayer = auxLayer;
        
        // Create UI Container
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '250px';
        this.container.style.height = '100vh';
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.container.style.color = 'white';
        this.container.style.overflowY = 'auto';
        this.container.style.padding = '10px';
        this.container.style.boxSizing = 'border-box';
        this.container.style.fontFamily = 'monospace';
        this.container.style.fontSize = '12px';
        this.container.style.pointerEvents = 'auto'; // Enable clicking on the tree
        this.container.style.zIndex = '1000';
        
        const title = document.createElement('div');
        title.innerText = "大纲树 (Scene Outline)";
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '10px';
        this.container.appendChild(title);

        const treeRoot = document.createElement('div');
        treeRoot.id = 'outline-tree-root';
        this.container.appendChild(treeRoot);

        document.body.appendChild(this.container);

        // Auto update every 500ms to reflect changes
        // Better approach: Observer pattern, but polling is easier for now
        this.start();
    }

    public start() {
        this.update();
        // Polling for structure changes
        // A better way would be to hook into Node.addChild/removeChild
        this.updateInterval = window.setInterval(() => {
            this.update();
        }, 500);
    }

    public update() {
        const treeRoot = this.container.querySelector('#outline-tree-root')!;
        treeRoot.innerHTML = '';
        this.nodeMap.clear();
        this.renderNode(this.rootNode, treeRoot, 0);
        this.updateHighlight();
    }

    public updateHighlight() {
        // Efficiently update styles without rebuilding DOM
        for (const [node, item] of this.nodeMap) {
            const isSelected = this.auxLayer.selectedNodes.has(node);
            const isHovered = this.auxLayer.hoveredNode === node;

            if (isSelected) {
                item.style.backgroundColor = '#0055aa'; // Selected: Blue
                item.style.color = '#ffffff';
            } else if (isHovered) {
                item.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'; // Hover: Light Translucent
                item.style.color = '#ffffff';
            } else {
                item.style.backgroundColor = 'transparent';
                item.style.color = '#cccccc';
            }
        }
    }

    private renderNode(node: Node, parentElement: HTMLElement, depth: number) {
        const item = document.createElement('div');
        item.style.paddingLeft = `${depth * 15}px`;
        item.style.cursor = 'pointer';
        item.style.paddingTop = '2px';
        item.style.paddingBottom = '2px';
        
        this.nodeMap.set(node, item);

        // Click Handler: Selection
        item.onclick = (e) => {
            e.stopPropagation();
            
            // For now, simple single selection or replacement
            // Ideally handle Shift/Ctrl for multi-select
            this.auxLayer.selectedNode = node;
            
            this.rootNode.invalidate(); // Redraw canvas
            this.updateHighlight(); // Update tree UI
        };
        
        // Hover Handlers
        item.onmouseover = (e) => {
            e.stopPropagation();
            this.auxLayer.hoveredNode = node;
            this.rootNode.invalidate();
            this.updateHighlight();
        };

        item.onmouseout = (e) => {
            e.stopPropagation();
            if (this.auxLayer.hoveredNode === node) {
                this.auxLayer.hoveredNode = null;
                this.rootNode.invalidate();
                this.updateHighlight();
            }
        };

        const typeName = node.constructor.name;
        const name = node.name || "Unnamed";
        
        item.innerText = `${depth === 0 ? 'root' : '└'} [${typeName}] ${name}`;
        
        parentElement.appendChild(item);

        for (const child of node.children) {
            this.renderNode(child, parentElement, depth + 1);
        }
    }
}
