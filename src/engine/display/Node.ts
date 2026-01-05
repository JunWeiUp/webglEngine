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

    /** 
     * 失效回调
     * 当该节点需要重绘时调用（通常仅在根节点设置此回调，用于通知引擎）
     */
    public onInvalidate: (() => void) | null = null;

    constructor() {
    }

    /**
     * 标记节点为脏 (需要重绘)
     * 该请求会向上冒泡直到根节点，触发 onInvalidate
     */
    public invalidate() {
        if (this.onInvalidate) {
            this.onInvalidate();
        }
        // 向父节点冒泡
        if (this.parent) {
            this.parent.invalidate();
        }
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
            this.children.splice(index, 1);
            child.parent = null;
            this.invalidate(); // 结构变化需要重绘
        }
    }

    /**
     * 递归更新变换矩阵
     * @param parentWorldMatrix 父节点的世界变换矩阵
     * @param parentDirty 父节点是否发生变化
     */
    updateTransform(parentWorldMatrix: mat3 | null, parentDirty: boolean = false) {
        // 1. 更新自身的局部矩阵 (如果 dirty)
        const localDirty = this.transform.dirty;
        this.transform.updateLocalTransform(); // 会清除 dirty

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
        // 如果 worldDirty 为 false，子节点仅在自身 dirty 时更新
        for (const child of this.children) {
            child.updateTransform(this.transform.worldMatrix, worldDirty);
        }
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
     * 点击检测
     * 判断给定的世界坐标点是否在节点范围内
     * @param worldPoint 世界坐标点
     * @returns 是否命中
     */
    hitTest(worldPoint: vec2): boolean {
        // 计算世界矩阵的逆矩阵，将世界坐标转为局部坐标
        const invertMatrix = mat3.create();
        mat3.invert(invertMatrix, this.transform.worldMatrix);

        const localPoint = vec2.create();
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
     * Canvas 渲染方法 (需子类实现)
     * @param _renderer 渲染器实例
     */
    renderCanvas(_renderer: any) { }
}
