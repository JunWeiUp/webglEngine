我将通过以下三个关键步骤进一步优化渲染性能：

1.  **实现视锥体剔除 (Frustum Culling)**：
    *   目前即使物体在屏幕外，CPU 依然会计算其顶点位置并尝试提交给 Batch Renderer。
    *   我将在 `Renderer.ts` 中添加一个 `isNodeVisible` 方法，利用节点的 AABB（基于 `transform.worldMatrix` 和 `width/height`）与屏幕视口进行相交检测。
    *   在 `renderNode` 递归中，如果节点不可见（且不是容器，因为容器可能很大或者本身不可见但子节点可见），则跳过其渲染及子节点遍历（需谨慎，如果容器没有尺寸但子节点有尺寸，则不能轻易剔除容器，除非容器有正确的 Bounds 计算。考虑到当前架构，我们将只对 **叶子节点 (Sprite)** 做剔除，或者简单的基于世界坐标的中心点判断）。
    *   为了稳健，我将计算 Sprite 的世界坐标 AABB，如果完全在屏幕外则剔除。

2.  **优化 `Transform` 更新机制**：
    *   目前的 `Transform.ts` 虽然有 `dirty` 标志，但在 `updateLocalTransform` 中并没有利用它，而是每次都重新计算矩阵。
    *   我将修改 `Transform.ts`，只有当 `position`, `scale`, `rotation` 发生变化时才设置 `dirty = true`，并在更新时检查该标志。
    *   同时，`Node.ts` 的 `updateTransform` 也应该只在父节点变脏或自身变脏时才更新 `worldMatrix`。

3.  **减少垃圾回收 (GC Optimization)**：
    *   `Sprite.ts` 中的 `renderWebGL` 方法每一帧都会创建新的 `Float32Array`（`vertices` 和 `uvs`）。
    *   对于 5000+ 个 Sprite，这会产生大量临时对象。
    *   我将在 `Sprite` 类外或类静态成员中创建一个共享的 `Float32Array` 缓存，或者直接传递数据给 `Renderer` 而不创建中间数组（如果可能）。最简单的做法是复用一个模块级的 `tempVertices` 数组。

**实施计划**：
1.  修改 `src/engine/core/Transform.ts`：实现真正的 Dirty Flag 机制。
2.  修改 `src/engine/display/Node.ts`：利用 Transform 的 Dirty Flag 优化递归更新。
3.  修改 `src/engine/core/Renderer.ts`：添加 `isVisible` 检查。
4.  修改 `src/engine/display/Sprite.ts`：移除 `new Float32Array`，使用共享缓冲区。