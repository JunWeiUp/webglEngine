import { mat3, vec2 } from 'gl-matrix';
import { Transform } from '../core/Transform';
import type { IRenderer } from '../core/IRenderer';
import type { Rect } from '../core/Rect';

/**
 * Node 类
 * 
 * 场景图中的基本节点，具有层级关系（父子节点）。
 * 包含变换信息（Transform）、尺寸、交互状态等。
 */
export class Node {
    /** 变换组件 (位置、旋转、缩放) */
    public transform: Transform = new Transform();
    /** 子节点列表 */
    public children: Node[] = [];
    /** 父节点引用 */
    public parent: Node | null = null;

    /** 宽度 (用于包围盒/点击检测) */
    public width: number = 0;
    /** 高度 (用于包围盒/点击检测) */
    public height: number = 0;

    /** 
     * 世界坐标系下的 AABB 包围盒 (缓存用于快速剔除)
     * 在 updateTransform 中更新
     */
    public worldAABB: Rect | null = null;

    /** 是否可交互 (接收鼠标事件) */
    public interactive: boolean = false;
    /** 是否被鼠标悬停 */
    public isHovered: boolean = false;
    /** 是否被选中 */
    public isSelected: boolean = false;


    /** 节点名称 (调试用) */
    public name: string = "Node";

    /** 是否需要更新子树变换 */
    private _subtreeDirty: boolean = true;

    /** 关联的四叉树节点 (用于高效更新/删除) */
    public quadTreeNode: any = null;

    /** 
     * 空间索引 (仅根节点或需要独立索引的容器持有)
     */
    private _spatialIndex: any = null;

    public get spatialIndex(): any {
        return this._spatialIndex;
    }

    public set spatialIndex(value: any) {
        this._spatialIndex = value;
        // 如果设置了空间索引，自动将现有子树加入索引
        if (value) {
            this.traverse((node) => {
                if (node !== this) {
                    value.insert(node);
                }
            });
        }
    }

    /** 
     * 遍历节点树
     */
    public traverse(callback: (node: Node) => void) {
        callback(this);
        for (const child of this.children) {
            child.traverse(callback);
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
        let p = this.parent;
        while (p && !p._subtreeDirty) {
            p._subtreeDirty = true;
            p = p.parent;
        }
    }

    get x(): number { return this.transform.position[0]; }
    set x(value: number) {
        if (this.transform.position[0] !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setPosition(value, this.y));
            if (this.quadTreeNode) this.quadTreeNode.update(this);
        }
    }

    get y(): number { return this.transform.position[1]; }
    set y(value: number) {
        if (this.transform.position[1] !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setPosition(this.x, value));
            if (this.quadTreeNode) this.quadTreeNode.update(this);
        }
    }

    get scaleX(): number { return this.transform.scale[0]; }
    set scaleX(value: number) {
        if (this.transform.scale[0] !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setScale(value, this.scaleY));
        }
    }

    get scaleY(): number { return this.transform.scale[1]; }
    set scaleY(value: number) {
        if (this.transform.scale[1] !== value) {
            this.markTransformDirty();
            this.invalidateWithSelfBounds(() => this.transform.setScale(this.scaleX, value));
        }
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
            // 必须更新变换，否则渲染时位置不对
            this.updateTransform(this.parent ? this.parent.transform.worldMatrix : null, true);
            this.invalidate(); // 全屏
            return;
        }

        // 2. 实体节点：计算局部脏矩形
        const oldRect = this.getBounds(true); // false = 仅自身，不递归
        
        changeFn();
        this.updateTransform(this.parent!.transform.worldMatrix, true);
        
        const newRect = this.getBounds(true);

        if (oldRect && newRect) {
            this.invalidate(this.unionRect(oldRect, newRect));
        } else if (newRect) {
            this.invalidate(newRect);
        } else if (oldRect) {
            this.invalidate(oldRect);
        } else {
            this.invalidate();
        }
    }

    /**
     * 获取节点及其子节点的合并包围盒 (世界坐标)
     * @param includeChildren 是否包含子节点
     */
    public getBounds(includeChildren: boolean = true): Rect | null {
        // 如果当前节点没有尺寸且没有子节点，返回 null
        if (this.width <= 0 && this.height <= 0 && this.children.length === 0) {
            return null;
        }

        let rect: Rect | null = null;

        // 1. 自身的包围盒
        if (this.worldAABB) {
            rect = { ...this.worldAABB };
        }

        if (!includeChildren) return rect;

        // 2. 合并子节点的包围盒
        for (const child of this.children) {
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
        
        // 结构变化，标记子树脏
        this.markTransformDirty();

        // 如果根节点有空间索引，将子节点及其子树加入索引
        let root = this.getRoot();
        if (root.spatialIndex) {
            child.traverse(n => root.spatialIndex.insert(n));
        }

        if (!first) {
            this.invalidate(); // 结构变化需要重绘
        }
    }

    /**
     * 移除子节点
     * @param child 要移除的子节点
     */
    removeChild(child: Node) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            // 结构变化，标记子树脏
            this.markTransformDirty();

            // 从空间索引移除
            if (child.quadTreeNode) {
                child.quadTreeNode.remove(child);
            } else {
                // 如果没有直接关联的 quadTreeNode，尝试从根索引深度移除
                let root = this.getRoot();
                if (root.spatialIndex) {
                    child.traverse(n => root.spatialIndex.remove(n));
                }
            }

            this.children.splice(index, 1);
            child.parent = null;
            this.invalidate(); // 结构变化需要重绘
        }
    }

    private getRoot(): Node {
        let node: Node = this;
        while (node.parent) {
            node = node.parent;
        }
        return node;
    }

    /**
     * 递归更新变换矩阵
     * @param parentWorldMatrix 父节点的世界变换矩阵
     * @param parentDirty 父节点是否发生变化
     */
    updateTransform(parentWorldMatrix: mat3 | null, parentDirty: boolean = false) {
        // 性能核心：如果父级未变、自身未变且子树也未标记为脏，则跳过整个分支
        if (!parentDirty && !this.transform.dirty && !this._subtreeDirty) {
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
                this.worldAABB = null;
            }
        }

        // 3. 递归更新所有子节点
        // 如果 worldDirty 为 true，子节点必须更新
        // 如果 worldDirty 为 false，仅当 _subtreeDirty 为 true 时才进入子节点
        if (worldDirty || this._subtreeDirty) {
            for (const child of this.children) {
                child.updateTransform(this.transform.worldMatrix, worldDirty);
            }
        }

        // 清除子树脏标记
        this._subtreeDirty = false;
    }

    /**
     * 更新世界 AABB
     */
    private updateWorldAABB() {
        const m = this.transform.worldMatrix;
        const w = this.width;
        const h = this.height;

        // 计算四个角的世界坐标
        // x' = x*m00 + y*m10 + m20
        // y' = x*m01 + y*m11 + m21
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        // 优化：不再创建数组，直接计算
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

        if (!this.worldAABB) {
            this.worldAABB = { x: 0, y: 0, width: 0, height: 0 };
        }
        this.worldAABB.x = minX;
        this.worldAABB.y = minY;
        this.worldAABB.width = maxX - minX;
        this.worldAABB.height = maxY - minY;
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
        mat3.invert(invertMatrix, this.transform.worldMatrix);

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
}
