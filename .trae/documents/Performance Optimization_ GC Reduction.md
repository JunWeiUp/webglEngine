基于之前的分析，我制定了以下进一步的性能优化计划，专注于减少垃圾回收（GC）压力：

1.  **减少 `Node.hitTest` 中的 GC (Reduce GC in hitTest)**
    *   **问题**: 目前 `Node.hitTest` 方法每次调用都会通过 `mat3.create()` 和 `vec2.create()` 创建新的矩阵和向量对象。在鼠标移动等高频事件中，这会产生大量的临时对象，导致频繁的垃圾回收。
    *   **解决方案**: 在 `Node` 类中引入静态共享的临时变量（`sharedMat3` 和 `sharedVec2`），在计算时复用这些对象，避免重复分配内存。

2.  **减少 `Renderer.flush` 中的 GC (Reduce GC in flush)**
    *   **问题**: `Renderer.flush` 方法每次都会创建一个新的数组 `textureIndices = [0, 1, 2, 3, 4, 5, 6, 7]`。虽然很小，但在高频绘制调用（Draw Call）下也是一种浪费。
    *   **解决方案**: 将 `textureIndices` 定义为类的常量或静态属性，只初始化一次。

### 执行步骤

1.  **修改 `src/engine/display/Node.ts`**:
    *   添加静态私有属性 `static sharedMat3` 和 `static sharedVec2`。
    *   更新 `hitTest` 方法以使用这些共享变量。

2.  **修改 `src/engine/core/Renderer.ts`**:
    *   添加静态只读属性 `static readonly TEXTURE_INDICES`。
    *   更新 `flush` 方法以使用该静态属性。

我是否应该执行这些优化？