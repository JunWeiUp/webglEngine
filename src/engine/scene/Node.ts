import { mat3, vec2 } from 'gl-matrix';
import { Transform } from '../math/Transform';
import { Renderer } from '../rendering/Renderer';
import type { IRenderer } from '../rendering/IRenderer';
import type { Rect } from '../math/Rect';
import { MatrixSpatialIndex } from './MatrixSpatialIndex';
import type { NodeStyle, NodeEffects } from './Effects';

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
    public transform: Transform = new Transform();

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
            const oldWidth = this._width;
            this._width = value;
            this.onResize(oldWidth, this._height, value, this._height);
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
            const oldHeight = this._height;
            this._height = value;
            this.onResize(this._width, oldHeight, this._width, value);
            this.markTransformDirty();
            this.syncSpatialIndex();
            this.invalidate();
        }
    }

    private onResize(oldW: number, oldH: number, newW: number, newH: number) {
        if (!this._children || this._children.length === 0) return;
        if (oldW === 0 || oldH === 0) return; // Prevent division by zero

        for (const child of this._children) {
            const constraints = child.style.constraints;
            if (!constraints) continue;

            // Horizontal
            if (newW !== oldW) {
                switch (constraints.horizontal) {
                    case 'max': // Right
                        child.setPosition(child.x + (newW - oldW), child.y);
                        break;
                    case 'center':
                        child.setPosition(child.x + (newW - oldW) / 2, child.y);
                        break;
                    case 'scale':
                        const ratioX = newW / oldW;
                        child.setTransform(child.x * ratioX, child.y, child.scaleX, child.scaleY);
                        child.width *= ratioX;
                        break;
                    case 'both':
                        const rightDist = oldW - (child.x + child.width);
                        child.width = newW - child.x - rightDist;
                        break;
                }
            }

            // Vertical
            if (newH !== oldH) {
                switch (constraints.vertical) {
                    case 'max': // Bottom
                        child.setPosition(child.x, child.y + (newH - oldH));
                        break;
                    case 'center':
                        child.setPosition(child.x, child.y + (newH - oldH) / 2);
                        break;
                    case 'scale':
                        const ratioY = newH / oldH;
                        child.setTransform(child.x, child.y * ratioY, child.scaleX, child.scaleY);
                        child.height *= ratioY;
                        break;
                    case 'both':
                        const bottomDist = oldH - (child.y + child.height);
                        child.height = newH - child.y - bottomDist;
                        break;
                }
            }
        }
    }

    /** 渲染顺序 (由 Renderer 计算，反映场景树的前序遍历顺序) */
    public renderOrder: number = 0;
    /** 子树的最大渲染顺序 (用于判断子树范围) */
    public endOrder: number = 0;

    /** 用于管理直接子节点的空间索引 (MatrixSpatialIndex) */
    public childSpatialIndex: MatrixSpatialIndex | null = null;

    /** 状态位掩码 */
    private _flags: number = 16 | 32; // 默认 BIT_SPATIAL_DIRTY(16) | BIT_VISIBLE(32) 为 1
    private static readonly BIT_INTERACTIVE = 1;
    private static readonly BIT_HOVERED = 2;
    private static readonly BIT_SELECTED = 4;
    private static readonly BIT_LOCKED = 8;
    private static readonly BIT_SPATIAL_DIRTY = 16;
    private static readonly BIT_VISIBLE = 32;

    public get interactive(): boolean { return (this._flags & Node.BIT_INTERACTIVE) !== 0; }
    public set interactive(v: boolean) { if (v) this._flags |= Node.BIT_INTERACTIVE; else this._flags &= ~Node.BIT_INTERACTIVE; }

    public get isHovered(): boolean { return (this._flags & Node.BIT_HOVERED) !== 0; }
    public set isHovered(v: boolean) { if (v) this._flags |= Node.BIT_HOVERED; else this._flags &= ~Node.BIT_HOVERED; }

    public get isSelected(): boolean { return (this._flags & Node.BIT_SELECTED) !== 0; }
    public set isSelected(v: boolean) { if (v) this._flags |= Node.BIT_SELECTED; else this._flags &= ~Node.BIT_SELECTED; }

    public get locked(): boolean { return (this._flags & Node.BIT_LOCKED) !== 0; }
    public set locked(v: boolean) { 
        if (this.locked === v) return;
        if (v) this._flags |= Node.BIT_LOCKED; 
        else this._flags &= ~Node.BIT_LOCKED; 
        this.invalidate();
    }

    public get visible(): boolean { return (this._flags & Node.BIT_VISIBLE) !== 0; }
    public set visible(v: boolean) { 
        if (v) this._flags |= Node.BIT_VISIBLE; 
        else this._flags &= ~Node.BIT_VISIBLE; 
        this.invalidate();
    }

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

    /** 样式配置 (矩形、背景、圆角等) */
    private _style: NodeStyle = {};
    public get style(): NodeStyle { return this._style; }
    public set style(value: NodeStyle) {
        this._style = { ...this._style, ...value };
        this.invalidate();
    }

    /** 效果配置 (阴影、模糊等) */
    private _effects: NodeEffects = {};
    public get effects(): NodeEffects { return this._effects; }
    public set effects(value: NodeEffects) {
        this._effects = { ...this._effects, ...value };
        this.invalidate();
    }

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
        this.invalidate();
    }

    /**
     * 设置缩放
     */
    public setScale(x: number, y: number) {
        const trans = this.transform;
        if (trans.scaleX === x && trans.scaleY === y) {
            return;
        }

        trans.setScale(x, y);
        this.markTransformDirty();
        this.syncSpatialIndex();
        this.invalidate();
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
     * @param child 子节点
     * @param indexOrSilent 插入位置 (number) 或 是否静默添加 (boolean, 不触发 invalidate 和空间索引更新)
     */
    addChild(child: Node, indexOrSilent: number | boolean = -1) {
        const index = typeof indexOrSilent === 'number' ? indexOrSilent : -1;
        const silent = typeof indexOrSilent === 'boolean' ? indexOrSilent : false;

        if (child.parent === this && index === -1) return;
        
        if (child.parent) {
            child.parent.removeChild(child);
        }

        child.parent = this;
        
        if (index === -1 || index >= this.children.length) {
            this.children.push(child);
        } else {
            this.children.splice(index, 0, child);
        }

        if (!silent) {
            // 延迟初始化空间索引
            if (!this.childSpatialIndex) {
                this.childSpatialIndex = new MatrixSpatialIndex();
                // 使用 load 批量初始化，比逐个 update 快得多
                this.childSpatialIndex.load(this.children);
            } else {
                this.childSpatialIndex.update(child);
            }

            child.spatialDirty = true;
            this.invalidate();

            if (Renderer.instance) {
                Renderer.instance.markStructureDirty();
            }
        } else {
            // 静默模式下只标记 dirty，不更新索引，不 invalidate
            child.spatialDirty = true;
        }
    }

    /**
     * 批量添加子节点
     * @param children 子节点列表
     * @param silent 是否静默添加
     */
    addChildren(children: Node[], silent: boolean = false) {
        for (const child of children) {
            if (child.parent) {
                child.parent.removeChild(child);
            }
            child.parent = this;
            this.children.push(child);
            child.spatialDirty = true;
        }

        if (!silent) {
            if (!this.childSpatialIndex) {
                this.childSpatialIndex = new MatrixSpatialIndex();
            }
            this.childSpatialIndex.load(children);
            
            this.invalidate();
            if (Renderer.instance) {
                Renderer.instance.markStructureDirty();
            }
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
     * WebGL 渲染方法
     * 基类处理背景样式和效果
     * @param renderer 渲染器实例
     * @param dirtyRect 当前渲染的脏矩形 (可选)
     */
    renderWebGL(renderer: IRenderer, _dirtyRect?: Rect) {
        // 优化：仅在确实有样式或效果且具有可见性时才触发特效渲染
        const style = this.style;
        const hasBg = style.backgroundColor && style.backgroundColor[3] > 0;
        const hasBorder = style.borderWidth && style.borderWidth > 0 && style.borderColor && style.borderColor[3] > 0;
        
        const hasVisibleStyle = hasBg || hasBorder;
        const hasEffects = (this.effects.outerShadow && this.effects.outerShadow.color[3] > 0) ||
                           (this.effects.innerShadow && this.effects.innerShadow.color[3] > 0) ||
                           (this.effects.backgroundBlur && this.effects.backgroundBlur > 0);
        
        if (this.width > 0 && this.height > 0 && (hasVisibleStyle || hasEffects)) {
            renderer.drawRectWithEffects(this);
        }
    }

    /**
     * Canvas 2D 渲染方法 (降级或特殊层使用)
     * @param _renderer 渲染器实例
     */
    renderCanvas(_renderer: IRenderer) {
        // 默认不实现，子类按需覆盖
    }

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
