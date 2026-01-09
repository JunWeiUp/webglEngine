import { mat3, vec2 } from 'gl-matrix';
import { Transform } from '../core/Transform';
import { Renderer } from '../core/Renderer';
import type { IRenderer } from '../core/IRenderer';
import type { Rect } from '../core/Rect';
import { MatrixSpatialIndex } from '../core/MatrixSpatialIndex';

/**
 * Node 类
 * 
 * 场景图中的基本节点，具有层级关系（父子节点）。
 * 包含变换信息（Transform）、尺寸、交互状态等。
 */
export class Node {
    private static _nextId = 0;
    public readonly id = Node._nextId++;

    /** 变换组件 (位置、旋转、缩放) */
    public transform: Transform = new Transform(this.id);

    /** 子节点列表 (延迟初始化) */
    private _children: Node[] | null = null;

    public get children(): Node[] {
        if (!this._children) {
            this._children = [];
        }
        return this._children;
    }

    /** 父节点引用 */
    public parent: Node | null = null;

    /** 宽度 (用于包围盒/点击检测) */
    private _width: number = 0;
    public get width(): number { return this._width; }
    public set width(value: number) {
        if (this._width !== value) {
            this._width = value;
            this.markTransformDirty();
            this.syncSpatialIndex();
            this.invalidate();
        }
    }

    /** 高度 (用于包围盒/点击检测) */
    private _height: number = 0;
    public get height(): number { return this._height; }
    public set height(value: number) {
        if (this._height !== value) {
            this._height = value;
            this.markTransformDirty();
            this.syncSpatialIndex();
            this.invalidate();
        }
    }

    /** 渲染顺序 (由 Renderer 计算，反映场景树的前序遍历顺序) */
    public renderOrder: number = 0;

    /** 用于管理直接子节点的空间索引 (MatrixSpatialIndex) */
    public childSpatialIndex: MatrixSpatialIndex | null = null;

    /** 状态位掩码 */
    private _flags: number = 16; // 默认 BIT_SPATIAL_DIRTY(16) 为 1
    private static readonly BIT_INTERACTIVE = 1;
    private static readonly BIT_HOVERED = 2;
    private static readonly BIT_SELECTED = 4;
    private static readonly BIT_SPATIAL_DIRTY = 16;

    public get interactive(): boolean { return (this._flags & Node.BIT_INTERACTIVE) !== 0; }
    public set interactive(v: boolean) { if (v) this._flags |= Node.BIT_INTERACTIVE; else this._flags &= ~Node.BIT_INTERACTIVE; }

    public get isHovered(): boolean { return (this._flags & Node.BIT_HOVERED) !== 0; }
    public set isHovered(v: boolean) { if (v) this._flags |= Node.BIT_HOVERED; else this._flags &= ~Node.BIT_HOVERED; }

    public get isSelected(): boolean { return (this._flags & Node.BIT_SELECTED) !== 0; }
    public set isSelected(v: boolean) { if (v) this._flags |= Node.BIT_SELECTED; else this._flags &= ~Node.BIT_SELECTED; }

    /** 空间数据是否过期 */
    public get spatialDirty(): boolean { return (this._flags & Node.BIT_SPATIAL_DIRTY) !== 0; }
    public set spatialDirty(v: boolean) {
        if (v && !(this._flags & Node.BIT_SPATIAL_DIRTY)) {
            this._flags |= Node.BIT_SPATIAL_DIRTY;
            // 当父节点空间失效时，所有子节点的世界矩阵也会失效 (延迟更新)
            if (this._children) {
                for (const child of this._children) {
                    child.spatialDirty = true;
                }
            }
        } else if (!v) {
            this._flags &= ~Node.BIT_SPATIAL_DIRTY;
        }
    }

    /** 节点名称 (调试用，可选以节省内存) */
    public name?: string;

    /** 
     * 遍历节点树
     */
    public traverse(callback: (node: Node) => void) {
        callback(this);
        if (this._children) {
            for (const child of this._children) {
                child.traverse(callback);
            }
        }
    }

    /** LOD 控制：可见的最小缩放比例 */
    public minVisibleScale: number = 0;
    /** LOD 控制：可见的最大缩放比例 */
    public maxVisibleScale: number = Infinity;

    /** 
     * 失效回调
     * 当该节点需要重绘时调用（通常仅在根节点设置此回调，用于通知引擎）
     */
    public onInvalidate: ((rect?: Rect) => void) | null = null;

    constructor() {
    }

    /**
     * 标记节点为脏 (需要重绘)
     * 该请求会向上冒泡直到根节点，触发 onInvalidate
     * @param rect 脏矩形 (世界坐标)
     */
    public invalidate(rect?: Rect) {
        if (this.onInvalidate) {
            this.onInvalidate(rect);
        }
        // 向父节点冒泡
        if (this.parent) {
            this.parent.invalidate(rect);
        }
    }

    // --- Getters/Setters for Dirty Rect Optimization ---

    /**
     * 标记节点变换为脏
     */
    public markTransformDirty() {
        this.transform.dirty = true;
        this.spatialDirty = true;
    }

    /**
     * 获取当前节点的世界变换矩阵 (按需计算)
     * 如果该节点或其任何祖先节点的变换已脏，则会递归向上回溯并重新计算。
     */
    public getWorldMatrix(): mat3 {
        // 如果自身空间标记为脏（意味着自身或任何祖先发生了变动），则必须重新计算
        if (!this.spatialDirty && !this.transform.dirty) {
            return this.transform.worldMatrix;
        }

        // 向上回溯找到最顶层的脏祖先
        const path: Node[] = [];
        let current: Node | null = this;
        while (current) {
            path.push(current);
            if (!current.spatialDirty && !current.transform.dirty) {
                break;
            }
            current = current.parent;
        }

        // 从上往下依次更新
        let parentMatrix: mat3 | null = current ? current.parent?.transform.worldMatrix || null : null;
        for (let i = path.length - 1; i >= 0; i--) {
            const node = path[i];
            node.transform.updateLocalTransform();
            node.transform.updateWorldTransform(parentMatrix);
            parentMatrix = node.transform.worldMatrix;

            // 计算完成后，清除自身的脏标记
            node._flags &= ~Node.BIT_SPATIAL_DIRTY;
        }

        return this.transform.worldMatrix;
    }

    get x(): number { return this.transform.x; }
    get y(): number { return this.transform.y; }
    get scaleX(): number { return this.transform.scaleX; }
    get scaleY(): number { return this.transform.scaleY; }

    /**
     * 同时设置位置和缩放
     */
    public setTransform(x: number, y: number, scaleX: number, scaleY: number) {
        const trans = this.transform;
        if (trans.x === x && trans.y === y &&
            trans.scaleX === scaleX && trans.scaleY === scaleY) {
            return;
        }

        trans.setTransform(x, y, scaleX, scaleY);
        this.markTransformDirty();
        this.syncSpatialIndex();
        this.invalidate();
    }

    /**
     * 设置位置
     */
    public setPosition(x: number, y: number) {
        const trans = this.transform;
        if (trans.x === x && trans.y === y) {
            return;
        }

        trans.setPosition(x, y);
        this.markTransformDirty();
        this.syncSpatialIndex();
        // this.invalidate();
    }

    /**
     * 同步当前节点到父节点的空间索引中
     */
    public syncSpatialIndex() {
        
        if (this.parent && this.parent.childSpatialIndex) {
            this.parent.childSpatialIndex.update(this);
        }
    }

    /**
     * 同时设置位置和尺寸
     */
    public set(x: number, y: number, width: number, height: number) {
        if (this.transform.x === x && this.transform.y === y &&
            this._width === width && this._height === height) {
            return;
        }

        this.transform.setPosition(x, y);
        this._width = width;
        this._height = height;
        
        this.markTransformDirty();
        this.syncSpatialIndex();
        this.invalidate();
    }

    get rotation(): number { return this.transform.rotation; }
    set rotation(value: number) {
        if (this.transform.rotation !== value) {
            this.transform.setRotation(value);
            this.markTransformDirty();
            this.syncSpatialIndex();
            this.invalidate();
        }
    }

    /**
     * 获取节点及其子节点的合并包围盒 (世界坐标)
     * 注意：由于采用了 MatrixSpatialIndex，此方法主要用于调试或特殊需求。
     * @param includeChildren 是否包含子节点
     */
    public getBounds(includeChildren: boolean = true): Rect | null {
        // 如果当前节点没有尺寸且没有子节点，返回 null
        if (this.width <= 0 && this.height <= 0 && (!this._children || this._children.length === 0)) {
            return null;
        }

        const m = this.getWorldMatrix();
        const w = this.width;
        const h = this.height;

        // 计算自身 AABB
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (w > 0 && h > 0) {
            const corners = [
                [0, 0], [w, 0], [0, h], [w, h]
            ];
            for (const [cx, cy] of corners) {
                const wx = cx * m[0] + cy * m[3] + m[6];
                const wy = cx * m[1] + cy * m[4] + m[7];
                if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
                if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
            }
        }

        let rect: Rect | null = minX === Infinity ? null : {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };

        if (!includeChildren || !this._children) return rect;

        // 合并子节点
        for (const child of this._children) {
            const childBounds = child.getBounds(true);
            if (childBounds) {
                if (rect) {
                    const rminX = Math.min(rect.x, childBounds.x);
                    const rminY = Math.min(rect.y, childBounds.y);
                    const rmaxX = Math.max(rect.x + rect.width, childBounds.x + childBounds.width);
                    const rmaxY = Math.max(rect.y + rect.height, childBounds.y + childBounds.height);
                    rect = { x: rminX, y: rminY, width: rmaxX - rminX, height: rmaxY - rminY };
                } else {
                    rect = childBounds;
                }
            }
        }

        return rect;
    }

    /**
     * 添加子节点
     */
    addChild(child: Node, first: boolean = false) {
        if (child.parent === this) return;
        if (child.parent) {
            child.parent.removeChild(child);
        }

        child.parent = this;
        this.children.push(child);

        // 延迟初始化空间索引
        if (!this.childSpatialIndex) {
            this.childSpatialIndex = new MatrixSpatialIndex();
            // 如果已经有其他子节点，也需要加入索引
            for (const c of this.children) {
                this.childSpatialIndex.update(c);
            }
        } else {
            this.childSpatialIndex.update(child);
        }

        child.spatialDirty = true;

        if (!first) {
            this.invalidate();
        }

        if (Renderer.instance) {
            Renderer.instance.markStructureDirty();
        }
    }

    /**
     * 移除子节点
     */
    removeChild(child: Node) {
        if (!this._children) return;
        const index = this._children.indexOf(child);
        if (index !== -1) {
            this._children.splice(index, 1);

            if (this.childSpatialIndex) {
                this.childSpatialIndex.remove(child.id);
            }

            child.parent = null;
            child.spatialDirty = true;

            this.invalidate();

            if (Renderer.instance) {
                Renderer.instance.markStructureDirty();
            }
        }
    }

    public getRoot(): Node {
        let node: Node = this;
        while (node.parent) {
            node = node.parent;
        }
        return node;
    }

    /**
     * 生命周期钩子：每帧更新时调用
     */
    public onUpdate(): void { }

    /**
     * 静态共享变量，用于减少 hitTest 中的 GC
     */
    private static sharedMat3: mat3 = mat3.create();
    private static sharedVec2: vec2 = vec2.create();

    /**
     * 点击检测
     * 判断给定的世界坐标点是否在节点范围内
     * @param worldPoint 世界坐标点
     * @returns 是否命中
     */
    hitTest(worldPoint: vec2): boolean {
        // 使用共享变量计算世界矩阵的逆矩阵
        const invertMatrix = Node.sharedMat3;
        mat3.invert(invertMatrix, this.getWorldMatrix());

        // 使用共享变量存储局部坐标
        const localPoint = Node.sharedVec2;
        vec2.transformMat3(localPoint, worldPoint, invertMatrix);

        // 简单的 AABB 检测 (假设锚点在左上角 0,0)
        return localPoint[0] >= 0 && localPoint[0] <= this.width &&
            localPoint[1] >= 0 && localPoint[1] <= this.height;
    }

    /**
     * WebGL 渲染方法 (需子类实现)
     * @param _renderer 渲染器实例
     */
    renderWebGL(_renderer: IRenderer) { }

    /**
     * 销毁节点及其子节点，释放资源
     */
    dispose() {
        if (this._children) {
            for (const child of this._children) {
                child.dispose();
            }
            this._children = null;
        }

        if (this.parent) {
            this.parent.removeChild(this);
        }
    }
}
