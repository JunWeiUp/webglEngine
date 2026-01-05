# 按需渲染优化计划

为了将 WebGL 渲染与 Canvas 2D 辅助渲染分离，实现仅在必要时触发 WebGL 重绘（例如仅鼠标悬停高亮变化时跳过 WebGL 渲染），我将执行以下修改：

## 1. 修改 `Renderer` 类
支持通过参数控制是否跳过 WebGL 渲染阶段。
- **文件**: `src/engine/core/Renderer.ts`
- **修改**: 
    - 更新 `render` 方法签名，增加 `drawWebGL` (boolean) 参数。
    - 在 `render` 方法中，如果 `drawWebGL` 为 `false`，则跳过 `gl.clear` 和 `node.renderWebGL` 的调用，仅执行 `scene.updateTransform` 和 `node.renderCanvas`（因为 Canvas 2D 层仍需重绘以恢复被清除的文字）。

## 2. 修改 `Engine` 类
引入渲染层级脏状态管理。
- **文件**: `src/engine/Engine.ts`
- **修改**:
    - 新增 `sceneDirty` (boolean) 状态，用于标记 WebGL 场景内容是否发生变化。
    - 新增 `invalidateAuxArea(rect)` 方法，用于仅请求辅助层（和 UI）重绘，不标记 `sceneDirty`。
    - 更新 `invalidateFull`和 `invalidateArea` 方法，使其将 `sceneDirty` 设为 `true`。
    - 更新 `loop` 方法，根据 `sceneDirty` 状态决定调用 `renderer.render` 时是否传入 `drawWebGL: true`。

## 3. 更新 `InteractionManager` (可选但推荐)
使用新的 API 优化悬停效果。
- **文件**: `src/engine/events/InteractionManager.ts`
- **修改**:
    - 在处理 `hover` 变化时，调用 `engine.invalidateAuxArea` 替代 `invalidateArea`，从而触发优化路径。

## 验证计划
- 运行项目，检查基本渲染是否正常。
- 移动鼠标悬停在物体上，观察 FPS 面板或控制台，确认在仅悬停时 WebGL Draw Calls 是否减少（或者通过代码逻辑确认跳过了 WebGL 路径）。
- 确认文字（Canvas 2D）在仅更新 Aux 时不会消失。
