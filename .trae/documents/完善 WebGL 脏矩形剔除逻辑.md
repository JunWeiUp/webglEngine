通过对 `Engine.ts` 和 `Renderer.ts` 的代码审查，我发现目前的“脏矩形”实现确实存在不完整的情况。

### 存在的问题

虽然引擎在 `Renderer.render` 方法中使用了 `gl.scissor` 来限制 GPU 的像素绘制区域（Pixel Processing），从而减少了片段着色器的开销，但在 CPU 端的几何剔除（Culling）逻辑中**完全忽略了脏矩形**。

具体表现为：
1.  `Renderer.renderNode` 递归遍历场景树。
2.  `Renderer.isNodeVisible` 仅检查节点是否在**全屏幕视口**（Viewport）内。
3.  **结果**：即使脏矩形只是屏幕左上角的一个小区域（例如 `10x10` 像素），引擎仍然会遍历整个场景，并计算所有在屏幕内可见物体的顶点数据，将其提交给 GPU。虽然 GPU 会裁剪掉大部分内容，但 CPU 的遍历和提交开销（Draw Calls / Buffer Uploads）并没有减少。

### 优化方案

为了彻底落实脏矩形优化，我们需要在 CPU 端也进行剔除。

1.  **修改 `Renderer.ts`**:
    *   在 `render` 方法中，计算出一个有效的 `cullingRect`（脏矩形与视口的交集）。
    *   将 `cullingRect` 传递给 `renderNode` 和 `isNodeVisible`。
    *   更新 `isNodeVisible` 逻辑，使其检查节点是否与 `cullingRect` 相交，而不仅仅是视口。

### 实施计划

我将修改 `src/engine/core/Renderer.ts` 文件，实现上述逻辑。这包括：
1.  更新 `render` 方法，计算并传递裁剪区域。
2.  更新 `renderNode` 签名以接收裁剪区域。
3.  更新 `isNodeVisible` 逻辑以支持自定义裁剪区域的相交检测。

我将立即执行此修复。