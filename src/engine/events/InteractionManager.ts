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
    // 拖拽/缩放开始时的状态记录
    private dragStartMousePos: vec2 = vec2.create();
    private dragStartNodesState: Map<Node, { x: number, y: number, w: number, h: number }> = new Map();
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
     * 平移相机使节点在视图中居中
     */
    public focusNode(node: Node) {
        // 1. 获取 Canvas 尺寸
        const canvas = this.renderer.ctx.canvas;
        const viewportWidth = canvas.width;
        const viewportHeight = canvas.height;

        // 2. 计算节点在世界空间的中点
        // 使用 getWorldMatrix() 确保获取到最新的矩阵
        const worldMatrix = node.getWorldMatrix();
        const localCenter = vec2.fromValues(node.width / 2, node.height / 2);
        const worldCenter = vec2.create();
        vec2.transformMat3(worldCenter, localCenter, worldMatrix);

        const nodeCenterX = worldCenter[0];
        const nodeCenterY = worldCenter[1];

        // 3. 计算目标相机位置
        // 目标：让节点的世界坐标在经过相机变换后，处于屏幕中心
        // 屏幕中心 = (worldPos * scale) + cameraPos
        // cameraPos = 屏幕中心 - (worldPos * scale)
        this.cameraX = (viewportWidth / 2) - (nodeCenterX * this.cameraScale);
        this.cameraY = (viewportHeight / 2) - (nodeCenterY * this.cameraScale);

        // 4. 应用变换
        this.renderer.setViewTransform(this.cameraX, this.cameraY, this.cameraScale);
        this.scene.invalidate();
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
        const canvas = this.renderer.ctx.canvas;
        // 只有 HTMLCanvasElement 有 getBoundingClientRect
        if (canvas instanceof HTMLCanvasElement) {
            const rect = canvas.getBoundingClientRect();
            return vec2.fromValues(e.clientX - rect.left, e.clientY - rect.top);
        }
        // 对于 OffscreenCanvas 或其他情况，尝试使用默认值
        return vec2.fromValues(e.offsetX || 0, e.offsetY || 0);
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
     * 拾取检测 (Hit Test)
     * 深度优先遍历，从后往前查找 (后渲染的先检测)
     */
    private hitTest(node: Node, worldPos: vec2): Node | null {
        // 1. 优先递归检测子节点
        if (node.childSpatialIndex) {
            const hit = node.childSpatialIndex.hitTestRecursive(node.getWorldMatrix(), worldPos);
            if (hit) return hit;
        } else {
            const children = node.children;
            for (let i = children.length - 1; i >= 0; i--) {
                const hit = this.hitTest(children[i], worldPos);
                if (hit) return hit;
            }
        }

        // 2. 检测当前节点
        if (node.interactive && node !== this.scene) {
            // 使用 AABB 包围盒进行快速初步检测
            const bounds = node.getBounds(false);
            if (bounds && 
                worldPos[0] >= bounds.x && worldPos[0] <= bounds.x + bounds.width &&
                worldPos[1] >= bounds.y && worldPos[1] <= bounds.y + bounds.height) {

                // 进一步精确检测：将世界坐标转换到节点的局部坐标系
                const localPos = vec2.create();
                const invertWorld = mat3.create();
                mat3.invert(invertWorld, node.getWorldMatrix());
                vec2.transformMat3(localPos, worldPos, invertWorld);

                // 检查是否在节点的矩形范围内 (0, 0) 到 (width, height)
                if (localPos[0] >= 0 && localPos[0] <= node.width &&
                    localPos[1] >= 0 && localPos[1] <= node.height) {
                    return node;
                }
            }
        }

        return null;
    }

    /**
     * 获取选中的顶层节点
     */
    private getTopLevelSelectedNodes(): Node[] {
        const topLevel: Node[] = [];
        for (const node of this.auxLayer.selectedNodes) {
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
     * 检测鼠标是否在手柄上
     */
    private hitTestHandles(pos: vec2): { node: Node, handle: any } | null {
        if (this.auxLayer.selectedNodes.size !== 1) return null;

        const node = this.auxLayer.selectedNode!;
        const handles = this.auxLayer.getHandles(node, this.renderer.getViewMatrix());
        const size = (this.auxLayer.constructor as any).HANDLE_SIZE || 8;

        for (const handle of handles) {
            if (pos[0] >= handle.x - size && pos[0] <= handle.x + size &&
                pos[1] >= handle.y - size && pos[1] <= handle.y + size) {
                return { node, handle };
            }
        }
        return null;
    }

    private getCursorForHandle(handleType: string): string {
        switch (handleType) {
            case 'n':
            case 's': return 'ns-resize';
            case 'e':
            case 'w': return 'ew-resize';
            case 'nw':
            case 'se': return 'nwse-resize';
            case 'ne':
            case 'sw': return 'nesw-resize';
            default: return 'default';
        }
    }

    /**
     * 吸附逻辑
     * @param node 当前操作的节点
     * @param targetWorldX 目标世界坐标 X
     * @param targetWorldY 目标世界坐标 Y
     * @param threshold 像素阈值 (屏幕空间)
     */
    private snapNode(node: Node, targetX: number, targetY: number): { x: number, y: number } {
        const parent = node.parent;
        if (!parent) return { x: targetX, y: targetY };

        const scale = this.cameraScale;
        const worldThreshold = 5 / scale;

        this.auxLayer.alignmentLines = [];

        // Candidates for snapping
        const xTargets: { value: number, worldX: number }[] = [];
        const yTargets: { value: number, worldY: number }[] = [];

        // --- 性能优化：使用空间索引查询附近的兄弟节点 ---
        let siblings: Node[];
        if (parent.childSpatialIndex) {
            // 查询范围：当前节点目标位置附近的 AABB
            // 注意：这里假设父节点的缩放为 1，如果父节点有缩放，threshold 可能需要进一步换算
            const queryRect: Rect = {
                x: targetX - worldThreshold,
                y: targetY - worldThreshold,
                width: node.width + worldThreshold * 2,
                height: node.height + worldThreshold * 2
            };
            siblings = parent.childSpatialIndex.search(queryRect).filter(c => c !== node && c.interactive);
        } else {
            // 降级方案：全量过滤 (百万级节点下会卡顿)
            siblings = parent.children.filter(c => c !== node && c.interactive);
        }

        // 1. Add siblings as targets
        for (const sibling of siblings) {
            const sXLines = [sibling.x, sibling.x + sibling.width / 2, sibling.x + sibling.width];
            const sYLines = [sibling.y, sibling.y + sibling.height / 2, sibling.y + sibling.height];

            const siblingMatrix = sibling.getWorldMatrix();
            sXLines.forEach((lx, i) => {
                const worldPos = vec2.fromValues(i * sibling.width / 2, 0);
                vec2.transformMat3(worldPos, worldPos, siblingMatrix);
                xTargets.push({ value: lx, worldX: worldPos[0] });
            });
            sYLines.forEach((ly, i) => {
                const worldPos = vec2.fromValues(0, i * sibling.height / 2);
                vec2.transformMat3(worldPos, worldPos, siblingMatrix);
                yTargets.push({ value: ly, worldY: worldPos[1] });
            });
        }

        // 2. Add parent boundaries as targets (0, center, size)
        const pXLines = [0, parent.width / 2, parent.width];
        const pYLines = [0, parent.height / 2, parent.height];
        const parentMatrix = parent.getWorldMatrix();
        pXLines.forEach((lx, i) => {
            const localPos = vec2.fromValues(i * parent.width / 2, 0);
            const worldPos = vec2.create();
            vec2.transformMat3(worldPos, localPos, parentMatrix);
            xTargets.push({ value: lx, worldX: worldPos[0] });
        });
        pYLines.forEach((ly, i) => {
            const localPos = vec2.fromValues(0, i * parent.height / 2);
            const worldPos = vec2.create();
            vec2.transformMat3(worldPos, localPos, parentMatrix);
            yTargets.push({ value: ly, worldY: worldPos[1] });
        });

        let snappedX = targetX;
        let snappedY = targetY;

        const myXLines = [targetX, targetX + node.width / 2, targetX + node.width];
        const myYLines = [targetY, targetY + node.height / 2, targetY + node.height];

        // Snap X
        let minDX = worldThreshold;
        for (let i = 0; i < 3; i++) {
            for (const target of xTargets) {
                const dx = Math.abs(myXLines[i] - target.value);
                if (dx < minDX) {
                    minDX = dx;
                    snappedX = target.value - (i * node.width / 2);
                    this.auxLayer.alignmentLines.push({ type: 'v', value: target.worldX });
                }
            }
        }

        // Snap Y
        let minDY = worldThreshold;
        for (let i = 0; i < 3; i++) {
            for (const target of yTargets) {
                const dy = Math.abs(myYLines[i] - target.value);
                if (dy < minDY) {
                    minDY = dy;
                    snappedY = target.value - (i * node.height / 2);
                    this.auxLayer.alignmentLines.push({ type: 'h', value: target.worldY });
                }
            }
        }

        return { x: snappedX, y: snappedY };
    }

    /**
     * 鼠标按下事件处理
     */
    private onMouseDown(e: MouseEvent) {
        this.engine.recordInteractionTime();
        const pos = this.getMousePos(e);
        const worldPos = this.getWorldMousePos(pos);
        this.lastMousePos = pos;
        vec2.copy(this.dragStartMousePos, worldPos);
        this.dragStartNodesState.clear();

        // 1. Check handles first
        const handleHit = this.hitTestHandles(pos);
        if (handleHit) {
            const node = handleHit.node;
            this.auxLayer.activeHandle = handleHit.handle.type;
            this.dragStartNodesState.set(node, { x: node.x, y: node.y, w: node.width, h: node.height });
            this.scene.invalidate();
            return;
        }

        if (e.shiftKey) {
            this.isBoxSelecting = true;
            vec2.copy(this.boxSelectStart, worldPos);
            this.auxLayer.selectionRect = { start: vec2.clone(worldPos), end: vec2.clone(worldPos) };
            this.auxLayer.selectedNodes.clear();
            this.scene.invalidate();
            return;
        }

        const hit = this.hitTest(this.scene, worldPos);

        if (hit) {
            if (this.auxLayer.selectedNodes.has(hit)) {
                this.auxLayer.draggingNode = hit;
                vec2.copy(this.auxLayer.dragProxyPos, worldPos);

                // 记录所有选中节点的起始状态
                this.auxLayer.selectedNodes.forEach(node => {
                    this.dragStartNodesState.set(node, { x: node.x, y: node.y, w: node.width, h: node.height });
                });
            } else {
                this.auxLayer.selectedNodes.clear();
                this.auxLayer.selectedNodes.add(hit);
                this.auxLayer.draggingNode = hit;
                vec2.copy(this.auxLayer.dragProxyPos, worldPos);

                this.dragStartNodesState.set(hit, { x: hit.x, y: hit.y, w: hit.width, h: hit.height });
                if (this.onSelectionChange) this.onSelectionChange();
            }
        } else {
            this.auxLayer.selectedNodes.clear();
            this.isPanning = true;
            if (this.onSelectionChange) this.onSelectionChange();
        }
        this.scene.invalidate();
    }

    /**
     * 计算节点的屏幕 AABB (用于局部刷新)
     */
    private getNodeScreenBounds(node: Node | null): Rect | null {
        if (!node) return null;
        if (node === this.scene) return { x: 0, y: 0, width: this.renderer.width, height: this.renderer.height };

        const viewMatrix = this.renderer.getViewMatrix();
        const combined = mat3.create();
        mat3.multiply(combined, viewMatrix, node.transform.worldMatrix);

        const corners = [
            vec2.fromValues(0, 0),
            vec2.fromValues(node.width, 0),
            vec2.fromValues(node.width, node.height),
            vec2.fromValues(0, node.height)
        ];

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const p of corners) {
            const screen = vec2.create();
            vec2.transformMat3(screen, p, combined);
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
        this.engine.recordInteractionTime();
        const pos = this.getMousePos(e);
        const worldPos = this.getWorldMousePos(pos);
        const deltaX = pos[0] - this.lastMousePos[0];
        const deltaY = pos[1] - this.lastMousePos[1];
        let needsRender = false;

        if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1 && !this.isBoxSelecting) {
            return;
        }

        if (this.isBoxSelecting && this.auxLayer.selectionRect) {
            vec2.copy(this.auxLayer.selectionRect.end, worldPos);
            this.lastMousePos = pos;
            const start = this.auxLayer.selectionRect.start;
            const end = this.auxLayer.selectionRect.end;
            this.auxLayer.selectedNodes.clear();
            this.boxSelect(Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1]));
            this.scene.invalidate();
            return;
        }

        // Handle Resizing
        if (this.auxLayer.activeHandle && this.auxLayer.selectedNode) {
            const node = this.auxLayer.selectedNode;
            const handleType = this.auxLayer.activeHandle;

            // Keep the resize cursor while dragging
            this.renderer.ctx.canvas.style.cursor = this.getCursorForHandle(handleType);

            const startState = this.dragStartNodesState.get(node);
            if (!startState) return;

            // Calculate total world delta since mouse down
            const totalWorldDeltaX = worldPos[0] - this.dragStartMousePos[0];
            const totalWorldDeltaY = worldPos[1] - this.dragStartMousePos[1];

            // Convert total world delta to local delta
            const parentNode = node.parent;
            let localDeltaX = totalWorldDeltaX;
            let localDeltaY = totalWorldDeltaY;
            if (parentNode) {
                const invertParent = mat3.create();
                mat3.invert(invertParent, parentNode.transform.worldMatrix);
                const m = invertParent;
                localDeltaX = totalWorldDeltaX * m[0] + totalWorldDeltaY * m[3];
                localDeltaY = totalWorldDeltaX * m[1] + totalWorldDeltaY * m[4];
            }

            // Logical size/position based on start state and total delta
            let newX = startState.x;
            let newY = startState.y;
            let newW = startState.w;
            let newH = startState.h;

            if (handleType.includes('e')) {
                newW += localDeltaX;
            } else if (handleType.includes('w')) {
                newX += localDeltaX;
                newW -= localDeltaX;
            }

            if (handleType.includes('s')) {
                newH += localDeltaY;
            } else if (handleType.includes('n')) {
                newY += localDeltaY;
                newH -= localDeltaY;
            }

            // Apply snapping for resize
            this.auxLayer.alignmentLines = [];
            if (parentNode) {
                const scale = this.cameraScale;
                const worldThreshold = 5 / scale;
                const parentWM = parentNode.transform.worldMatrix;

                // --- 性能优化：使用空间索引查询附近的兄弟节点 ---
                let siblings: Node[];
                if (parentNode.childSpatialIndex) {
                    const queryRect: Rect = {
                        x: newX - worldThreshold,
                        y: newY - worldThreshold,
                        width: newW + worldThreshold * 2,
                        height: newH + worldThreshold * 2
                    };
                    siblings = parentNode.childSpatialIndex.search(queryRect).filter(c => c !== node && c.interactive);
                } else {
                    siblings = parentNode.children.filter(c => c !== node && c.interactive);
                }

                // Vertical snapping (for X changes)
                if (handleType.includes('e') || handleType.includes('w')) {
                    // Calculate current world X of the handle
                    const localX = handleType.includes('e') ? newX + newW : newX;
                    const worldXLine = localX * parentWM[0] + parentWM[6];

                    let foundX = false;
                    for (const sibling of siblings) {
                        const sBounds = sibling.getBounds(false);
                        if (!sBounds) continue;

                        const sXLines = [sBounds.x, (sBounds.x + sBounds.x + sBounds.width) / 2, sBounds.x + sBounds.width];
                        for (let j = 0; j < 3; j++) {
                            if (Math.abs(worldXLine - sXLines[j]) < worldThreshold) {
                                const deltaWorld = sXLines[j] - worldXLine;
                                const deltaLocal = deltaWorld / parentWM[0];
                                if (handleType.includes('e')) {
                                    newW += deltaLocal;
                                } else {
                                    newX += deltaLocal;
                                    newW -= deltaLocal;
                                }
                                this.auxLayer.alignmentLines.push({ type: 'v', value: sXLines[j] });
                                foundX = true;
                                break;
                            }
                        }
                        if (foundX) break;
                    }
                }

                // Horizontal snapping (for Y changes)
                if (handleType.includes('s') || handleType.includes('n')) {
                    const localY = handleType.includes('s') ? newY + newH : newY;
                    const worldYLine = localY * parentWM[4] + parentWM[7];

                    let foundY = false;
                    for (const sibling of siblings) {
                        const sBounds = sibling.getBounds(false);
                        if (!sBounds) continue;

                        const sYLines = [sBounds.y, (sBounds.y + sBounds.y + sBounds.height) / 2, sBounds.y + sBounds.height];
                        for (let j = 0; j < 3; j++) {
                            if (Math.abs(worldYLine - sYLines[j]) < worldThreshold) {
                                const deltaWorld = sYLines[j] - worldYLine;
                                const deltaLocal = deltaWorld / parentWM[4];
                                if (handleType.includes('s')) {
                                    newH += deltaLocal;
                                } else {
                                    newY += deltaLocal;
                                    newH -= deltaLocal;
                                }
                                this.auxLayer.alignmentLines.push({ type: 'h', value: sYLines[j] });
                                foundY = true;
                                break;
                            }
                        }
                        if (foundY) break;
                    }
                }
            }

            node.set(newX, newY, newW, newH);

            this.lastMousePos = pos;
            this.scene.invalidate();

            return;
        }

        if (!this.auxLayer.draggingNode && !this.isPanning && !this.isBoxSelecting) {
            // Check handle hover
            const handleHit = this.hitTestHandles(pos);
            if (handleHit) {
                this.auxLayer.hoveredHandle = handleHit.handle.type;
                this.renderer.ctx.canvas.style.cursor = this.getCursorForHandle(handleHit.handle.type);
                return;
            } else if (this.auxLayer.hoveredHandle) {
                this.auxLayer.hoveredHandle = null;
                this.renderer.ctx.canvas.style.cursor = 'default';
            }

            const hit = this.hitTest(this.scene, worldPos);
            if (this.auxLayer.hoveredNode !== hit) {
                const oldBounds = this.getNodeScreenBounds(this.auxLayer.hoveredNode);
                this.auxLayer.hoveredNode = hit;
                const newBounds = this.getNodeScreenBounds(hit);

                if (this.onHoverChange) this.onHoverChange();
                this.renderer.ctx.canvas.style.cursor = hit ? 'pointer' : 'default';

                const padding = 4;
                if (oldBounds) {
                    oldBounds.x -= padding; oldBounds.y -= padding;
                    oldBounds.width += padding * 2; oldBounds.height += padding * 2;
                    this.engine.invalidateAuxArea(oldBounds);
                }
                if (newBounds) {
                    newBounds.x -= padding; newBounds.y -= padding;
                    newBounds.width += padding * 2; newBounds.height += padding * 2;
                    this.engine.invalidateAuxArea(newBounds);
                }
            }
        }

        if (this.auxLayer.draggingNode) {
            const draggingNode = this.auxLayer.draggingNode;
            const topLevelNodes = this.getTopLevelSelectedNodes();

            // Calculate total world delta since mouse down
            const totalWorldDeltaX = worldPos[0] - this.dragStartMousePos[0];
            const totalWorldDeltaY = worldPos[1] - this.dragStartMousePos[1];
            for (const node of topLevelNodes) {
                const startState = this.dragStartNodesState.get(node);
                if (!startState) continue;

                const parent = node.parent;
                if (parent) {
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, parent.getWorldMatrix());
                    const m = invertParent;

                    // Convert total world delta to local delta for this node
                    // Use only rotation/scale for delta conversion
                    const localDeltaX = totalWorldDeltaX * m[0] + totalWorldDeltaY * m[3];
                    const localDeltaY = totalWorldDeltaX * m[1] + totalWorldDeltaY * m[4];

                    // Logical position
                    let newX = startState.x + localDeltaX;
                    let newY = startState.y + localDeltaY;
                    // // 3. 计算从交互到渲染完成的全链路耗时
                    if (this.engine.lastInteractionTime > 0) {
                        this.renderer.stats.times.interactionToRender = performance.now() - this.engine.lastInteractionTime;
                        // 处理完成后重置，避免在没有交互的帧中重复计算（如果是 alwaysRender 模式）
                        this.engine.lastInteractionTime = 0;
                    }

                    // Apply snapping to the logical position
                    if (topLevelNodes.length === 1) {
                        const snapped = this.snapNode(node, newX, newY);
                        newX = snapped.x;
                        newY = snapped.y;
                    }

                    node.setPosition(newX, newY);

                }
            }


            vec2.copy(this.auxLayer.dragProxyPos, worldPos);

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
            this.auxLayer.dragTargetNode = (target && isValidTarget) ? target : null;
            needsRender = true;
        } else if (this.isPanning) {
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

    private isDescendant(parent: Node, child: Node): boolean {
        let current = parent;
        while (current.parent) {
            if (current.parent === child) return true;
            current = current.parent;
        }
        return false;
    }

    private boxSelect(minX: number, minY: number, maxX: number, maxY: number) {
        const selectionRect: Rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

        // 优先使用分层空间索引进行框选
        if (this.scene.childSpatialIndex) {
            const results: Node[] = [];
            this.scene.childSpatialIndex.queryRecursive(
                mat3.create(), // 框选是在世界空间进行的，传入单位矩阵作为视图
                this.scene.getWorldMatrix(),
                selectionRect,
                results
            );
            for (const node of results) {
                if (node.interactive && node !== this.scene) {
                    this.auxLayer.selectedNodes.add(node);
                }
            }
        } else {
            this._recursiveBoxSelect(this.scene, selectionRect);
        }
    }

    private _recursiveBoxSelect(node: Node, selectionRect: Rect) {
        const bounds = node.getBounds(false);
        if (bounds) {
            if (selectionRect.x > bounds.x + bounds.width || selectionRect.x + selectionRect.width < bounds.x ||
                selectionRect.y > bounds.y + bounds.height || selectionRect.y + selectionRect.height < bounds.y) {
                return;
            }
        }
        if (node.interactive && node !== this.scene) {
            this.auxLayer.selectedNodes.add(node);
        }
        for (const child of node.children) {
            this._recursiveBoxSelect(child, selectionRect);
        }
    }

    private onMouseUp(e: MouseEvent) {
        let needsRender = false;

        if (this.auxLayer.activeHandle) {
            this.auxLayer.activeHandle = null;
            this.auxLayer.alignmentLines = [];
            this.renderer.ctx.canvas.style.cursor = 'default';
            needsRender = true;
        }

        if (this.isBoxSelecting && this.auxLayer.selectionRect) {
            const start = this.auxLayer.selectionRect.start;
            const end = this.auxLayer.selectionRect.end;
            this.boxSelect(Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1]));
            this.isBoxSelecting = false;
            this.auxLayer.selectionRect = null;
            needsRender = true;
        }

        if (this.auxLayer.draggingNode) {
            this.auxLayer.alignmentLines = [];
            const target = this.auxLayer.dragTargetNode;
            if (target) {
                const topLevelNodes = this.getTopLevelSelectedNodes();

                // 开启批量模式，避免重挂载过程中反复更新空间索引
                if (this.renderer) this.renderer.markStructureDirty();

                for (const draggingNode of topLevelNodes) {
                    // 1. 记录当前的世界坐标
                    const worldPos = vec2.create();
                    const wm = draggingNode.getWorldMatrix(); // 确保获取的是最新的
                    vec2.set(worldPos, wm[6], wm[7]);

                    // 2. 改变层级
                    target.addChild(draggingNode);

                    // 3. 根据新的父节点计算新的局部坐标，保持世界位置不变
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, target.getWorldMatrix());
                    const newLocal = vec2.create();
                    vec2.transformMat3(newLocal, worldPos, invertParent);

                    // 使用 setTransform 减少失效调用
                    draggingNode.setTransform(newLocal[0], newLocal[1], draggingNode.scaleX, draggingNode.scaleY);
                }

                if (this.onStructureChange) this.onStructureChange();
            }
            this.auxLayer.draggingNode = null;
            this.auxLayer.dragTargetNode = null;
            this.dragStartNodesState.clear();
            needsRender = true;
        }

        if (this.isPanning) {
            this.isPanning = false;
        }

        if (needsRender) {
            this.scene.invalidate();
        }
    }

    private onWheel(e: WheelEvent) {
        this.engine.recordInteractionTime();
        e.preventDefault();
        const isZoom = e.ctrlKey || e.deltaMode !== 0;
        if (isZoom) {
            const zoomSpeed = 0.005;
            const scaleChange = 1 - e.deltaY * zoomSpeed;
            const pos = this.getMousePos(e);
            const oldScale = this.cameraScale;
            let newScale = oldScale * scaleChange;
            if (newScale < 0.1) newScale = 0.1;
            if (newScale > 10) newScale = 10;
            const actualScaleChange = newScale / oldScale;
            const mouseX = pos[0];
            const mouseY = pos[1];
            this.cameraX = mouseX - (mouseX - this.cameraX) * actualScaleChange;
            this.cameraY = mouseY - (mouseY - this.cameraY) * actualScaleChange;
            this.cameraScale = newScale;
            this.renderer.setViewTransform(this.cameraX, this.cameraY, this.cameraScale);
        } else {
            this.cameraX -= e.deltaX;
            this.cameraY -= e.deltaY;
            this.renderer.setViewTransform(this.cameraX, this.cameraY, this.cameraScale);
        }
        this.scene.invalidate();
    }
}