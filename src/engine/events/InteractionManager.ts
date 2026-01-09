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
        // 1. 递归检测子节点 (后添加的子节点在数组末尾，先渲染，因此先检测)
        const children = node.children;
        for (let i = children.length - 1; i >= 0; i--) {
            const hit = this.hitTest(children[i], worldPos);
            if (hit) return hit;
        }

        // 2. 检测当前节点
        if (node.interactive && node !== this.scene) {
            // 使用 AABB 包围盒进行快速初步检测
            if (worldPos[0] >= node.worldMinX && worldPos[0] <= node.worldMaxX &&
                worldPos[1] >= node.worldMinY && worldPos[1] <= node.worldMaxY) {
                
                // 进一步精确检测：将世界坐标转换到节点的局部坐标系
                const localPos = vec2.create();
                const invertWorld = mat3.create();
                mat3.invert(invertWorld, node.transform.worldMatrix);
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
     * 鼠标按下事件处理
     */
    private onMouseDown(e: MouseEvent) {
        const pos = this.getMousePos(e);
        const worldPos = this.getWorldMousePos(pos);
        this.lastMousePos = pos;

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

        if (!this.auxLayer.draggingNode && !this.isPanning && !this.isBoxSelecting) {
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
            const worldDeltaX = deltaX / this.cameraScale;
            const worldDeltaY = deltaY / this.cameraScale;

            for (const node of topLevelNodes) {
                const parent = node.parent;
                if (parent) {
                    const invertParent = mat3.create();
                    mat3.invert(invertParent, parent.transform.worldMatrix);
                    const m = invertParent;
                    const localDeltaX = worldDeltaX * m[0] + worldDeltaY * m[3];
                    const localDeltaY = worldDeltaX * m[1] + worldDeltaY * m[4];
                    node.x += localDeltaX;
                    node.y += localDeltaY;
                }
            }

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
                
                // 开启批量模式，避免重挂载过程中反复更新 RBush
                this.renderer.beginSpatialBatch();

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

                this.renderer.endSpatialBatch();

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