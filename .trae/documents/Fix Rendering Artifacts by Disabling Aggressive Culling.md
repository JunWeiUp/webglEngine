导致“拖拽过程中部分区域绘制不全”的原因是 **Renderer.ts 中的剔除逻辑过于激进**。

具体来说，在 `renderNode` 方法中，有这样一段优化代码：

```typescript
// 优化：如果当前节点被剔除... 则不再遍历其子节点。
if (!isVisible && node.width > 0 && node.height > 0) {
    return;
}
```

这段代码假设：**如果父节点不可见，那么它的所有子节点也都不可见。**
这在很多 UI 框架中成立（因为通常会有 `clipChildren`），但在当前的引擎实现中，`Node` 的 `width/height` 仅代表自身的点击区域或背景大小，**子节点完全可以放置在父节点的边界之外**。

**场景复现**：
假设有一个 `Container`（父节点），位于屏幕左侧，大小很小。
它有一个子节点 `Sprite`，被移动到了屏幕右侧。
当你只重绘屏幕右侧的脏矩形时，`Renderer` 检查父节点 `Container`，发现它在脏矩形之外（`isVisible = false`），于是直接 `return`，不再遍历子节点。
结果：屏幕右侧的 `Sprite` 本应该被画出来，却消失了。

**解决方案**：
在 `Renderer.ts` 中**移除这个提前返回（Early Return）的优化**。
即使父节点本身不可见，我们仍必须遍历其子节点，因为子节点可能位于脏矩形范围内。

虽然这会稍微增加 CPU 的遍历开销（需要遍历整个场景树），但这是保证渲染正确性的必要代价，除非我们在每个节点上都维护一个包含所有子代的巨大 AABB（这会带来更新 AABB 的巨大开销）。对于目前的节点数量，全遍历是可以接受的。

## 计划
1.  **修改 `src/engine/core/Renderer.ts`**：
    *   在 `renderNode` 方法中，删除 `if (!isVisible && node.width > 0 && node.height > 0) { return; }` 代码块。
    *   保留 `isVisible` 变量用于判断**当前节点本身**是否需要调用 `renderWebGL/renderCanvas`，但不影响子节点的遍历。

这将确保无论父节点是否在脏矩形内，只要子节点在脏矩形内，就一定会被渲染。