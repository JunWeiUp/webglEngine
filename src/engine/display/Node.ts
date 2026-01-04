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
     * @param parentDirty 父节点是否发生变化
     */
    updateTransform(parentWorldMatrix: mat3 | null, parentDirty: boolean = false) {
        // 1. 更新自身的局部矩阵 (如果 dirty)
        this.transform.updateLocalTransform();
        
        // 2. 决定是否需要更新世界矩阵
        // 如果父节点变了，或者自己变了，就需要重新计算世界矩阵
        // 注意：transform.version 在 updateLocalTransform 后可能改变
        // 这里简化判断：如果 local 刚更新过 (dirty was true -> version changed) 或 parentDirty
        
        // 由于 transform.dirty 在 updateLocalTransform 后被重置，我们需要一种机制知道刚才是否更新了
        // 或者简单地：
        
        let worldDirty = parentDirty;
        // 检查局部是否刚被更新 (实际上我们应该在 Transform 里维护一个 worldDirty 标记更合适，但这里先这样)
        // 简单的优化：如果 localMatrix 没变且 parentMatrix 没变，就不需要重算 worldMatrix
        
        // 但由于 updateLocalTransform 内部消化了 dirty，外部难以直接判断。
        // 改进：我们假设每帧调用 updateTransform。
        // 如果 transform.version 变了，说明 local 变了。
        // 我们需要记录上一次计算时的 version。
        
        if (parentDirty || this.transform.version !== this.transform.parentVersion) {
            this.transform.updateWorldTransform(parentWorldMatrix);
            this.transform.parentVersion = this.transform.version; // Hack: 复用字段或新增字段记录 lastVersion
            // 实际上 Transform 类里 parentVersion 还没被利用起来，这里暂且假设每次都算，或者需要更严谨的 Version 控制
            // 为了稳妥，先保持 updateWorldTransform 的调用，依靠 Transform 内部优化（如果有）
            // 鉴于 Transform.updateWorldTransform 目前是纯计算，我们可以做一个简单的优化：
            
            // 真正的优化：
            // worldDirty = parentDirty || this.transform.dirty (在 updateLocal 之前判断)
        }
        
        // 重新实现：
        const localDirty = this.transform.dirty;
        this.transform.updateLocalTransform(); // 会清除 dirty
        
        if (localDirty || parentDirty) {
            this.transform.updateWorldTransform(parentWorldMatrix);
            worldDirty = true;
        }

        // 3. 递归更新所有子节点
        // 如果 worldDirty 为 true，子节点必须更新
        // 如果 worldDirty 为 false，子节点仅在自身 dirty 时更新
        for (const child of this.children) {
            child.updateTransform(this.transform.worldMatrix, worldDirty);
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
