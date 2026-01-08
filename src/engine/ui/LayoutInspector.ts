import { Node } from '../display/Node';
import { InteractionManager } from '../events/InteractionManager';
import {
    FlexDirection,
    Justify,
    Align,
    Wrap,
    PositionType,
} from 'yoga-layout';

/**
 * LayoutInspector
 * 
 * 一个基于 HTML 的面板，用于配置选中节点的 Yoga 布局属性。
 */
export class LayoutInspector {
    private container: HTMLElement;
    private interactionManager: InteractionManager;
    private selectedNode: Node | null = null;

    constructor(parent: HTMLElement, interactionManager: InteractionManager) {
        this.interactionManager = interactionManager;
        
        // 创建 HTML 容器
        this.container = document.createElement('div');
        this.container.id = 'layout-inspector';
        this.applyStyles();
        parent.appendChild(this.container);

        // 初始渲染
        this.renderEmpty();
    }

    /**
     * 更新选中的节点并刷新面板
     */
    public update() {
        const nodes = (this.interactionManager as any).auxLayer.selectedNodes;
        this.selectedNode = nodes.size > 0 ? nodes.values().next().value : null;
        this.updatePanel();
    }

    private applyStyles() {
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '10px',
            right: '270px', // 避开现有的 OutlineView (假设它在最右侧)
            width: '240px',
            backgroundColor: 'rgba(30, 30, 30, 0.9)',
            color: '#ffffff',
            padding: '15px',
            borderRadius: '8px',
            fontFamily: 'sans-serif',
            fontSize: '13px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            zIndex: '1000',
            maxHeight: '80vh',
            overflowY: 'auto'
        });
    }

    private renderEmpty() {
        this.container.innerHTML = '<div style="color: #888; text-align: center;">Select a node to inspect layout</div>';
    }

    private updatePanel() {
        if (!this.selectedNode) {
            this.renderEmpty();
            return;
        }

        const node = this.selectedNode;
        this.container.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 5px;">
                Layout: ${node.name || 'Unnamed'}
            </div>
            
            ${this.createSelectField('Flex Direction', 'flexDirection', FlexDirection, node.flexDirection)}
            ${this.createSelectField('Justify Content', 'justifyContent', Justify, node.justifyContent)}
            ${this.createSelectField('Align Items', 'alignItems', Align, node.alignItems)}
            ${this.createSelectField('Align Self', 'alignSelf', Align, node.alignSelf)}
            ${this.createSelectField('Flex Wrap', 'flexWrap', Wrap, node.flexWrap)}
            
            <div style="margin-top: 15px; font-weight: bold; font-size: 11px; color: #aaa; text-transform: uppercase;">Positioning</div>
            ${this.createSelectField('Position Type', 'positionType', PositionType, node.positionType)}
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 5px;">
                ${this.createStringField('Top', 'top', node.top)}
                ${this.createStringField('Left', 'left', node.left)}
                ${this.createStringField('Right', 'right', node.right)}
                ${this.createStringField('Bottom', 'bottom', node.bottom)}
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px;">
                ${this.createNumberField('Flex Grow', 'flexGrow', node.flexGrow)}
                ${this.createNumberField('Flex Shrink', 'flexShrink', node.flexShrink)}
            </div>

            <div style="margin-top: 15px; font-weight: bold; font-size: 11px; color: #aaa; text-transform: uppercase;">Dimensions</div>
            <div style="display: flex; gap: 10px;">
                ${this.createStringField('Width', 'layoutWidth', node.layoutWidth)}
                ${this.createStringField('Height', 'layoutHeight', node.layoutHeight)}
            </div>

            <div style="margin-top: 15px; font-weight: bold; font-size: 11px; color: #aaa; text-transform: uppercase;">Padding</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                ${this.createStringField('All', 'padding', node.paddingLeft === node.paddingRight && node.paddingLeft === node.paddingTop && node.paddingLeft === node.paddingBottom ? node.paddingLeft : '')}
                ${this.createStringField('Top', 'paddingTop', node.paddingTop)}
                ${this.createStringField('Right', 'paddingRight', node.paddingRight)}
                ${this.createStringField('Bottom', 'paddingBottom', node.paddingBottom)}
                ${this.createStringField('Left', 'paddingLeft', node.paddingLeft)}
            </div>

            <div style="margin-top: 15px; font-weight: bold; font-size: 11px; color: #aaa; text-transform: uppercase;">Margin</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                ${this.createStringField('All', 'margin', node.margin)}
                ${this.createStringField('Left', 'marginLeft', node.marginLeft)}
                ${this.createStringField('Top', 'marginTop', node.marginTop)}
            </div>

            <div style="margin-top: 15px; font-weight: bold; font-size: 11px; color: #aaa; text-transform: uppercase;">Spacing</div>
            ${this.createStringField('Gap', 'gap', node.gap)}

            <div style="margin-top: 20px;">
                <button id="recalculate-btn" style="width: 100%; padding: 8px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Recalculate Layout
                </button>
            </div>
        `;

        // 绑定事件
        this.container.querySelectorAll('select, input').forEach(el => {
            el.addEventListener('change', (e) => this.handleInputChange(e));
        });

        this.container.querySelector('#recalculate-btn')?.addEventListener('click', () => {
            this.recalculate();
        });
    }

    private createSelectField(label: string, prop: string, enumObj: any, currentVal: any) {
        let options = '';
        for (const key in enumObj) {
            if (isNaN(Number(key))) {
                const val = enumObj[key];
                options += `<option value="${val}" ${val === currentVal ? 'selected' : ''}>${key}</option>`;
            }
        }

        return `
            <div style="margin-bottom: 8px;">
                <div style="color: #aaa; font-size: 11px; margin-bottom: 2px;">${label}</div>
                <select data-prop="${prop}" style="width: 100%; background: #3c3c3c; color: white; border: 1px solid #555; padding: 4px; border-radius: 4px;">
                    ${options}
                </select>
            </div>
        `;
    }

    private createNumberField(label: string, prop: string, value: number) {
        return `
            <div style="flex: 1; margin-bottom: 8px;">
                <div style="color: #aaa; font-size: 11px; margin-bottom: 2px;">${label}</div>
                <input type="number" data-prop="${prop}" value="${value}" style="width: 100%; background: #3c3c3c; color: white; border: 1px solid #555; padding: 4px; border-radius: 4px;">
            </div>
        `;
    }

    private createStringField(label: string, prop: string, value: any) {
        const valStr = value === undefined || value === null ? '' : value.toString();
        return `
            <div style="flex: 1; margin-bottom: 8px;">
                <div style="color: #aaa; font-size: 11px; margin-bottom: 2px;">${label}</div>
                <input type="text" data-prop="${prop}" value="${valStr}" placeholder="auto, 10, 50%" style="width: 100%; background: #3c3c3c; color: white; border: 1px solid #555; padding: 4px; border-radius: 4px;">
            </div>
        `;
    }

    private handleInputChange(e: Event) {
        if (!this.selectedNode) return;

        const target = e.target as HTMLInputElement | HTMLSelectElement;
        const prop = target.getAttribute('data-prop');
        if (!prop) return;

        let value: any = target.value;
        
        // 类型转换
        if (target.type === 'number') {
            value = parseFloat(value);
        } else if (target.tagName === 'SELECT') {
            value = parseInt(value);
        }

        console.log(`[LayoutInspector] Setting ${prop} to`, value);
        
        // 应用属性
        try {
            (this.selectedNode as any)[prop] = value;
            this.recalculate();
        } catch (err) {
            console.error(`Failed to set property ${prop}:`, err);
        }
    }

    private recalculate() {
        if (!this.selectedNode) return;
        
        // 找到布局根节点
        let root = this.selectedNode;
        while (root.parent && root.parent.isLayoutEnabled) {
            root = root.parent;
        }

        // 计算布局
        // 如果是根节点，使用画布尺寸
        const renderer = (this.interactionManager as any).renderer;
        root.calculateLayout(renderer.width, renderer.height);
        
        // 通知重绘
        root.invalidate();
    }
}
