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
    private isResizing: boolean = false;
    private resizingNode: Node | null = null;
    private resizingHandle: string | null = null;

    // 摄像机状态 (取代直接修改 scene 坐标)
    private cameraX: number = 0;
    private cameraY: number = 0;
    private cameraScale: number = 1;

    // 记录上一帧的鼠标位置 (用于计算 delta)
    private lastMousePos: vec2 = vec2.create();
    // 框选起始点
    private boxSelectStart: vec2 = vec2.create();

    // 缩放手柄光标映射
    private static readonly HANDLE_CURSORS: Record<string, string> = {
        'nw': 'nwse-resize',
        'n': 'ns-resize',
        'ne': 'nesw-resize',
        'e': 'ew-resize',
        'se': 'nwse-resize',
        's': 'ns-resize',
        'sw': 'nesw-resize',
        'w': 'ew-resize'
    };

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
     * 递归碰撞检测
     * @param node 当前节点
     * @param screenPos 屏幕坐标 (0,0 在左上角)
     * @param worldPos 世界坐标 (受摄像机影响)
     */
    private hitTest(node: Node, screenPos: vec2, worldPos: vec2): Node | null {
        // 0. 剪枝优化：如果点击点不在节点的包围盒内，跳过该子树
        // 注意：Scene 根节点通常没有有效的 worldMinX，所以排除它
        if (node.parent && node.worldMinX !== Infinity) {
            const testPos = node.ignoreCamera ? screenPos : worldPos;
            if (testPos[0] < node.worldMinX - 0.5 || testPos[0] > node.worldMaxX + 0.5 ||
                testPos[1] < node.worldMinY - 0.5 || testPos[1] > node.worldMaxY + 0.5) {
                return null;
            }
        }

        // 1. 先递归检测子节点 (后添加的子节点在最上面)
        const children = node.children;
        for (let i = children.length - 1; i >= 0; i--) {
            const hit = this.hitTest(children[i], screenPos, worldPos);
            if (hit) return hit;
        }

        // 2. 检测当前节点
        // 根据节点属性选择检测坐标空间
        if (node.interactive) {
            const testPos = (node as any).ignoreCamera ? screenPos : worldPos;
            if (node.hitTest(testPos)) {
                return node;
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
     * 鼠标按下事件处理
     */
    private onMouseDown(e: MouseEvent) {
        const pos = this.getMousePos(e);
        const worldPos = this.getWorldMousePos(pos);
        this.lastMousePos = pos;

        // 1. 优先检查缩放手柄 (Resize Handles)
        const viewMatrix = this.renderer.getViewMatrix();
        for (const node of this.auxLayer.selectedNodes) {
            const handle = this.auxLayer.getHandleAt(node, viewMatrix, pos[0], pos[1]);
            if (handle) {
                this.isResizing = true;
                this.resizingNode = node;
                this.resizingHandle = handle;
                this.renderer.ctx.canvas.style.cursor = InteractionManager.HANDLE_CURSORS[handle] || 'default';
                this.scene.invalidate();
                return;
            }
        }

        if (e.shiftKey) {
            this.isBoxSelecting = true;
            vec2.copy(this.boxSelectStart, worldPos);
            this.auxLayer.selectionRect = { start: vec2.clone(worldPos), end: vec2.clone(worldPos) };
            this.auxLayer.selectedNodes.clear();
            this.scene.invalidate();
            return;
        }

        const hit = this.hitTest(this.scene, pos, worldPos);

        if (hit) {
            if (this.auxLayer.selectedNodes.has(hit)) {
                this.auxLayer.draggingNode = hit;
                vec2.copy(this.auxLayer.dragProxyPos, worldPos);
            } else {
                this.auxLayer.selectedNodes.clear();
                this.auxLayer.selectedNodes.add(hit);
                this.auxLayer.draggingNode = hit;
                vec2.copy(this.auxLayer.dragProxyPos, worldPos);
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
        const pos = this.getMousePos(e);
        const worldPos = this.getWorldMousePos(pos);
        const deltaX = pos[0] - this.lastMousePos[0];
        const deltaY = pos[1] - this.lastMousePos[1];

        // 处理缩放逻辑
        if (this.isResizing && this.resizingNode && this.resizingHandle) {
            const node = this.resizingNode;
            const handle = this.resizingHandle;
            
            this.renderer.ctx.canvas.style.cursor = InteractionManager.HANDLE_CURSORS[handle] || 'default';

            // 根据节点是否忽略摄像机来决定增量计算方式
            const isIgnoreCamera = (node as any).ignoreCamera;
            const dx = isIgnoreCamera ? deltaX : deltaX / this.cameraScale;
            const dy = isIgnoreCamera ? deltaY : deltaY / this.cameraScale;

            // 获取父节点的逆矩阵，将屏幕/世界空间增量转换回父节点局部空间
            const parent = node.parent;
            let localDeltaX = dx;
            let localDeltaY = dy;

            if (parent) {
                const invertParent = mat3.create();
                mat3.invert(invertParent, parent.transform.worldMatrix);
                const m = invertParent;
                localDeltaX = dx * m[0] + dy * m[3];
                localDeltaY = dx * m[1] + dy * m[4];
            }

            // 根据手柄类型更新尺寸和位置
            if (handle.includes('e')) {
                node.layoutWidth = Math.max(1, (node.width || 0) + localDeltaX);
            }
            if (handle.includes('s')) {
                node.layoutHeight = Math.max(1, (node.height || 0) + localDeltaY);
            }
            if (handle.includes('w')) {
                const dw = Math.min(node.width - 1, localDeltaX);
                node.x += dw;
                node.layoutWidth = node.width - dw;
            }
            if (handle.includes('n')) {
                const dh = Math.min(node.height - 1, localDeltaY);
                node.y += dh;
                node.layoutHeight = node.height - dh;
            }

            // 强制重新计算布局
            const root = this.engine.scene;
            root.calculateLayout(this.renderer.width, this.renderer.height);
            
            this.lastMousePos = pos;
            this.scene.invalidate();
            return;
        }

        if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1 && !this.isBoxSelecting) {
            return;
        }

        let needsRender = false;

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

        if (!this.auxLayer.draggingNode && !this.isPanning && !this.isBoxSelecting && !this.isResizing) {
            // 优先检查手柄悬停
            const viewMatrix = this.renderer.getViewMatrix();
            let handleHovered = false;
            for (const node of this.auxLayer.selectedNodes) {
                const handle = this.auxLayer.getHandleAt(node, viewMatrix, pos[0], pos[1]);
                if (handle) {
                    this.renderer.ctx.canvas.style.cursor = InteractionManager.HANDLE_CURSORS[handle] || 'default';
                    handleHovered = true;
                    break;
                }
            }

            if (!handleHovered) {
                const hit = this.hitTest(this.scene, pos, worldPos);
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
        }

        if (this.auxLayer.draggingNode) {
            const draggingNode = this.auxLayer.draggingNode;
            const topLevelNodes = this.getTopLevelSelectedNodes();
            
            for (const node of topLevelNodes) {
                const parent = node.parent;
                if (parent) {
                    // 根据节点是否忽略摄像机来决定增量计算方式
                    const isIgnoreCamera = (node as any).ignoreCamera;
                    const dx = isIgnoreCamera ? deltaX : deltaX / this.cameraScale;
                    const dy = isIgnoreCamera ? deltaY : deltaY / this.cameraScale;

                    const invertParent = mat3.create();
                    mat3.invert(invertParent, parent.transform.worldMatrix);
                    const m = invertParent;
                    
                    // 将屏幕/世界空间增量转换回父节点局部空间
                    const localDeltaX = dx * m[0] + dy * m[3];
                    const localDeltaY = dx * m[1] + dy * m[4];
                    
                    node.x += localDeltaX;
                    node.y += localDeltaY;
                }
            }

            const originalInteractives = new Map<Node, boolean>();
            for (const node of topLevelNodes) {
                originalInteractives.set(node, node.interactive);
                node.interactive = false;
            }

            const hit = this.hitTest(this.scene, pos, worldPos);

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
        this._recursiveBoxSelect(this.scene, selectionRect);
    }

    private _recursiveBoxSelect(node: Node, selectionRect: Rect) {
        if (node.worldMinX !== Infinity) {
            if (selectionRect.x > node.worldMaxX || selectionRect.x + selectionRect.width < node.worldMinX ||
                selectionRect.y > node.worldMaxY || selectionRect.y + selectionRect.height < node.worldMinY) {
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

        if (this.isResizing) {
            this.isResizing = false;
            this.resizingNode = null;
            this.resizingHandle = null;
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
            const target = this.auxLayer.dragTargetNode;
            if (target) {
                const topLevelNodes = this.getTopLevelSelectedNodes();
                for (const draggingNode of topLevelNodes) {
                    const worldPos = vec2.create();
                    const wm = draggingNode.transform.worldMatrix;
                    vec2.set(worldPos, wm[6], wm[7]);
                    target.addChild(draggingNode);
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, target.transform.worldMatrix);
                    const newLocal = vec2.create();
                    vec2.transformMat3(newLocal, worldPos, invertParent);
                    draggingNode.x = newLocal[0];
                    draggingNode.y = newLocal[1];
                }
                if (this.onStructureChange) this.onStructureChange();
            }
            this.auxLayer.draggingNode = null;
            this.auxLayer.dragTargetNode = null;
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