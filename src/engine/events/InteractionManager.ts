import { Node } from '../display/Node';
import { Renderer } from '../core/Renderer';
import { vec2, mat3 } from 'gl-matrix';
import { AuxiliaryLayer } from '../display/AuxiliaryLayer';

/**
 * 交互管理器
 * 
 * 负责处理所有的鼠标/触摸事件，包括：
 * 1. 节点的点击选中 (单选/多选)
 * 2. 框选 (Shift + 拖拽)
 * 3. 拖拽节点移动 (支持批量拖拽)
 * 4. 拖拽节点改变层级 (Reparenting)
 * 5. 场景的平移 (Panning) 和 缩放 (Zooming)
 */
export class InteractionManager {
    private renderer: Renderer;
    private scene: Node;
    private auxLayer: AuxiliaryLayer;

    // 回调函数：当场景树结构发生变化时触发（如拖拽改变父子关系）
    public onStructureChange: (() => void) | null = null;
    // 回调函数：当选中状态发生变化时触发
    public onSelectionChange: (() => void) | null = null;
    // 回调函数：当悬停状态发生变化时触发
    public onHoverChange: (() => void) | null = null;

    // 状态标记
    private isPanning: boolean = false;
    private isBoxSelecting: boolean = false;

    // 记录上一帧的鼠标位置 (用于计算 delta)
    private lastMousePos: vec2 = vec2.create();
    // 框选起始点
    private boxSelectStart: vec2 = vec2.create();

    constructor(renderer: Renderer, scene: Node, auxLayer: AuxiliaryLayer) {
        this.renderer = renderer;
        this.scene = scene;
        this.auxLayer = auxLayer;
        this.initListeners();
    }

    /**
     * 初始化 DOM 事件监听器
     */
    private initListeners() {
        // 使用 Canvas 2D 层作为事件接收源
        const canvas = this.renderer.ctx.canvas;

        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }

    /**
     * 获取鼠标相对于 Canvas 的坐标
     */
    private getMousePos(e: MouseEvent): vec2 {
        const rect = this.renderer.ctx.canvas.getBoundingClientRect();
        return vec2.fromValues(e.clientX - rect.left, e.clientY - rect.top);
    }

    /**
     * 递归点击检测
     * 优先检测子节点（渲染顺序在上层的）
     */
    private hitTest(node: Node, point: vec2): Node | null {
        // 优化：如果节点有尺寸且点不在世界包围盒内，且节点被认为是容器（包含子节点在内），则跳过子节点检测
        // 注意：这里假设子节点在父节点尺寸范围内。如果子节点可能超出，则不能使用此优化。
        // 对于本项目的 Container (400x400) 和 Sprite，这是一个安全的假设。
        if (node.width > 0 && node.height > 0) {
            // 简单的世界 AABB 检测
            // 由于 Node 没有缓存 World AABB，我们需要计算
            // 快速路径：计算点在局部空间的坐标
            // Point_Local = Invert(WorldMatrix) * Point_World
            // 如果 Point_Local 在 (0,0, w,h) 内，则命中 AABB (甚至 OBB)
            
            // 为了避免 mat3.invert 的高昂开销，我们是否可以做更粗略的检查？
            // 不行，旋转后的矩形需要逆矩阵才能准确判断。
            
            // 既然必须计算逆矩阵来做准确的 hitTest，我们可以在这里做。
            // 但是，hitTest(self) 是在 children 之后调用的。
            // 我们需要 *提前* 判断是否可能命中 children。
            
            // 如果我们不计算逆矩阵，就无法准确判断点是否在旋转后的父节点内。
            // 妥协：对于 20k 节点，我们必须减少递归。
            // 让我们只对 *看起来像容器* 的节点做这个检查。
            // Container 类通常有 children。
            
            if (node.children.length > 0) {
                // 尝试计算逆矩阵
                const invertMatrix = mat3.create();
                mat3.invert(invertMatrix, node.transform.worldMatrix);
                const localPoint = vec2.create();
                vec2.transformMat3(localPoint, point, invertMatrix);
                
                // 如果点在局部 bounds 外，我们跳过子节点遍历
                // 假设：所有可交互子节点都在父节点 bounds 内
                if (localPoint[0] < 0 || localPoint[0] > node.width ||
                    localPoint[1] < 0 || localPoint[1] > node.height) {
                    return null;
                }
            }
        }

        // 倒序遍历子节点，保证先点击到上层物体
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

    /**
     * 获取选中的顶层节点
     * 
     * 在批量拖拽时，如果父节点和子节点都被选中，只需要移动父节点，
     * 否则子节点会被移动两次（一次随父节点，一次自己移动）。
     */
    private getTopLevelSelectedNodes(): Node[] {
        const topLevel: Node[] = [];
        for (const node of this.auxLayer.selectedNodes) {
            // 检查是否有祖先节点也被选中
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

    /**
     * 鼠标按下事件处理
     */
    private onMouseDown(e: MouseEvent) {
        const pos = this.getMousePos(e);
        this.lastMousePos = pos;

        // 检查是否触发框选 (Shift + Click/Drag)
        if (e.shiftKey) {
            this.isBoxSelecting = true;
            vec2.copy(this.boxSelectStart, pos);
            this.auxLayer.selectionRect = { start: vec2.clone(pos), end: vec2.clone(pos) };

            // 简单策略：开始框选时清空已有选择
            this.auxLayer.selectedNodes.clear();
            this.scene.invalidate(); // 状态变更，重绘
            return;
        }

        // 正常的点击检测
        const hit = this.hitTest(this.scene, pos);

        if (hit) {
            // 如果点击了已选中的节点，保持选中状态并准备拖拽
            if (this.auxLayer.selectedNodes.has(hit)) {
                this.auxLayer.draggingNode = hit; // 设置为主拖拽手柄
                vec2.copy(this.auxLayer.dragProxyPos, pos);
            } else {
                // 单选模式 (替换选择)
                this.auxLayer.selectedNode = hit;
                this.auxLayer.draggingNode = hit;
                vec2.copy(this.auxLayer.dragProxyPos, pos);
            }
        } else {
            // 点击空白处，取消选择并开始平移画布
            this.auxLayer.selectedNodes.clear();
            this.isPanning = true;
        }
        this.scene.invalidate(); // 状态变更，重绘
    }

    /**
     * 鼠标移动事件处理
     */
    private onMouseMove(e: MouseEvent) {
        const pos = this.getMousePos(e);
        const deltaX = pos[0] - this.lastMousePos[0];
        const deltaY = pos[1] - this.lastMousePos[1];

        let needsRender = false;

        // 1. 处理框选
        if (this.isBoxSelecting && this.auxLayer.selectionRect) {
            vec2.copy(this.auxLayer.selectionRect.end, pos);
            this.lastMousePos = pos;
            this.scene.invalidate(); // 重绘框选框
            return;
        }

        // 2. 处理悬停高亮 (仅在未拖拽/平移/框选时)
        if (!this.auxLayer.draggingNode && !this.isPanning && !this.isBoxSelecting) {
            const hit = this.hitTest(this.scene, pos);
            if (this.auxLayer.hoveredNode !== hit) {
                this.auxLayer.hoveredNode = hit;
                if (this.onHoverChange) this.onHoverChange();
                this.renderer.ctx.canvas.style.cursor = hit ? 'pointer' : 'default';
                needsRender = true; // 悬停状态改变，重绘
            }
        }

        // 3. 处理拖拽节点
        if (this.auxLayer.draggingNode) {
            const draggingNode = this.auxLayer.draggingNode;
            // 获取所有需要移动的顶层节点
            const topLevelNodes = this.getTopLevelSelectedNodes();

            // 对每个节点应用移动增量
            for (const node of topLevelNodes) {
                const parent = node.parent;
                if (parent) {
                    // 将屏幕空间的 delta 转换为父节点局部空间的 delta
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, parent.transform.worldMatrix);

                    const m = invertParent;
                    const localDeltaX = deltaX * m[0] + deltaY * m[3];
                    const localDeltaY = deltaX * m[1] + deltaY * m[4];

                    node.transform.position[0] += localDeltaX;
                    node.transform.position[1] += localDeltaY;
                    node.transform.dirty = true; // 标记脏位
                    needsRender = true;

                }
            }

            // 4. 检测放置目标 (Drop Target)
            const originalInteractives = new Map<Node, boolean>();
            for (const node of topLevelNodes) {
                originalInteractives.set(node, node.interactive);
                node.interactive = false;
            }

            const hit = this.hitTest(this.scene, pos);

            for (const node of topLevelNodes) {
                node.interactive = originalInteractives.get(node) || false;
            }

            let target: Node | null = hit;
            if (!target && draggingNode.parent !== this.scene) {
                target = this.scene;
            }

            let isValidTarget = true;
            if (target) {
                for (const node of topLevelNodes) {
                    if (target === node || target === node.parent || this.isDescendant(target, node)) {
                        isValidTarget = false;
                        break;
                    }
                }
            }

            const newTarget = (target && isValidTarget) ? target : null;
            if (this.auxLayer.dragTargetNode !== newTarget) {
                this.auxLayer.dragTargetNode = newTarget;
                // 目标改变，虽然在同一帧移动通常也会重绘，但明确标记更安全
            }

        } else if (this.isPanning) {
            // 5. 处理画布平移
            this.scene.transform.position[0] += deltaX;
            this.scene.transform.position[1] += deltaY;
            this.scene.transform.dirty = true;
            needsRender = true;
        }

        this.lastMousePos = pos;

        if (needsRender) {
            this.scene.invalidate();
        }
    }

    /**
     * 检查 parent 是否是 child 的后代（防止循环引用）
     */
    private isDescendant(parent: Node, child: Node): boolean {
        let current = parent;
        while (current.parent) {
            if (current.parent === child) return true;
            current = current.parent;
        }
        return false;
    }

    /**
     * 递归框选逻辑
     * @param node 当前检查节点
     * @param minX 框选区域最小X (屏幕)
     * @param minY 框选区域最小Y (屏幕)
     * @param maxX 框选区域最大X (屏幕)
     * @param maxY 框选区域最大Y (屏幕)
     */
    private boxSelect(node: Node, minX: number, minY: number, maxX: number, maxY: number) {
        if (node.interactive && node !== this.scene) { // 不选择场景根节点
            // 计算节点在屏幕空间的 AABB
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

            // AABB 相交检测
            const overlaps = (minX < nodeMaxX && maxX > nodeMinX &&
                minY < nodeMaxY && maxY > nodeMinY);

            if (overlaps) {
                this.auxLayer.selectedNodes.add(node);
            }
        }

        // 递归检查子节点
        for (const child of node.children) {
            this.boxSelect(child, minX, minY, maxX, maxY);
        }
    }

    /**
     * 鼠标抬起事件处理
     */
    private onMouseUp(e: MouseEvent) {
        let needsRender = false;

        // 1. 结束框选
        if (this.isBoxSelecting && this.auxLayer.selectionRect) {
            const start = this.auxLayer.selectionRect.start;
            const end = this.auxLayer.selectionRect.end;

            const minX = Math.min(start[0], end[0]);
            const minY = Math.min(start[1], end[1]);
            const maxX = Math.max(start[0], end[0]);
            const maxY = Math.max(start[1], end[1]);

            // 执行框选检测
            this.boxSelect(this.scene, minX, minY, maxX, maxY);

            // 重置状态
            this.isBoxSelecting = false;
            this.auxLayer.selectionRect = null;
            this.scene.invalidate(); // 重绘以清除框选框并显示选中状态
            return;
        }

        // 2. 结束拖拽
        if (this.auxLayer.draggingNode) {
            const target = this.auxLayer.dragTargetNode;

            if (target) {
                // 将所有选中的顶层节点移动到新父节点下
                const topLevelNodes = this.getTopLevelSelectedNodes();

                for (const draggingNode of topLevelNodes) {
                    // 1. 获取当前世界坐标 (保持视觉位置不变)
                    const worldPos = vec2.create();
                    const wm = draggingNode.transform.worldMatrix;
                    vec2.set(worldPos, wm[6], wm[7]); // 取出平移分量

                    // 2. 改变父子关系
                    target.addChild(draggingNode);

                    // 3. 重新计算局部坐标，以保持在世界中的位置
                    // NewLocal = NewParentWorldInverse * WorldPos
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, target.transform.worldMatrix);

                    const newLocal = vec2.create();
                    vec2.transformMat3(newLocal, worldPos, invertParent);

                    draggingNode.transform.position = newLocal;
                    draggingNode.transform.dirty = true;

                    console.log(`Reparented ${draggingNode.name} to ${target.name}`);
                }

                // 触发结构变更回调
                if (this.onStructureChange) {
                    this.onStructureChange();
                }
            }

            // 重置拖拽状态
            this.auxLayer.draggingNode = null;
            this.auxLayer.dragTargetNode = null;
            needsRender = true;
        }

        if (this.isPanning) {
            this.isPanning = false;
            // Panning 结束通常不需要重绘，除非有惯性等效果
        }

        if (needsRender) {
            this.scene.invalidate();
        }
    }

    /**
     * 滚轮缩放事件处理
     */
    private onWheel(e: WheelEvent) {
        e.preventDefault();

        const zoomSpeed = 0.001;
        const scaleChange = 1 - e.deltaY * zoomSpeed;

        const pos = this.getMousePos(e);

        const oldScale = this.scene.transform.scale[0];
        const newScale = oldScale * scaleChange;

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

        this.scene.invalidate(); // 缩放变化，重绘
    }
}
