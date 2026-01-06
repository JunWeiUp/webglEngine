# Canvas 2D 全屏重绘计划

用户要求 Canvas 2D (主要用于 AuxLayer) 不再使用脏矩形 (Dirty Rect) 优化，而是每帧全屏清除并重新绘制。这通常用于解决辅助图层（如选框、高亮）可能出现的残留问题，或者简化逻辑。

## 1. 修改 `Engine.ts`
在 `loop` 方法中，调用 `renderer.clearCanvas2D` 和 `auxLayer.render` 时不再传递 `renderRect`。
- **文件**: `src/engine/Engine.ts`
- **修改**:
    - 将 `this.renderer.clearCanvas2D(renderRect)` 改为 `this.renderer.clearCanvas2D()`。
    - 将 `this.auxLayer.render(..., renderRect)` 改为 `this.auxLayer.render(...)` (或者在 render 内部忽略该参数)。
    - 注释掉 `restoreCanvas2D`，因为全屏清除不需要 clip/restore。

## 2. 修改 `Renderer.ts`
简化 `clearCanvas2D` 逻辑，移除脏矩形裁剪部分。
- **文件**: `src/engine/core/Renderer.ts`
- **修改**:
    - `clearCanvas2D` 方法：忽略参数，直接全屏 `clearRect`。
    - 移除或留空 `restoreCanvas2D` 方法。
    - `renderCanvas` 方法：确保它不依赖脏矩形剔除（如果仍有残留）。但用户主要关注的是 Canvas 2D 辅助层。

## 3. 验证
- 确认辅助图层（高亮框、连线等）在快速移动时没有残留。
- 确认性能影响在可接受范围内（全屏 clearCanvas 开销通常很小）。
