import { Node } from '../display/Node';
import { AuxiliaryLayer } from '../display/AuxiliaryLayer';

interface OutlineItem {
    node: Node;
    depth: number;
    hasChildren: boolean;
    isExpanded: boolean;
}

import { Renderer } from '../core/Renderer';
import { vec2 } from 'gl-matrix';

export class OutlineView {
    private container: HTMLElement;
    private scrollContainer: HTMLElement; // 滚动区域
    private contentSizer: HTMLElement;    // 撑开高度
    private itemContainer: HTMLElement;   // 放置可见 Item

    private rootNode: Node;
    private auxLayer: AuxiliaryLayer;
    private renderer: Renderer;
    
    // Flattened list of visible nodes (not collapsed by parent)
    private flattenList: OutlineItem[] = [];
    
    // Set of nodes that are expanded
    private expandedNodes: Set<Node> = new Set();
    
    private itemHeight: number = 24; // px
    private visibleCount: number = 0;
    
    // Cache map for updating highlight without full re-render
    // Key: Node, Value: DOM Element currently rendered
    private renderedNodeMap: Map<Node, HTMLElement> = new Map();

    constructor(rootNode: Node, auxLayer: AuxiliaryLayer, renderer: Renderer) {
        this.rootNode = rootNode;
        this.auxLayer = auxLayer;
        this.renderer = renderer;
        
        // Default expand root
        this.expandedNodes.add(rootNode);
        
        // --- DOM Structure ---
        // container (absolute, fixed size)
        //   -> title
        //   -> scrollContainer (overflow-y: auto, relative)
        //      -> contentSizer (height = total * itemHeight)
        //      -> itemContainer (absolute, top: 0, transform: translateY)
        
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '250px';
        this.container.style.height = '100vh';
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.container.style.color = 'white';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.zIndex = '1000';
        this.container.style.fontFamily = 'monospace';
        this.container.style.fontSize = '12px';
        this.container.style.userSelect = 'none';

        const title = document.createElement('div');
        title.innerText = "大纲树 (Virtual Scroll)";
        title.style.fontWeight = 'bold';
        title.style.padding = '10px';
        title.style.borderBottom = '1px solid #444';
        title.style.flexShrink = '0';
        this.container.appendChild(title);

        this.scrollContainer = document.createElement('div');
        this.scrollContainer.style.flex = '1';
        this.scrollContainer.style.overflowY = 'auto';
        this.scrollContainer.style.position = 'relative';
        this.container.appendChild(this.scrollContainer);

        this.contentSizer = document.createElement('div');
        this.contentSizer.style.width = '100%';
        this.contentSizer.style.height = '0px';
        this.scrollContainer.appendChild(this.contentSizer);

        this.itemContainer = document.createElement('div');
        this.itemContainer.style.position = 'absolute';
        this.itemContainer.style.top = '0';
        this.itemContainer.style.left = '0';
        this.itemContainer.style.width = '100%';
        this.scrollContainer.appendChild(this.itemContainer);

        document.body.appendChild(this.container);

        // --- Events ---
        this.scrollContainer.addEventListener('scroll', () => {
            this.renderVisibleItems();
        });
        
        // Initial build
        this.start();
    }

    public start() {
        this.rebuildList();
    }

    // Called when structure changes (add/remove child)
    public update() {
        this.rebuildList();
    }

    // Called when selection/hover changes (only update styles)
    public updateHighlight() {
        // Iterate over currently rendered DOM elements
        for (const [node, el] of this.renderedNodeMap) {
            this.applyNodeStyle(node, el);
        }
    }

    // --- Core Logic ---

    // 1. Flatten the tree based on expanded state
    private rebuildList() {
        this.flattenList = [];
        this.traverse(this.rootNode, 0);
        
        // Update scroller height
        const totalHeight = this.flattenList.length * this.itemHeight;
        this.contentSizer.style.height = `${totalHeight}px`;
        
        this.renderVisibleItems();
    }

    private traverse(node: Node, depth: number) {
        const hasChildren = node.children.length > 0;
        const isExpanded = this.expandedNodes.has(node);
        
        this.flattenList.push({
            node,
            depth,
            hasChildren,
            isExpanded
        });

        if (hasChildren && isExpanded) {
            for (const child of node.children) {
                this.traverse(child, depth + 1);
            }
        }
    }

    // 2. Render only items in viewport
    private renderVisibleItems() {
        const scrollTop = this.scrollContainer.scrollTop;
        const viewportHeight = this.scrollContainer.clientHeight;
        
        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const endIndex = Math.min(
            this.flattenList.length, 
            Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + 1 // buffer
        );

        // Update item container position
        this.itemContainer.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
        
        // Clear current
        this.itemContainer.innerHTML = '';
        this.renderedNodeMap.clear();

        // Render subset
        for (let i = startIndex; i < endIndex; i++) {
            const itemData = this.flattenList[i];
            if (!itemData) continue;
            
            const el = this.createItemDOM(itemData);
            this.itemContainer.appendChild(el);
            this.renderedNodeMap.set(itemData.node, el);
        }
        
        this.updateHighlight();
    }

    private createItemDOM(item: OutlineItem): HTMLElement {
        const div = document.createElement('div');
        div.style.height = `${this.itemHeight}px`;
        div.style.lineHeight = `${this.itemHeight}px`;
        div.style.paddingLeft = `${item.depth * 15 + 5}px`;
        div.style.cursor = 'pointer';
        div.style.whiteSpace = 'nowrap';
        div.style.overflow = 'hidden';
        div.style.textOverflow = 'ellipsis';
        div.style.display = 'flex';
        div.style.alignItems = 'center';

        // Toggle Icon
        const toggleSpan = document.createElement('span');
        toggleSpan.style.display = 'inline-block';
        toggleSpan.style.width = '12px';
        toggleSpan.style.textAlign = 'center';
        toggleSpan.style.marginRight = '4px';
        toggleSpan.style.cursor = 'pointer';
        
        if (item.hasChildren) {
            toggleSpan.innerText = item.isExpanded ? '▼' : '▶';
            toggleSpan.onclick = (e) => {
                e.stopPropagation();
                this.toggleExpand(item.node);
            };
        } else {
            toggleSpan.innerText = '•';
            toggleSpan.style.color = '#666';
        }
        div.appendChild(toggleSpan);

        // Node Name
        const nameSpan = document.createElement('span');
        const typeName = item.node.constructor.name;
        const name = item.node.name || "Unnamed";
        nameSpan.innerText = `[${typeName}] ${name}`;
        div.appendChild(nameSpan);

        // Selection Click
        div.onclick = (e) => {
            e.stopPropagation();
            this.auxLayer.selectedNode = item.node;
            this.rootNode.invalidate();
            this.updateHighlight();
            this.focusNode(item.node);
        };

        // Hover
        div.onmouseover = () => {
            this.auxLayer.hoveredNode = item.node;
            this.rootNode.invalidate();
            this.updateHighlight();
        };
        div.onmouseout = () => {
            if (this.auxLayer.hoveredNode === item.node) {
                this.auxLayer.hoveredNode = null;
                this.rootNode.invalidate();
                this.updateHighlight();
            }
        };

        return div;
    }

    private applyNodeStyle(node: Node, el: HTMLElement) {
        const isSelected = this.auxLayer.selectedNodes.has(node);
        const isHovered = this.auxLayer.hoveredNode === node;

        if (isSelected) {
            el.style.backgroundColor = '#0055aa';
            el.style.color = '#ffffff';
        } else if (isHovered) {
            el.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            el.style.color = '#ffffff';
        } else {
            el.style.backgroundColor = 'transparent';
            el.style.color = '#cccccc';
        }
    }

    private toggleExpand(node: Node) {
        if (this.expandedNodes.has(node)) {
            this.expandedNodes.delete(node);
        } else {
            this.expandedNodes.add(node);
        }
        this.rebuildList();
    }

    /**
     * 如果节点不在视图区域内，平移画布使其居中
     */
    private focusNode(node: Node) {
        // 1. 获取 Canvas 尺寸 (视图大小)
        const canvas = this.renderer.ctx.canvas;
        const viewportWidth = canvas.width;
        const viewportHeight = canvas.height;

        // 2. 计算节点在屏幕空间的包围盒
        // 使用节点的四个角转换到屏幕空间
        const corners = [
            vec2.fromValues(0, 0),
            vec2.fromValues(node.width, 0),
            vec2.fromValues(node.width, node.height),
            vec2.fromValues(0, node.height)
        ];

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const p of corners) {
            const screenP = vec2.create();
            vec2.transformMat3(screenP, p, node.transform.worldMatrix);
            
            minX = Math.min(minX, screenP[0]);
            minY = Math.min(minY, screenP[1]);
            maxX = Math.max(maxX, screenP[0]);
            maxY = Math.max(maxY, screenP[1]);
        }

        // 3. 检查是否完全在视图内
        // 留一点边距 (padding)
        const padding = 20;
        const isInside = (minX >= padding) && (maxX <= viewportWidth - padding) &&
                         (minY >= padding) && (maxY <= viewportHeight - padding);

        if (!isInside) {
            // 4. 计算需要移动的偏移量
            const nodeCenterX = (minX + maxX) / 2;
            const nodeCenterY = (minY + maxY) / 2;

            const viewportCenterX = viewportWidth / 2;
            const viewportCenterY = viewportHeight / 2;

            const dx = viewportCenterX - nodeCenterX;
            const dy = viewportCenterY - nodeCenterY;

            // 5. 应用平移到根节点 (Scene)
            // 注意：Scene 是根节点，直接修改 position 即可平移整个世界
            // 累加位移
            this.rootNode.transform.position[0] += dx;
            this.rootNode.transform.position[1] += dy;
            this.rootNode.transform.dirty = true;
            this.rootNode.invalidate();
        }
    }
}
