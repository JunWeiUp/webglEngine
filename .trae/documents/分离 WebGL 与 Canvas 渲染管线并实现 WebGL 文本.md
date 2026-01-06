# 渲染管线分离与 WebGL 文本渲染计划

为了实现 WebGL 与 Canvas 2D 渲染的分离，并支持 WebGL 绘制文本，我们将执行以下步骤：

## 1. 重构 `Renderer` (核心渲染器)
将混合的渲染逻辑拆分为独立的 Pass。
- **文件**: `src/engine/core/Renderer.ts`
- **修改**:
    - `render()` 方法：移除所有 Canvas 2D 相关的代码（清除、restore、`renderCanvas` 调用），仅保留 WebGL 相关的 `clear`、`scissor` 和 `renderNodeWebGL` 调用。
    - 新增 `renderCanvas(scene, dirtyRect)` 方法：专门负责 Canvas 2D 的场景遍历和渲染。
    - 拆分 `renderNode`：
        - `renderNodeWebGL`：仅调用 `renderWebGL`。
        - `renderNodeCanvas`：仅调用 `renderCanvas`。

## 2. 升级 `Text` (文本节点)
实现基于纹理的 WebGL 渲染能力。
- **文件**: `src/engine/display/Text.ts`
- **新增属性**: `_texture` (缓存纹理), `_canvas` (离屏绘制), `_dirty` (内容标记).
- **新增方法**:
    - `updateTexture()`: 使用 Canvas 2D API 将文本绘制到离屏 Canvas，并通过 `TextureManager` 或 `gl` 创建/更新纹理。
    - `renderWebGL(renderer)`: 检查脏标记更新纹理，计算顶点（参考 Sprite），调用 `renderer.drawQuad` 绘制。
- **修改**: `renderCanvas` 可保留作为降级或仅在 `renderCanvas` Pass 中被调用（如果需要混合使用）。

## 3. 更新 `Engine` (主循环)
编排新的渲染流程。
- **文件**: `src/engine/Engine.ts`
- **修改 `loop` 方法**:
    1. **WebGL Pass**: 调用 `renderer.render(scene, ...)`。
    2. **Canvas Pass**:
        - `renderer.clearCanvas2D(...)`
        - `renderer.renderCanvas(scene, ...)` (处理可能仍需 2D 渲染的节点)
        - `auxLayer.render(...)` (辅助 UI)
        - `renderer.restoreCanvas2D(...)`

## 4. 验证
- 确认文本现在是通过 WebGL 绘制的（可以通过 FPS 监控或 Spector.js 验证，或者简单地看是否能和 Sprite 一起正确层叠）。
- 确认辅助图层（AuxLayer）依然显示在最上层。
