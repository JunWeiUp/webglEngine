import { mat3, vec2 } from 'gl-matrix';
import { Node } from '../display/Node';
import type { Rect } from './Rect';
import RBush from 'rbush';

/**
 * 空间索引项接口
 */
interface MatrixSpatialItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    node: Node;
}

/**
 * MatrixSpatialIndex (基于矩阵的分层空间索引)
 * 
 * 该数据结构专门设计用于解决场景图中父节点移动导致的大量空间索引更新问题。
 * 
 * 核心设计理念：
 * 1. **局部索引**：内部存储的是元素在其父节点坐标系（局部空间）下的包围盒。
 * 2. **分层递归**：每个容器节点管理其直接子节点的索引，通过递归实现全局查找。
 * 3. **矩阵依赖**：主要依赖元素的 localMatrix，父节点变换不影响子节点索引。
 */
export class MatrixSpatialIndex {
    private rbush: RBush<MatrixSpatialItem>;
    private items: Map<number, MatrixSpatialItem> = new Map();

    // 性能优化：使用实例变量而非静态变量，避免递归调用时产生冲突
    private _tempMat = mat3.create();
    private _tempInvMat = mat3.create();
    private _tempVecs = [
        vec2.create(),
        vec2.create(),
        vec2.create(),
        vec2.create()
    ];

    /**
     * @param maxEntries RBush 每个节点的最大条目数
     */
    constructor(maxEntries: number = 16) {
        this.rbush = new RBush(maxEntries);
    }

    /**
     * 更新或添加一个节点的空间信息
     * @param node 节点对象
     */
    public update(node: Node) {
        this.remove(node.id);

        // 确保局部变换矩阵是最新的
        node.transform.updateLocalTransform();
        
        const localMatrix = node.transform.localMatrix;
        const w = node.width;
        const h = node.height;

        // 计算节点在父节点局部空间下的 4 个顶点
        const corners = this._tempVecs;
        vec2.set(corners[0], 0, 0);
        vec2.set(corners[1], w, 0);
        vec2.set(corners[2], w, h);
        vec2.set(corners[3], 0, h);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < 4; i++) {
            vec2.transformMat3(corners[i], corners[i], localMatrix);
            const x = corners[i][0];
            const y = corners[i][1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        const item: MatrixSpatialItem = {
            minX,
            minY,
            maxX,
            maxY,
            node
        };

        this.items.set(node.id, item);
        this.rbush.insert(item);
    }

    /**
     * 从索引中移除节点
     * @param id 节点 ID
     */
    public remove(id: number) {
        const item = this.items.get(id);
        if (item) {
            this.rbush.remove(item);
            this.items.delete(id);
        }
    }

    /**
     * 局部空间 AABB 查询
     * @param bounds 局部空间 AABB
     */
    public search(bounds: Rect): Node[] {
        const results = this.rbush.search({
            minX: bounds.x,
            minY: bounds.y,
            maxX: bounds.x + bounds.width,
            maxY: bounds.y + bounds.height
        });
        return results.map(item => item.node);
    }

    /**
     * 递归全局查询
     * 
     * @param viewMatrix 世界坐标系到相机（视图）坐标系的矩阵
     * @param parentWorldMatrix 父节点到世界坐标系的矩阵
     * @param viewport 视图窗口矩形
     * @param outResult 结果收集数组
     */
    public queryRecursive(
        viewMatrix: mat3, 
        parentWorldMatrix: mat3, 
        viewport: Rect, 
        outResult: Node[]
    ) {
        // 1. 计算从 局部空间 -> 视图空间 的总变换矩阵
        const localToView = this._tempMat;
        mat3.multiply(localToView, viewMatrix, parentWorldMatrix);

        // 2. 计算 视图空间 -> 局部空间 的逆变换矩阵
        const viewToLocal = this._tempInvMat;
        if (!mat3.invert(viewToLocal, localToView)) {
            return;
        }

        // 3. 将世界视图矩形的四个角转换到局部空间，得到查询 AABB
        const corners = this._tempVecs;
        vec2.set(corners[0], viewport.x, viewport.y);
        vec2.set(corners[1], viewport.x + viewport.width, viewport.y);
        vec2.set(corners[2], viewport.x + viewport.width, viewport.y + viewport.height);
        vec2.set(corners[3], viewport.x, viewport.y + viewport.height);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of corners) {
            vec2.transformMat3(c, c, viewToLocal);
            if (c[0] < minX) minX = c[0];
            if (c[0] > maxX) maxX = c[0];
            if (c[1] < minY) minY = c[1];
            if (c[1] > maxY) maxY = c[1];
        }

        // 4. 在局部 RBush 中执行快速 AABB 查询
        const results = this.rbush.search({ minX, minY, maxX, maxY });

        for (const item of results) {
            const node = item.node;
            outResult.push(node);

            // 5. 如果子节点也有索引，递归查询
            if (node.childSpatialIndex) {
                node.childSpatialIndex.queryRecursive(
                    viewMatrix,
                    node.getWorldMatrix(),
                    viewport,
                    outResult
                );
            }
        }
    }

    /**
     * 递归拾取检测
     * @param parentWorldMatrix 父节点世界矩阵
     * @param worldPos 世界坐标
     * @returns 命中的节点
     */
    public hitTestRecursive(parentWorldMatrix: mat3, worldPos: vec2): Node | null {
        // 1. 计算 视图空间 -> 局部空间 的逆变换矩阵
        const worldToLocal = this._tempInvMat;
        if (!mat3.invert(worldToLocal, parentWorldMatrix)) {
            return null;
        }

        // 2. 将世界坐标转换到局部空间
        const localPos = this._tempVecs[0];
        vec2.transformMat3(localPos, worldPos, worldToLocal);

        // 3. 在局部 RBush 中执行点查询 (使用 0 宽高的 AABB)
        const results = this.rbush.search({
            minX: localPos[0],
            minY: localPos[1],
            maxX: localPos[0],
            maxY: localPos[1]
        });

        // 性能优化：如果结果超过 1 个，按 renderOrder 降序排序，确保拾取到最上层的元素
        if (results.length > 1) {
            results.sort((a, b) => b.node.renderOrder - a.node.renderOrder);
        }

        // 4. 遍历检测 (已按渲染顺序从上到下排列)
        for (const item of results) {
            const node = item.node;

            // 递归检测子节点的索引 (子节点永远在父节点之上)
            if (node.childSpatialIndex) {
                const hit = node.childSpatialIndex.hitTestRecursive(node.getWorldMatrix(), worldPos);
                if (hit) return hit;
            }

            // 检测节点自身 (精确检测)
            if (node.interactive) {
                const nodeLocalPos = this._tempVecs[1];
                const nodeInvertLocal = this._tempMat;
                if (mat3.invert(nodeInvertLocal, node.transform.localMatrix)) {
                    vec2.transformMat3(nodeLocalPos, localPos, nodeInvertLocal);

                    if (nodeLocalPos[0] >= 0 && nodeLocalPos[0] <= node.width &&
                        nodeLocalPos[1] >= 0 && nodeLocalPos[1] <= node.height) {
                        return node;
                    }
                }
            }
        }

        return null;
    }

    /**
     * 清空索引
     */
    public clear() {
        this.rbush.clear();
        this.items.clear();
    }
}
