# 按需渲染改造与 TileLayer 修复计划

为了实现按需渲染并解决背景消失的问题，我将执行以下步骤：

1.  **核心机制 (`Node.ts`)**:
    *   添加 `invalidate()` 方法和 `onInvalidate` 回调，用于向上冒泡重绘请求。

2.  **引擎循环 (`Engine.ts`)**:
    *   修改 `loop()` 方法，移除死循环。
    *   实现 `requestRender()` 方法，使用防抖动 (Debounce) 机制触发渲染。
    *   监听场景和窗口变化自动触发重绘。

3.  **交互触发 (`InteractionManager.ts`)**:
    *   在拖拽、缩放、框选、悬停等交互事件发生时，主动调用 `invalidate()`。

4.  **资源加载触发 (`Sprite.ts`)**:
    *   纹理加载完成后调用 `invalidate()`。

5.  **TileLayer 修复与优化 (`TileLayer.ts`)**:
    *   **修复背景消失问题**：重构 `renderWebGL` 方法，不再直接调用 `gl.drawArrays`，而是使用 `renderer.drawQuad` 参与批处理渲染。这将解决因渲染管线冲突导致的背景丢失。
    *   在瓦片加载完成后调用 `invalidate()`，支持按需加载显示。

这个计划将同时解决性能问题（按需渲染）和显示问题（背景修复）。