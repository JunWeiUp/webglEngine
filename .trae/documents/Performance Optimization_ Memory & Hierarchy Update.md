基于之前的分析，我制定了以下进一步的性能优化计划：

1.  **颜色属性内存优化 (Color Memory Optimization)**
    *   **问题**: `Sprite` 和 `Container` 类在构造函数中都会创建一个新的 `Float32Array([1, 1, 1, 1])`。在创建成千上万个对象时（如 `main.ts` 中的 30,000 个对象），这会造成大量的小对象分配，增加 GC 压力。
    *   **解决方案**: 使用一个静态共享的“白色” `Float32Array` 作为默认值。只有当用户修改颜色时，才进行克隆或创建新的数组。

2.  **变换更新剪枝 (Transform Update Pruning)**
    *   **问题**: 目前的 `Node.updateTransform` 会递归遍历整个场景树，即使节点及其子树完全没有变化。对于拥有大量静态对象的场景，这种空遍历是浪费的。
    *   **解决方案**: 引入 `localDirty` (自身脏) 和 `childDirty` (子树脏) 标记。
        *   当一个节点的变换发生改变时，标记自身为 `localDirty`，并向上遍历标记所有祖先节点为 `childDirty`。
        *   在 `updateTransform` 遍历中，如果一个节点既不是 `localDirty` 也没有 `childDirty` 且父节点也没变，则直接跳过对其子节点的遍历。

### 执行步骤

1.  **修改 `src/engine/display/Sprite.ts`**:
    *   实现 `color` 属性的共享默认值优化。

2.  **修改 `src/engine/display/Node.ts`**:
    *   添加 `_worldDirtyVersion` 或类似机制来跟踪父级变化。
    *   实现 `childDirty` 标志及向上冒泡逻辑。
    *   在 `updateTransform` 中实现递归剪枝。

3.  **修改 `src/engine/core/Transform.ts`**:
    *   需要配合 `Node`，当 `dirty` 设为 `true` 时通知 `Node`。或者我们在 `Node` 中监听或包装 `Transform` 的修改。
    *   *修正*: `Node` 并不直接监听 `Transform`。最简单的方法是在 `Node` 上添加一个方法 `setDirty()`，或者在每帧开始时（Engine 级别）或修改属性时手动处理。
    *   为了不破坏现有架构，我们可以利用 `Node.invalidate()` (目前用于重绘)。我们可以扩展它，或者添加一个新的 `setTransformDirty()` 方法。
    *   *更优方案*: 在 `Node.updateTransform` 中，我们已经检测了 `transform.dirty`。我们可以利用这一步来更新标记，但剪枝需要在 *遍历之前* 就知道子树是否脏。
    *   因此，我们需要在修改 `transform` 属性时（例如 `position[0] = x`）就能通知到 Node。
    *   由于 `gl-matrix` 直接操作数组，很难拦截。
    *   *妥协方案*: 鉴于架构限制，我们可以只做 **Color 优化** 和 **静态子树跳过** (如果父节点世界矩阵没变，且子节点自身也没变，就不需要计算世界矩阵，但遍历可能还得继续以检查子节点的子节点)。
    *   *替代方案*: 让我们先只做 **Color 优化**，这是确定且安全的。对于 Transform 剪枝，由于直接修改数组 (`position[0]++`) 无法被检测到（除非封装成 getter/setter），目前架构下很难做到完美的向上冒泡脏标记。

**修正后的计划**:
我将专注于 **Color 属性的内存优化**。这对于大量 Sprite 的场景非常有效且风险较低。

我是否应该执行这个优化？