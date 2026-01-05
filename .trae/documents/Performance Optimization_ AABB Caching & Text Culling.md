基于之前的分析，我制定了以下进一步的性能优化计划：

1.  **节点 AABB 缓存与点击检测优化 (Node AABB Caching)**
    *   **问题**: 目前 `InteractionManager.hitTest` 在进行点击检测时，需要对每个节点计算逆矩阵，这是一个昂贵的操作。虽然目前有一些简单的优化，但对于大量节点来说仍然不够高效。
    *   **解决方案**: 在 `Node` 类中引入 `worldAABB` (世界坐标轴对齐包围盒)。
        *   在 `updateTransform` 中同步更新 `worldAABB`。
        *   在 `InteractionManager` 中利用这个缓存的 AABB 进行快速剔除（Fast Rejection）。只有当点在 AABB 内时，才进行精确的矩阵逆变换检测。

2.  **文本渲染剔除 (Text Culling)**
    *   **问题**: `Text` 类目前没有准确设置 `width` 和 `height`（相关代码被注释掉了）。这意味着渲染器的视锥体剔除（Frustum Culling）无法对文本生效。即使文本在屏幕外，Canvas 2D API 仍然会被调用，造成不必要的性能开销。
    *   **解决方案**: 启用文本测量缓存。
        *   在 `Text` 类中，当 `text`、`fontSize` 或 `fontFamily` 发生变化时，重新测量文本尺寸并更新 `width/height`。
        *   这将使 `Renderer` 能够自动跳过屏幕外文本的渲染。

3.  **渲染器状态优化 (Renderer State Optimization)**
    *   **问题**: 渲染循环中可能存在冗余的 WebGL 状态切换。
    *   **解决方案**: 检查并减少不必要的 GL 调用。

### 执行步骤

1.  **修改 `src/engine/display/Node.ts`**:
    *   添加 `worldAABB` 属性。
    *   在 `updateTransform` 中添加计算 AABB 的逻辑。

2.  **修改 `src/engine/events/InteractionManager.ts`**:
    *   更新 `hitTest` 方法，优先使用 `node.worldAABB` 判断点是否在节点范围内，从而避免不必要的矩阵运算。

3.  **修改 `src/engine/display/Text.ts`**:
    *   实现文本尺寸的按需测量（Lazy Measurement），确保 `width` 和 `height` 正确，从而利用引擎现有的剔除功能。

我是否应该执行这些优化？