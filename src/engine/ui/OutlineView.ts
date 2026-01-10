import { Node } from '../display/Node';
import { AuxiliaryLayer } from '../display/AuxiliaryLayer';

interface OutlineItem {
    node: Node;
    depth: number;
    hasChildren: boolean;
    isExpanded: boolean;
}

import { Renderer } from '../core/Renderer';
import { InteractionManager } from '../events/InteractionManager';

export class OutlineView {
    private container: HTMLElement;
    private scrollContainer: HTMLElement; // 滚动区域
    private contentSizer: HTMLElement;    // 撑开高度
    private itemContainer: HTMLElement;   // 放置可见 Item

    private rootNode: Node;
    private auxLayer: AuxiliaryLayer;
    private interaction: InteractionManager;
    
    // Flattened list of visible nodes (not collapsed by parent)
    private flattenList: OutlineItem[] = [];
    
    // Set of nodes that are expanded
    private expandedNodes: Set<Node> = new Set();
    
    private itemHeight: number = 24; // px
    
    // Cache map for updating highlight without full re-render
    // Key: Node, Value: DOM Element currently rendered
    private renderedNodeMap: Map<Node, HTMLElement> = new Map();

    constructor(rootNode: Node, auxLayer: AuxiliaryLayer, renderer: Renderer, interaction: InteractionManager) {
        this.rootNode = rootNode;
        this.auxLayer = auxLayer;
        this.interaction = interaction;
        
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
        this.container.style.backgroundColor = 'var(--figma-bg-panel)';
        this.container.style.borderRight = '1px solid var(--figma-border)';
        this.container.style.color = 'var(--figma-text-primary)';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.zIndex = '1000';
        this.container.style.fontFamily = 'inherit';
        this.container.style.fontSize = '11px';
        this.container.style.userSelect = 'none';

        const title = document.createElement('div');
        title.innerText = "LAYERS";
        title.style.fontSize = '11px';
        title.style.fontWeight = '600';
        title.style.padding = '12px 16px 8px 16px';
        title.style.color = 'var(--figma-text-tertiary)';
        title.style.flexShrink = '0';
        title.style.letterSpacing = '0.02em';
        title.style.userSelect = 'none';
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

        // 自动滚动到选中的节点
        const selectedNode = this.auxLayer.selectedNode;
        if (selectedNode) {
            this.scrollToNode(selectedNode);
        }
    }

    // --- Core Logic ---
    
    // 优化：DOM 元素复用池
    private itemPool: HTMLElement[] = [];
    
    private getPooledItem(): HTMLElement {
        if (this.itemPool.length > 0) {
            return this.itemPool.pop()!;
        }
        return document.createElement('div');
    }
    
    private recycleItem(el: HTMLElement) {
        this.itemPool.push(el);
    }

    // 1. Flatten the tree based on expanded state
    private rebuildList() {
        this.flattenList = [];
        // 限制初始遍历深度或数量？不，这里必须遍历所有展开的。
        // 对于 40,000 个节点，traverse 耗时约 5-10ms，尚可接受。
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
    // 增加 requestAnimationFrame 防抖，避免 scroll 事件触发过于频繁
    private pendingRender = false;
    
    private renderVisibleItems() {
        if (this.pendingRender) return;
        this.pendingRender = true;
        
        requestAnimationFrame(() => {
            // console.log("outlineview requestAnimationFrame")
            this.pendingRender = false;
            this.doRenderVisibleItems();
        });
    }

    private doRenderVisibleItems() {
        const scrollTop = this.scrollContainer.scrollTop;
        const viewportHeight = this.scrollContainer.clientHeight;
        
        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const endIndex = Math.min(
            this.flattenList.length, 
            Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + 1 
        );

        // Update item container position
        this.itemContainer.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
        
        // Recycle existing items
        // 简单策略：清空 container，将所有子元素放回池中
        // 优化策略：Diff 比较？对于虚拟滚动，通常全量替换+复用更简单高效
        
        while (this.itemContainer.firstChild) {
            const child = this.itemContainer.firstChild as HTMLElement;
            // 清理事件监听器？由于我们每次都重新创建/绑定 onclick，
            // 只要没有外部引用，GC 会处理。但在复用时需要小心。
            // 简单的复用：只复用 div 容器，内容重填
            this.itemContainer.removeChild(child);
            this.recycleItem(child);
        }
        
        this.renderedNodeMap.clear();

        // Render subset
        for (let i = startIndex; i < endIndex; i++) {
            const itemData = this.flattenList[i];
            if (!itemData) continue;
            
            const el = this.createItemDOM(itemData); // 这里会从池中取
            this.itemContainer.appendChild(el);
            this.renderedNodeMap.set(itemData.node, el);
        }
        
        this.updateHighlight();
    }

    private toggleExpand(node: Node) {
        if (this.expandedNodes.has(node)) {
            this.expandedNodes.delete(node);
        } else {
            this.expandedNodes.add(node);
        }
        this.rebuildList();
    }

    private createItemDOM(item: OutlineItem): HTMLElement {
        const div = this.getPooledItem();
        // 重置样式和内容
        div.innerHTML = ''; // 清空旧内容
        div.onclick = null;
        div.onmouseenter = null;
        div.onmouseleave = null;
        
        div.style.height = `${this.itemHeight}px`;
        div.style.lineHeight = `${this.itemHeight}px`;
        div.style.paddingLeft = `${item.depth * 16 + 8}px`;
        div.style.paddingRight = '8px';
        div.style.cursor = 'default';
        div.style.whiteSpace = 'nowrap';
        div.style.overflow = 'hidden';
        div.style.textOverflow = 'ellipsis';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.color = 'var(--figma-text-secondary)';
        div.style.backgroundColor = 'transparent';
        div.style.fontSize = '11px';
        div.style.transition = 'background-color 0.1s, color 0.1s';

        // Toggle Icon (SVG)
        const toggleBtn = document.createElement('div');
        Object.assign(toggleBtn.style, {
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '4px',
            borderRadius: '2px',
            color: 'var(--figma-text-tertiary)',
            transition: 'color 0.15s',
            cursor: 'pointer'
        });
        
        if (item.hasChildren) {
            toggleBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform: ${item.isExpanded ? 'rotate(90deg)' : 'none'}; transition: transform 0.1s ease;">
                <path d="M2.5 1.5L5.5 4L2.5 6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleExpand(item.node);
            };
            toggleBtn.onmouseenter = () => toggleBtn.style.color = 'var(--figma-text-primary)';
            toggleBtn.onmouseleave = () => toggleBtn.style.color = 'var(--figma-text-tertiary)';
        }
        div.appendChild(toggleBtn);

        // Type Icon
        const typeIcon = document.createElement('div');
        Object.assign(typeIcon.style, {
            width: '16px',
            height: '16px',
            marginRight: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-tertiary)',
            flexShrink: '0'
        });
        
        const typeName = item.node.constructor.name;
        if (typeName === 'Sprite') {
            typeIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 8.5l2.5-2.5 2.5 2.5M6.5 7.5l2-2 2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="4" r="1" fill="currentColor"/></svg>`;
        } else if (typeName === 'Text') {
            typeIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 3.5V2.5h7v1M6 2.5V9.5M4.5 9.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
        } else if (typeName === 'Container') {
            // Figma Frame Icon (Hash-like)
            typeIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 1.5v9M8 1.5v9M1.5 4h9M1.5 8h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
        } else {
            typeIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="8" height="8" rx="0.5" stroke="currentColor" stroke-width="1.2"/></svg>`;
        }
        div.appendChild(typeIcon);

        // Node Name
        const nameSpan = document.createElement('span');
        nameSpan.innerText = item.node.name || (typeName === 'Container' ? "Frame" : typeName);
        nameSpan.style.flex = '1';
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        nameSpan.style.whiteSpace = 'nowrap';
        nameSpan.style.userSelect = 'none';
        nameSpan.style.fontWeight = item.node.locked ? '400' : '500';
        div.appendChild(nameSpan);

        // Action Buttons Container
        const actionsContainer = document.createElement('div');
        Object.assign(actionsContainer.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            flexShrink: '0'
        });
        div.appendChild(actionsContainer);

        // Lock Toggle
        const lockBtn = document.createElement('div');
        const isLocked = item.node.locked;
        Object.assign(lockBtn.style, {
            width: '20px',
            height: '20px',
            display: isLocked ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            color: isLocked ? 'var(--figma-text-primary)' : 'var(--figma-text-tertiary)',
            cursor: 'pointer',
            borderRadius: '2px'
        });
        lockBtn.innerHTML = isLocked 
            ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 5V4C3.5 2.61929 4.61929 1.5 6 1.5C7.38071 1.5 8.5 2.61929 8.5 4V5M3.5 5H2.5V9.5H9.5V5H8.5M3.5 5H8.5V7.5H3.5V5Z" fill="currentColor"/></svg>`
            : `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 5V4C3.5 2.61929 4.61929 1.5 6 1.5C7.38071 1.5 8.5 2.61929 8.5 4V5M3.5 5H2.5V9.5H9.5V5H8.5M3.5 5H8.5V7.5H3.5V5Z" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        
        lockBtn.onclick = (e) => {
            e.stopPropagation();
            item.node.locked = !item.node.locked;
            this.renderVisibleItems();
        };
        actionsContainer.appendChild(lockBtn);

        // Visibility Toggle (Figma eye icon)
        const visibilityBtn = document.createElement('div');
        const isVisible = item.node.visible;
        Object.assign(visibilityBtn.style, {
            width: '20px',
            height: '20px',
            display: !isVisible ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            color: !isVisible ? 'var(--figma-text-primary)' : 'var(--figma-text-tertiary)',
            cursor: 'pointer',
            borderRadius: '2px'
        });
        visibilityBtn.innerHTML = !isVisible
            ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2L2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M1.5 6C1.5 6 3.5 2.5 6 2.5C8.5 2.5 10.5 6 10.5 6C10.5 6 8.5 9.5 6 9.5C3.5 9.5 1.5 6 1.5 6Z" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/><circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/></svg>`
            : `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 6C1.5 6 3.5 2.5 6 2.5C8.5 2.5 10.5 6 10.5 6C10.5 6 8.5 9.5 6 9.5C3.5 9.5 1.5 6 1.5 6Z" stroke="currentColor" stroke-width="1"/><circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1"/></svg>`;
        
        visibilityBtn.onclick = (e) => {
            e.stopPropagation();
            item.node.visible = !item.node.visible;
            this.renderVisibleItems();
        };
        actionsContainer.appendChild(visibilityBtn);

        div.onmouseenter = () => {
            const isSelected = this.auxLayer.selectedNodes.has(item.node);
            if (!isSelected) {
                div.style.backgroundColor = 'var(--figma-hover-bg)';
            }
            lockBtn.style.display = 'flex';
            visibilityBtn.style.display = 'flex';
        };
        div.onmouseleave = () => {
            const isSelected = this.auxLayer.selectedNodes.has(item.node);
            if (!isSelected) {
                div.style.backgroundColor = 'transparent';
            }
            if (!item.node.locked) lockBtn.style.display = 'none';
            if (item.node.visible) visibilityBtn.style.display = 'none';
        };

        // Selection Click
        div.onclick = (e) => {
            e.stopPropagation();
            if (e.shiftKey) {
                // Multi-select logic if needed, but for now just single select
                this.auxLayer.selectedNode = item.node;
            } else {
                this.auxLayer.selectedNode = item.node;
            }
            this.rootNode.invalidate();
            
            if (this.interaction.onSelectionChange) {
                this.interaction.onSelectionChange();
            }
            
            this.interaction.focusNode(item.node);
        };

        return div;
    }

    private applyNodeStyle(node: Node, el: HTMLElement) {
        const isSelected = this.auxLayer.selectedNodes.has(node);
        const isHovered = this.auxLayer.hoveredNode === node;

        if (isSelected) {
            el.style.backgroundColor = 'var(--figma-blue)';
            el.style.color = '#ffffff';
            const svgs = el.querySelectorAll('svg');
            svgs.forEach(svg => (svg as unknown as HTMLElement).style.color = '#ffffff');
        } else if (isHovered) { 
            el.style.backgroundColor = 'var(--figma-hover-bg)';
            el.style.color = 'var(--figma-text-primary)';
            const svgs = el.querySelectorAll('svg');
            svgs.forEach(svg => (svg as unknown as HTMLElement).style.color = 'var(--figma-text-secondary)');
        } else {
            el.style.backgroundColor = 'transparent';
            el.style.color = 'var(--figma-text-secondary)';
            const svgs = el.querySelectorAll('svg');
            svgs.forEach(svg => (svg as unknown as HTMLElement).style.color = 'var(--figma-text-tertiary)');
        }
    }

    private scrollToNode(node: Node) {
        // 1. 找到节点在 flattenList 中的索引
        const index = this.flattenList.findIndex(item => item.node === node);
        
        // 如果节点不在列表中（可能是因为父节点折叠了），则展开父节点
        if (index === -1) {
            let current = node.parent;
            let needsRebuild = false;
            while (current && current !== this.rootNode) {
                if (!this.expandedNodes.has(current)) {
                    this.expandedNodes.add(current);
                    needsRebuild = true;
                }
                current = current.parent;
            }
            if (needsRebuild) {
                this.rebuildList();
                // 递归再次调用，此时应该能找到了
                this.scrollToNode(node);
                return;
            }
        }
        
        // 再次查找索引（可能在 rebuild 后改变）
        const newIndex = this.flattenList.findIndex(item => item.node === node);
        if (newIndex === -1) return;

        // 2. 计算目标滚动位置
        const targetTop = newIndex * this.itemHeight;
        
        // 3. 检查是否在可视区域内
        const scrollTop = this.scrollContainer.scrollTop;
        const viewportHeight = this.scrollContainer.clientHeight;
        
        if (targetTop < scrollTop || targetTop > scrollTop + viewportHeight - this.itemHeight) {
            // 滚动到该位置 (居中)
            this.scrollContainer.scrollTop = targetTop - viewportHeight / 2 + this.itemHeight / 2;
        }
    }
}
