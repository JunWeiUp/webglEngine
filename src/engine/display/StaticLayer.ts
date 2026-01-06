import { Node } from './Node';
import { QuadTree, type Rect } from '../utils/QuadTree';
import type { IRenderer } from '../core/IRenderer';
import { mat3, vec2 } from 'gl-matrix';

/**
 * StaticLayer (静态层)
 * 
 * 专为承载大量相对静止的节点而设计（如地图图标、植被、粒子）。
 * 
 * 核心优化：
 * 1. 使用基于局部坐标 (Local Space) 的 QuadTree 进行空间索引。
 *    - 无论 Layer 如何平移缩放，QuadTree 都不需要重建。
 * 2. 按需渲染与更新 (Culling & Lazy Update)。
 *    - 仅对视口内的可见节点执行 updateTransform 和 render。
 *    - 避免了对百万级不可见节点的遍历和矩阵计算。
 */
export class StaticLayer extends Node {
    private quadTree: QuadTree;
    private staticBounds: Rect;
    
    // 缓存可见节点列表，避免每帧分配
    private visibleNodes: Node[] = [];

    /**
     * @param width 层的虚拟宽度（用于 QuadTree 边界）
     * @param height 层的虚拟高度
     */
    constructor(width: number = 100000, height: number = 100000) {
        super();
        this.width = width;
        this.height = height;
        
        // 假设原点在中心，或者左上角。这里假设层足够大。
        // 使用局部坐标构建 QuadTree
        this.staticBounds = { x: -width/2, y: -height/2, width: width, height: height };
        this.quadTree = new QuadTree(this.staticBounds, 50, 8, 0, true); // true = useLocalBounds
    }

    /**
     * 添加子节点
     * 重写以同时插入 QuadTree
     */
    addChild(child: Node) {
        super.addChild(child);
        this.quadTree.insert(child);
    }

    /**
     * 移除子节点
     * (注意：QuadTree 移除比较昂贵，通常建议 StaticLayer 只增不减，或定期重建)
     * 目前简单实现为全量重建 QuadTree (如果移除操作频繁，需要优化 QuadTree)
     */
    removeChild(child: Node) {
        super.removeChild(child);
        // 简单粗暴：重建索引
        this.rebuildIndex();
    }

    private rebuildIndex() {
        this.quadTree.clear();
        for (const child of this.children) {
            this.quadTree.insert(child);
        }
    }

    /**
     * 优化的渲染逻辑
     */
    renderWebGL(renderer: IRenderer) {
        // 1. 计算当前 Layer 在局部空间下的可见区域
        // Viewport (Screen) -> Inverse World Matrix -> Local Rect
        
        // 获取视口矩形 (Screen Space)
        // 假设视口就是 Canvas 大小
        const screenWidth = renderer.gl.canvas.width;
        const screenHeight = renderer.gl.canvas.height;
        
        const p0 = vec2.fromValues(0, 0);
        const p1 = vec2.fromValues(screenWidth, 0);
        const p2 = vec2.fromValues(screenWidth, screenHeight);
        const p3 = vec2.fromValues(0, screenHeight);

        // 计算逆矩阵
        const invertMatrix = mat3.create();
        mat3.invert(invertMatrix, this.transform.worldMatrix);

        // 变换到局部空间
        vec2.transformMat3(p0, p0, invertMatrix);
        vec2.transformMat3(p1, p1, invertMatrix);
        vec2.transformMat3(p2, p2, invertMatrix);
        vec2.transformMat3(p3, p3, invertMatrix);

        // 计算局部 AABB
        const minX = Math.min(p0[0], p1[0], p2[0], p3[0]);
        const minY = Math.min(p0[1], p1[1], p2[1], p3[1]);
        const maxX = Math.max(p0[0], p1[0], p2[0], p3[0]);
        const maxY = Math.max(p0[1], p1[1], p2[1], p3[1]);

        const visibleRect: Rect = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };

        // 2. 查询 QuadTree 获取可见节点
        this.visibleNodes.length = 0;
        this.quadTree.retrieve(this.visibleNodes, visibleRect);

        // 3. 仅对可见节点进行更新和渲染
        // 注意：我们需要手动调用 updateTransform，因为 StaticLayer 的父级可能没调，
        // 或者我们希望跳过 StaticLayer 中不可见节点的更新。
        
        // 这里的逻辑是：StaticLayer 自身的 transform 已经在父级遍历中更新了。
        // 我们现在负责子节点。
        
        // 标记：如果 StaticLayer 自身变了 (worldMatrix 变了)，所有子节点的 worldMatrix 都需要更新。
        // 但我们只更新可见的。
        const parentMatrix = this.transform.worldMatrix;
        
        for (const node of this.visibleNodes) {
            // 强制更新可见节点的变换 (假设它们可能相对于上一帧没变，但父节点变了)
            // 优化：如果知道父节点没变且子节点没变，可以跳过。但通常 StaticLayer 是用来拖拽地图的，父节点肯定变了。
            node.updateTransform(parentMatrix, true);
            
            // 渲染
            if (node.width > 0 && node.height > 0) { // 简单剔除
                 if ('renderWebGL' in node) {
                     (node as any).renderWebGL(renderer);
                 }
            }
        }
        
        // 调试：绘制 QuadTree 边界 (可选)
        // this.debugDraw(renderer);
    }

    /**
     * 重写 updateTransform
     * 阻止默认的递归更新，改为在 renderWebGL 中按需更新
     */
    updateTransform(parentWorldMatrix: mat3 | null, parentDirty: boolean = false) {
        // 1. 更新自身的局部矩阵
        const localDirty = this.transform.dirty;
        this.transform.updateLocalTransform();

        // 2. 更新自身的世界矩阵
        if (localDirty || parentDirty) {
            this.transform.updateWorldTransform(parentWorldMatrix);
            // 此时不递归更新子节点！推迟到 renderWebGL 阶段。
        }
        
        // 注意：如果 StaticLayer 下还有非可视化的逻辑节点需要更新，这种做法会破坏逻辑。
        // 但 StaticLayer 约定用于纯展示。
    }
}
