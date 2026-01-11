import { Text } from '../scene/Text';
import { Engine } from '../system/Engine';
import { PropertyCommand } from '../history/Command';
import { Node } from '../scene/Node';
import { vec2 } from 'gl-matrix';

/**
 * 文字编辑器
 * 
 * 负责在画布上创建一个 HTML 编辑器，用于直接编辑 Text 节点的内容。
 */
export class TextEditor {
    private engine: Engine;
    private container: HTMLElement;
    private input: HTMLDivElement | null = null;
    private editingNode: Text | null = null;
    private oldText: string = "";
    private isEditing: boolean = false;

    constructor(engine: Engine, container: HTMLElement) {
        this.engine = engine;
        this.container = container;
    }

    /**
     * 开始编辑文字
     */
    public startEdit(node: Text) {
        if (this.isEditing) {
            this.finishEdit();
        }

        // 确保节点已经过测量，获取正确的 width/height
        node.updateTexture(this.engine.renderer);

        this.editingNode = node;
        this.oldText = node.text;
        this.isEditing = true;

        // 编辑时隐藏原节点，避免重影
        this.editingNode.visible = false;
        this.engine.requestRender();

        // 创建编辑器元素
        this.input = document.createElement('div');
        this.input.contentEditable = 'true';
        this.input.style.position = 'absolute';
        this.input.style.zIndex = '1000';
        this.input.style.outline = 'none';
        this.input.style.border = 'none';
        this.input.style.padding = '0';
        this.input.style.margin = '0';
        this.input.style.background = 'transparent';
        this.input.style.whiteSpace = 'pre-wrap';
        this.input.style.wordBreak = 'break-word';
        this.input.style.overflow = 'visible';
        this.input.style.lineHeight = '1.2';

        // 同步样式
        this.syncStyles();
        
        // 设置初始内容
        this.input.innerText = node.text;

        this.container.appendChild(this.input);

        // 监听事件
        this.input.addEventListener('input', () => {
            if (this.editingNode) {
                this.editingNode.text = this.input!.innerText;
                // 强制重新测量以更新 width/height
                this.editingNode.updateTexture(this.engine.renderer);
                this.updatePosition();
            }
        });

        this.input.addEventListener('blur', () => {
            this.finishEdit();
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.finishEdit();
            } else if (e.key === 'Enter') {
                // 目前 Text 渲染尚不支持多行，Enter 直接完成编辑
                this.finishEdit();
                e.preventDefault();
            }
            e.stopPropagation();
        });

        // 自动聚焦并全选
        this.input.focus();
        const range = document.createRange();
        range.selectNodeContents(this.input);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }

        this.updatePosition();
    }

    /**
     * 同步节点样式到编辑器
     */
    private syncStyles() {
        if (!this.input || !this.editingNode) return;

        const node = this.editingNode;
        const scale = this.engine.interaction.cameraScale;

        this.input.style.fontSize = `${node.fontSize * scale}px`;
        this.input.style.fontFamily = node.fontFamily;
        this.input.style.fontWeight = node.fontWeight;
        this.input.style.fontStyle = node.fontStyle;
        this.input.style.color = node.fillStyle;
        this.input.style.textAlign = node.textAlign;
        this.input.style.letterSpacing = `${node.letterSpacing * scale}px`;
        
        // 设置 line-height 为 1，以匹配 Canvas 的 textBaseline = 'top'
        // 在 Canvas 中，y 坐标直接对应文字的最顶部
        this.input.style.lineHeight = '1';
        
        // 描边效果模拟
        if (node.strokeStyle && node.strokeWidth > 0) {
            const sw = node.strokeWidth * scale;
            this.input.style.webkitTextStroke = `${sw}px ${node.strokeStyle}`;
        } else {
            this.input.style.webkitTextStroke = '0';
        }

        // 移除之前的 Flexbox 对齐，改为精确的内边距控制
        this.input.style.display = 'block';
    }

    /**
     * 更新编辑器位置
     */
    public updatePosition() {
        if (!this.input || !this.editingNode) return;

        const node = this.editingNode;
        const worldMatrix = node.getWorldMatrix();
        const scale = this.engine.interaction.cameraScale;

        // 获取节点的世界坐标 (左上角)
        const worldPos = vec2.fromValues(0, 0);
        vec2.transformMat3(worldPos, worldPos, worldMatrix);

        // 转换为屏幕坐标并取整
        const screenPos = this.engine.interaction.worldToScreen(worldPos[0], worldPos[1]);

        // 计算基于对齐方式的偏移 (完全匹配 Text.ts 中的 renderWebGL 逻辑)
        let offsetX = 0;
        let offsetY = 0;

        // @ts-ignore - 访问私有变量以获取精确尺寸
        const measuredWidth = node._measuredWidth || node.width;
        // @ts-ignore
        const measuredHeight = node._measuredHeight || node.height;

        switch (node.textAlign) {
            case 'center': offsetX = (node.width - measuredWidth) / 2; break;
            case 'right': offsetX = node.width - measuredWidth; break;
        }

        switch (node.textBaseline) {
            case 'middle': offsetY = (node.height - measuredHeight) / 2; break;
            case 'bottom': offsetY = node.height - measuredHeight; break;
        }

        const nodePadding = node.strokeWidth > 0 ? node.strokeWidth : 0;
        
        // 总内边距 = 节点自身的对齐偏移 + 绘制时的 padding
        const finalPaddingLeft = (offsetX + nodePadding) * scale;
        const finalPaddingTop = (offsetY + nodePadding) * scale;

        // 设置编辑器的位置和尺寸
        this.input.style.left = `${Math.round(screenPos[0])}px`;
        this.input.style.top = `${Math.round(screenPos[1])}px`;
        this.input.style.width = `${Math.round(node.width * scale)}px`;
        this.input.style.height = `${Math.round(node.height * scale)}px`;
        
        // 处理旋转
        const rotation = Math.atan2(worldMatrix[1], worldMatrix[0]);
        this.input.style.transformOrigin = '0 0';
        this.input.style.transform = `rotate(${rotation}rad)`;

        // 应用精确对齐内边距
        this.input.style.paddingLeft = `${finalPaddingLeft}px`;
        this.input.style.paddingTop = `${finalPaddingTop}px`;
        this.input.style.boxSizing = 'border-box';

        this.syncStyles();
    }

    /**
     * 结束编辑
     */
    public finishEdit() {
        if (!this.isEditing) return;

        if (this.input && this.input.parentNode) {
            this.input.parentNode.removeChild(this.input);
        }

        if (this.editingNode) {
            // 恢复显示
            this.editingNode.visible = true;
            
            // 最终同步一次内容
            if (this.input) {
                const newText = this.input.innerText;
                if (newText !== this.oldText) {
                    this.editingNode.text = newText;
                    
                    // 记录历史
                    const nodes = [this.editingNode as Node];
                    const startStates = new Map([[this.editingNode as Node, this.oldText]]);
                    const endStates = new Map([[this.editingNode as Node, newText]]);
                    const command = new PropertyCommand(
                        nodes, 
                        'textContent', 
                        startStates, 
                        endStates, 
                        (node, val) => (node as any).text = val
                    );
                    this.engine.history.push(command);
                }
            }
            this.engine.propertyPanel.updateNodes(this.engine.auxLayer.selectedNodes);
        }

        this.input = null;
        this.editingNode = null;
        this.isEditing = false;
        
        this.engine.requestRender();
    }

    public get active(): boolean {
        return this.isEditing;
    }
}
