import { mat3, vec2 } from 'gl-matrix';
import { Transform } from '../core/Transform';
import { Renderer } from '../core/Renderer';
import type { IRenderer } from '../core/IRenderer';
import type { Rect } from '../core/Rect';

/**
 * RBush 数据项接口
 */
export interface NodeSpatialItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    node: Node;
}

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
            this.invalidateWithSelfBounds(() => {
                this._width = value;
                this.markTransformDirty();
            });
        }
    }

    /** 高度 (用于包围盒/点击检测) */
    private _height: number = 0;
    public get height(): number { return this._height; }
    public set height(value: number) {
        if (this._height !== value) {
            this.invalidateWithSelfBounds(() => {
                this._height = value;
                this.markTransformDirty();
            });
        }
    }

    /** 世界坐标系下的 AABB 包围盒 (扁平化存储以节省内存) */
    public worldMinX: number = Infinity;
    public worldMinY: number = Infinity;
    public worldMaxX: number = -Infinity;
    public worldMaxY: number = -Infinity;

    /** 渲染顺序 (由 Renderer 计算，反映场景树的前序遍历顺序) */
    public renderOrder: number = 0;

    /** 空间索引数据项 (RBush 使用) */
    public spatialItem: NodeSpatialItem | null = null;

    /** 状态位掩码 */
    private _flags: number = 24; // 默认 BIT_SUBTREE_DIRTY(8) | BIT_SPATIAL_DIRTY(16) 为 1
    private static readonly BIT_INTERACTIVE = 1;
    private static readonly BIT_HOVERED = 2;
    private static readonly BIT_SELECTED = 4;
    private static readonly BIT_SUBTREE_DIRTY = 8;
    private static readonly BIT_SPATIAL_DIRTY = 16;

    public get interactive(): boolean { return (this._flags & Node.BIT_INTERACTIVE) !== 0; }
    public set interactive(v: boolean) { if (v) this._flags |= Node.BIT_INTERACTIVE; else this._flags &= ~Node.BIT_INTERACTIVE; }
    
    public get isHovered(): boolean { return (this._flags & Node.BIT_HOVERED) !== 0; }
    public set isHovered(v: boolean) { if (v) this._flags |= Node.BIT_HOVERED; else this._flags &= ~Node.BIT_HOVERED; }
    
    public get isSelected(): boolean { return (this._flags & Node.BIT_SELECTED) !== 0; }
    public set isSelected(v: boolean) { if (v) this._flags |= Node.BIT_SELECTED; else this._flags &= ~Node.BIT_SELECTED; }

    public get subtreeDirty(): boolean { return (this._flags & Node.BIT_SUBTREE_DIRTY) !== 0; }
    public set subtreeDirty(v: boolean) { 
        if (v && !(this._flags & Node.BIT_SUBTREE_DIRTY)) {
            this._flags |= Node.BIT_SUBTREE_DIRTY;
            if (this.parent) this.parent.subtreeDirty = true;
        } else if (!v) {
            this._flags &= ~Node.BIT_SUBTREE_DIRTY;
        }
    }

    /** 空间数据是否过期（需要更新 RBush） */
    public get spatialDirty(): boolean { return (this._flags & Node.BIT_SPATIAL_DIRTY) !== 0; }
    public set spatialDirty(v: boolean) {
        if (v && !(this._flags & Node.BIT_SPATIAL_DIRTY)) {
            this._flags |= Node.BIT_SPATIAL_DIRTY;
            // 当父节点空间失效时，所有子节点的世界 AABB 也会失效
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
     * 标记节点变换为脏，并通知父节点子树已脏
     */
    public markTransformDirty() {
        this.transform.dirty = true;
        this.spatialDirty = true; // 变换改变，空间位置必然失效
        let p = this.parent;
        while (p && !p.subtreeDirty) {
            p.subtreeDirty = true;
            p = p.parent;
        }
    }

    /**
     * 获取当前节点的世界变换矩阵 (按需计算)
     * 如果该节点或其任何祖先节点的变换已脏，则会递归向上回溯并重新计算。
     */
    public getWorldMatrix(): mat3 {
        // 核心修复：如果自身空间标记为脏（意味着自身或任何祖先发生了变动），则必须重新计算
        if (!this.spatialDirty && !this.transform.dirty) {
            return this.transform.worldMatrix;
        }

        // 向上回溯找到最顶层的脏祖先
        const path: Node[] = [];
        let current: Node | null = this;
        while (current) {
            path.push(current);
            // 如果遇到一个既不 spatialDirty 也不 transform.dirty 的节点，说明其 worldMatrix 是可靠的
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
            // 注意：不要直接调用 setter，避免多余的向下递归
            node._flags &= ~Node.BIT_SPATIAL_DIRTY;
        }

        return this.transform.worldMatrix;
    }

    get x(): number { return this.transform.x; }
    set x(value: number) {
        if (this.transform.x !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setPosition(value, this.y));
        }
    }

    get y(): number { return this.transform.y; }
    set y(value: number) {
        if (this.transform.y !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setPosition(this.x, value));
        }
    }

    get scaleX(): number { return this.transform.scaleX; }
    set scaleX(value: number) {
        if (this.transform.scaleX !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setScale(value, this.scaleY));
        }
    }

    get scaleY(): number { return this.transform.scaleY; }
    set scaleY(value: number) {
        if (this.transform.scaleY !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setScale(this.scaleX, value));
        }
    }

    /**
     * 同时设置位置和缩放，减少冗余计算和失效通知
     */
    public setTransform(x: number, y: number, scaleX: number, scaleY: number) {
        const trans = this.transform;
        if (trans.x === x && trans.y === y && 
            trans.scaleX === scaleX && trans.scaleY === scaleY) {
            return;
        }

        this.markTransformDirty();

        this.invalidateWithSelfBounds(() => {
            trans.setTransform(x, y, scaleX, scaleY);
        });
    }

    /**
     * 同时设置位置和尺寸，减少冗余计算和失效通知
     */
    public set(x: number, y: number, width: number, height: number) {
        if (this.transform.x === x && this.transform.y === y && 
            this._width === width && this._height === height) {
            return;
        }

        this.markTransformDirty();

        this.invalidateWithSelfBounds(() => {
            this.transform.setPosition(x, y);
            this._width = width;
            this._height = height;
        });
    }

    get rotation(): number { return this.transform.rotation; }
    set rotation(value: number) {
        if (this.transform.rotation !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setRotation(value));
        }
    }

    /**
     * 智能脏矩形计算
     * - 如果是根节点或无尺寸的容器节点，直接触发全屏重绘 (避免递归计算)
     * - 如果是实体节点 (有宽高)，计算自身局部脏矩形 (O(1))
     */
    private invalidateWithSelfBounds(changeFn: () => void) {
        // 1. 如果是根节点，或者自身无尺寸(容器)，直接全屏重绘，跳过所有计算
        if (this.parent === null || (this.width <= 0 && this.height <= 0)) {
            changeFn();
            // 移除这里的 updateTransform 递归调用！
            // 渲染器的 render() 会在每一帧开始时统一调用 scene.updateTransform(null, false)
            // 它会利用 subtreeDirty 标记进行按需更新，性能远高于这里的强制递归更新
            this.invalidate(); // 全屏信号
            return;
        }

        // 2. 实体节点：计算局部脏矩形 (O(1))
        const oldRect = this.getBounds(true);
        changeFn();
        // 这里也不需要 updateTransform，因为我们只需标记脏。
        // getBounds(true) 会在内部自动按需更新当前节点的变换（而非整个子树）。
        const newRect = this.getBounds(true);

        if (oldRect) this.invalidate(oldRect);
        if (newRect) this.invalidate(newRect);
    }

    /**
     * 获取节点及其子节点的合并包围盒 (世界坐标)
     * @param includeChildren 是否包含子节点
     */
    public getBounds(includeChildren: boolean = true): Rect | null {
        // 如果当前节点没有尺寸且没有子节点，返回 null
        if (this.width <= 0 && this.height <= 0 && (!this._children || this._children.length === 0)) {
            return null;
        }

        let rect: Rect | null = null;

        // 1. 自身的包围盒
        if (this.worldMinX !== Infinity) {
            rect = { 
                x: this.worldMinX, 
                y: this.worldMinY, 
                width: this.worldMaxX - this.worldMinX, 
                height: this.worldMaxY - this.worldMinY 
            };
        }

        if (!includeChildren || !this._children) return rect;

        // 2. 合并子节点的包围盒
        for (const child of this._children) {
            const childBounds = child.getBounds(true);
            if (childBounds) {
                if (rect) {
                    rect = this.unionRect(rect, childBounds);
                } else {
                    rect = childBounds;
                }
            }
        }

        return rect;
    }

    private unionRect(r1: Rect, r2: Rect): Rect {
        const minX = Math.min(r1.x, r2.x);
        const minY = Math.min(r1.y, r2.y);
        const maxX = Math.max(r1.x + r1.width, r2.x + r2.width);
        const maxY = Math.max(r1.y + r1.height, r2.y + r2.height);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * 添加子节点
     * @param child 要添加的子节点
     */
    addChild(child: Node, first: boolean = false) {
        // 如果子节点已有父节点，先从原父节点移除
        if (child.parent) {
            child.parent.removeChild(child);
        }
        
        child.parent = this;
        this.children.push(child);
        
        // 结构变化：
        // 1. 标记当前节点的子树已脏
        this.subtreeDirty = true;
        // 2. 标记新加入子节点及其整个子树的空间位置失效
        child.spatialDirty = true;

        if (!first) {
            this.invalidate(); // 结构变化需要重绘
        }

        // 通知渲染器结构已改变
        if (Renderer.instance) {
            Renderer.instance.markStructureDirty();
        }
    }

    /**
     * 移除子节点
     * @param child 要移除的子节点
     */
    removeChild(child: Node) {
        if (!this._children) return;
        const index = this._children.indexOf(child);
        if (index !== -1) {
            this._children.splice(index, 1);
            
            // 结构变化：
            // 1. 标记当前节点的子树已脏
            this.subtreeDirty = true;
            
            child.parent = null;
            // 2. 脱离父节点，世界坐标失效
            child.spatialDirty = true; 
            
            this.invalidate(); // 结构变化需要重绘

            // 通知渲染器结构已改变
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
     * 递归更新变换矩阵
     * @param parentWorldMatrix 父节点的世界变换矩阵
     * @param parentDirty 父节点是否发生变化
     */
    updateTransform(parentWorldMatrix: mat3 | null, parentDirty: boolean = false) {
        // 执行自定义更新逻辑 (如内存回收检查)
        this.onUpdate();

        // 性能核心：如果父级未变、自身未变且子树也未标记为脏，则跳过整个分支
        if (!parentDirty && !this.transform.dirty && !this.subtreeDirty) {
            return;
        }

        // 1. 更新自身的局部矩阵 (如果 dirty)
        const localDirty = this.transform.dirty;
        this.transform.updateLocalTransform(); // 会清除 transform.dirty

        let worldDirty = parentDirty;

        if (localDirty || parentDirty) {
            this.transform.updateWorldTransform(parentWorldMatrix);
            worldDirty = true;

            // 2. 更新 World AABB (如果节点有尺寸)
            if (this.width > 0 && this.height > 0) {
                this.updateWorldAABB();
            } else {
                this.worldMinX = Infinity;
                this.worldMinY = Infinity;
                this.worldMaxX = -Infinity;
                this.worldMaxY = -Infinity;
            }
        }

        // 3. 递归更新所有子节点
        // 如果 worldDirty 为 true，子节点必须更新
        // 如果 worldDirty 为 false，仅当 subtreeDirty 为 true 时才进入子节点
        if (this._children && (worldDirty || this.subtreeDirty)) {
            for (const child of this._children) {
                child.updateTransform(this.transform.worldMatrix, worldDirty);
            }
        }

        // 清除子树脏标记
        this.subtreeDirty = false;
    }

    /**
     * 更新世界 AABB
     */
    public updateWorldAABB() {
        if (this.width <= 0 || this.height <= 0) {
            this.worldMinX = Infinity;
            this.worldMinY = Infinity;
            this.worldMaxX = -Infinity;
            this.worldMaxY = -Infinity;
            return;
        }

        const m = this.getWorldMatrix();
        const w = this.width;
        const h = this.height;

        // 计算四个角的世界坐标
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        // 0,0
        let wx = m[6];
        let wy = m[7];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;

        // w,0
        wx = w * m[0] + m[6];
        wy = w * m[1] + m[7];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;

        // 0,h
        wx = h * m[3] + m[6];
        wy = h * m[4] + m[7];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;

        // w,h
        wx = w * m[0] + h * m[3] + m[6];
        wy = w * m[1] + h * m[4] + m[7];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;

        this.worldMinX = minX;
        this.worldMinY = minY;
        this.worldMaxX = maxX;
        this.worldMaxY = maxY;
    }

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
