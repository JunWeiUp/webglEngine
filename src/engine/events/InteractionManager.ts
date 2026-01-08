import { Node } from '../display/Node';
import { Renderer } from '../core/Renderer';
import { vec2, mat3 } from 'gl-matrix';
import { AuxiliaryLayer } from '../display/AuxiliaryLayer';
import type { Rect } from '../core/Rect';
import type { Engine } from '../Engine';

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
    private engine: Engine;
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

    // 摄像机状态 (取代直接修改 scene 坐标)
    private cameraX: number = 0;
    private cameraY: number = 0;
    private cameraScale: number = 1;

    // 记录上一帧的鼠标位置 (用于计算 delta)
    private lastMousePos: vec2 = vec2.create();
    // 框选起始点
    private boxSelectStart: vec2 = vec2.create();

    // 绑定后的事件处理器，用于注销
    private _handlers: Record<string, (e: any) => void> = {};

    constructor(engine: Engine, renderer: Renderer, scene: Node, auxLayer: AuxiliaryLayer) {
        this.engine = engine;
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

        this._handlers = {
            mousedown: this.onMouseDown.bind(this),
            mousemove: this.onMouseMove.bind(this),
            mouseup: this.onMouseUp.bind(this),
            wheel: this.onWheel.bind(this)
        };

        canvas.addEventListener('mousedown', this._handlers.mousedown);
        canvas.addEventListener('mousemove', this._handlers.mousemove);
        canvas.addEventListener('mouseup', this._handlers.mouseup);
        canvas.addEventListener('wheel', this._handlers.wheel, { passive: false });
    }

    /**
     * 销毁交互管理器，移除事件监听
     */
    public dispose() {
        const canvas = this.renderer.ctx.canvas;
        canvas.removeEventListener('mousedown', this._handlers.mousedown);
        canvas.removeEventListener('mousemove', this._handlers.mousemove);
        canvas.removeEventListener('mouseup', this._handlers.mouseup);
        canvas.removeEventListener('wheel', this._handlers.wheel);

        this._handlers = {};
        this.onStructureChange = null;
        this.onSelectionChange = null;
        this.onHoverChange = null;
    }

    /**
     * 获取鼠标相对于 Canvas 的坐标 (屏幕空间)
     */
    private getMousePos(e: MouseEvent): vec2 {
        const rect = this.renderer.ctx.canvas.getBoundingClientRect();
        return vec2.fromValues(e.clientX - rect.left, e.clientY - rect.top);
    }

    /**
     * 获取鼠标的世界坐标
     */
    private getWorldMousePos(e: MouseEvent | vec2): vec2 {
        let pos: vec2;
        if ('clientX' in (e as any)) {
            pos = this.getMousePos(e as MouseEvent);
        } else {
            pos = e as vec2;
        }
        const worldPos = vec2.create();
        vec2.transformMat3(worldPos, pos, this.renderer.getViewMatrixInverse());
        return worldPos;
    }

    /**
     * 递归点击检测
     * @param node 节点
     * @param point 世界坐标点
     */
    private hitTest(node: Node, point: vec2): Node | null {
        // 1. 无空间索引，走常规 AABB 剔除 + 递归流程
        if (node.worldMinX !== Infinity) {
            if (point[0] < node.worldMinX || point[0] > node.worldMaxX ||
                point[1] < node.worldMinY || point[1] > node.worldMaxY) {
                return null;
            }
        }

        // 倒序遍历子节点
        const children = node.children;
        for (let i = children.length - 1; i >= 0; i--) {
            const hit = this.hitTest(children[i], point);
            if (hit) return hit;
        }

        // 2. 自身精确检测
        if (node.interactive) {
            if (node.hitTest(point)) {
                return node;
            }
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
        const worldPos = this.getWorldMousePos(pos);
        this.lastMousePos = pos;

        // 检查是否触发框选 (Shift + Click/Drag)
        if (e.shiftKey) {
            this.isBoxSelecting = true;
            vec2.copy(this.boxSelectStart, worldPos);
            this.auxLayer.selectionRect = { start: vec2.clone(worldPos), end: vec2.clone(worldPos) };

            // 简单策略：开始框选时清空已有选择
            this.auxLayer.selectedNodes.clear();

            this.scene.invalidate(); // 状态变更，重绘
            return;
        }

        // 正常的点击检测 (使用世界坐标)
        const hit = this.hitTest(this.scene, worldPos);

        if (hit) {
            // 如果点击了已选中的节点，保持选中状态并准备拖拽
            if (this.auxLayer.selectedNodes.has(hit)) {
                this.auxLayer.draggingNode = hit; // 设置为主拖拽手柄
                vec2.copy(this.auxLayer.dragProxyPos, worldPos);
            } else {
                // 单选模式 (替换选择)
                this.auxLayer.selectedNode = hit;
                this.auxLayer.draggingNode = hit;
                vec2.copy(this.auxLayer.dragProxyPos, worldPos);
            }
        } else {
            // 点击空白处，取消选择并开始平移画布
            this.auxLayer.selectedNodes.clear();
            this.isPanning = true;
        }
        this.scene.invalidate(); // 状态变更，重绘
    }

    /**
     * 计算节点的屏幕 AABB (用于局部刷新)
     */
    private getNodeScreenBounds(node: Node | null): Rect | null {
        if (!node) return null;
        if (node === this.scene) return { x: 0, y: 0, width: this.renderer.width, height: this.renderer.height };

        const corners = [
            vec2.fromValues(0, 0),
            vec2.fromValues(node.width, 0),
            vec2.fromValues(node.width, node.height),
            vec2.fromValues(0, node.height)
        ];

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const p of corners) {
            const screen = vec2.create();
            vec2.transformMat3(screen, p, node.transform.worldMatrix);
            minX = Math.min(minX, screen[0]);
            minY = Math.min(minY, screen[1]);
            maxX = Math.max(maxX, screen[0]);
            maxY = Math.max(maxY, screen[1]);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * 鼠标移动事件处理
     */
    private onMouseMove(e: MouseEvent) {
        const pos = this.getMousePos(e);
        const worldPos = this.getWorldMousePos(pos);
        const deltaX = pos[0] - this.lastMousePos[0];
        const deltaY = pos[1] - this.lastMousePos[1];
        let needsRender = false;

        // 性能优化：如果鼠标位置几乎没动，跳过检测
        if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1 && !this.isBoxSelecting) {
            return;
        }

        // 1. 处理框选 (实时预览)
        if (this.isBoxSelecting && this.auxLayer.selectionRect) {
            const b0 = performance.now();
            vec2.copy(this.auxLayer.selectionRect.end, worldPos);
            this.lastMousePos = pos;

            // 实时更新选中状态
            const start = this.auxLayer.selectionRect.start;
            const end = this.auxLayer.selectionRect.end;
            const minX = Math.min(start[0], end[0]);
            const minY = Math.min(start[1], end[1]);
            const maxX = Math.max(start[0], end[0]);
            const maxY = Math.max(start[1], end[1]);

            this.auxLayer.selectedNodes.clear();
            this.boxSelect(minX, minY, maxX, maxY);
            this.renderer.stats.times.boxSelect = performance.now() - b0;

            this.scene.invalidate();
            return;
        }

        // 2. 处理悬停高亮 (使用世界坐标检测)
        if (!this.auxLayer.draggingNode && !this.isPanning && !this.isBoxSelecting) {
            const h0 = performance.now();
            const hit = this.hitTest(this.scene, worldPos);
            this.renderer.stats.times.hitTest = performance.now() - h0;
            if (this.auxLayer.hoveredNode !== hit) {
                // 优化：仅重绘变脏的区域
                const oldBounds = this.getNodeScreenBounds(this.auxLayer.hoveredNode);

                this.auxLayer.hoveredNode = hit;

                const newBounds = this.getNodeScreenBounds(hit);

                if (this.onHoverChange) this.onHoverChange();
                this.renderer.ctx.canvas.style.cursor = hit ? 'pointer' : 'default';

                const padding = 4;
                if (oldBounds) {
                    oldBounds.x -= padding;
                    oldBounds.y -= padding;
                    oldBounds.width += padding * 2;
                    oldBounds.height += padding * 2;
                    this.engine.invalidateAuxArea(oldBounds);
                }
                if (newBounds) {
                    newBounds.x -= padding;
                    newBounds.y -= padding;
                    newBounds.width += padding * 2;
                    newBounds.height += padding * 2;
                    this.engine.invalidateAuxArea(newBounds);
                }
            }
        }

        // 3. 处理拖拽节点 (将屏幕 delta 转换为世界空间 delta)
        if (this.auxLayer.draggingNode) {
            const draggingNode = this.auxLayer.draggingNode;
            const topLevelNodes = this.getTopLevelSelectedNodes();

            // 计算世界空间下的位移增量
            // delta_world = delta_screen / cameraScale
            const worldDeltaX = deltaX / this.cameraScale;
            const worldDeltaY = deltaY / this.cameraScale;

            for (const node of topLevelNodes) {
                const parent = node.parent;
                if (parent) {
                    // 将世界空间的 delta 转换为父节点局部空间的 delta
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, parent.transform.worldMatrix);

                    const m = invertParent;
                    // 注意：这里由于 worldMatrix 已经包含了节点的层级变换，
                    // 我们需要的是相对于世界坐标系的位移在局部空间的分量。
                    // 简化处理：node.x += worldDeltaX (如果父节点是根节点且没旋转)
                    // 准确处理：
                    const localDeltaX = worldDeltaX * m[0] + worldDeltaY * m[3];
                    const localDeltaY = worldDeltaX * m[1] + worldDeltaY * m[4];

                    node.x += localDeltaX;
                    node.y += localDeltaY;
                }
            }

            // 4. 检测放置目标 (使用世界坐标)
            const originalInteractives = new Map<Node, boolean>();
            for (const node of topLevelNodes) {
                originalInteractives.set(node, node.interactive);
                node.interactive = false;
            }

            const hit = this.hitTest(this.scene, worldPos);

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
            }

            needsRender = true;
        } else if (this.isPanning) {
            // 5. 处理画布平移 (更新摄像机)
            this.cameraX += deltaX;
            this.cameraY += deltaY;
            this.renderer.setViewTransform(this.cameraX, this.cameraY, this.cameraScale);
            needsRender = true;
        }

        if (needsRender) {
            this.scene.invalidate();
        }

        this.lastMousePos = pos;
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
     * 框选逻辑
     * @param minX 框选区域最小X (屏幕)
     * @param minY 框选区域最小Y (屏幕)
     * @param maxX 框选区域最大X (屏幕)
     * @param maxY 框选区域最大Y (屏幕)
     */
    private boxSelect(minX: number, minY: number, maxX: number, maxY: number) {
        const selectionRect: Rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        this._recursiveBoxSelect(this.scene, selectionRect);
    }

    private _recursiveBoxSelect(node: Node, selectionRect: Rect) {
        // 1. 常规 AABB 剔除
        if (node.worldMinX !== Infinity) {
            if (selectionRect.x > node.worldMaxX || selectionRect.x + selectionRect.width < node.worldMinX ||
                selectionRect.y > node.worldMaxY || selectionRect.y + selectionRect.height < node.worldMinY) {
                return;
            }
        }

        // 2. 检测自身是否被选中
        if (node.interactive && node !== this.scene) {
            // 这里已经通过了 AABB 粗筛，可以进行更精确的检测 (可选)
            // 简单起见，如果 AABB 相交就认为选中
            this.auxLayer.selectedNodes.add(node);
        }

        // 3. 递归子节点
        for (const child of node.children) {
            this._recursiveBoxSelect(child, selectionRect);
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
            this.boxSelect(minX, minY, maxX, maxY);

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

                    draggingNode.x = newLocal[0];
                    draggingNode.y = newLocal[1];
                    // draggingNode.transform.dirty = true;

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
     * 滚轮事件处理
     * 支持：
     * 1. 鼠标滚轮 -> 缩放
     * 2. 触控板捏合 (Pinch) -> 缩放 (ctrlKey = true)
     * 3. 触控板双指滑动 -> 平移 (deltaMode = 0)
     */
    private onWheel(e: WheelEvent) {
        e.preventDefault();

        // 判定是否为缩放操作
        const isZoom = e.ctrlKey || e.deltaMode !== 0;

        const t0 = performance.now();

        if (isZoom) {
            // --- 缩放逻辑 ---
            const zoomSpeed = 0.005;
            const scaleChange = 1 - e.deltaY * zoomSpeed;

            const pos = this.getMousePos(e);
            const oldScale = this.cameraScale;
            let newScale = oldScale * scaleChange;

            // 限制缩放范围
            if (newScale < 0.1) newScale = 0.1;
            if (newScale > 10) newScale = 10;
            
            const actualScaleChange = newScale / oldScale;

            const mouseX = pos[0];
            const mouseY = pos[1];

            // 以鼠标位置为中心缩放:
            // 屏幕坐标 = 世界坐标 * 缩放 + 平移
            // mousePos = worldPos * oldScale + oldPan
            // mousePos = worldPos * newScale + newPan
            // => newPan = mousePos - (mousePos - oldPan) * (newScale / oldScale)
            
            this.cameraX = mouseX - (mouseX - this.cameraX) * actualScaleChange;
            this.cameraY = mouseY - (mouseY - this.cameraY) * actualScaleChange;
            this.cameraScale = newScale;

            this.renderer.setViewTransform(this.cameraX, this.cameraY, this.cameraScale);
        } else {
            // --- 平移逻辑 (触控板双指滑动) ---
            this.cameraX -= e.deltaX;
            this.cameraY -= e.deltaY;
            this.renderer.setViewTransform(this.cameraX, this.cameraY, this.cameraScale);
        }

        this.scene.invalidate();

        if (Renderer.instance) {
            Renderer.instance.stats.times.nodeTransform = (performance.now() - t0);
        }
    }
}
