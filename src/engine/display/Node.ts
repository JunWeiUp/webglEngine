import { mat3, vec2 } from 'gl-matrix';
import { Transform } from '../core/Transform';
import type { IRenderer } from '../core/IRenderer';

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
    addChild(child: Node) {
        // 如果子节点已有父节点，先从原父节点移除
        if (child.parent) {
            child.parent.removeChild(child);
        }
        child.parent = this;
        this.children.push(child);
        this.invalidate(); // 结构变化需要重绘
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
     */
    updateTransform(parentWorldMatrix: mat3 | null) {
        // 更新自身的局部和世界矩阵
        this.transform.updateLocalTransform();
        this.transform.updateWorldTransform(parentWorldMatrix);

        // 递归更新所有子节点
        for (const child of this.children) {
            child.updateTransform(this.transform.worldMatrix);
        }
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
    renderWebGL(_renderer: IRenderer) {}

    /**
     * Canvas 渲染方法 (需子类实现)
     * @param _renderer 渲染器实例
     */
    renderCanvas(_renderer: any) {}
}
