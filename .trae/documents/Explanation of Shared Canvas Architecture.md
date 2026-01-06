为了将 Text 的绘制方式改为 WebGL 并移除 `renderCanvas`，我将执行以下步骤：

1.  **扩展 `TextureManager`**:
    *   修改 `src/engine/utils/TextureManager.ts`，添加 `createTextureFromCanvas` 辅助方法（复用现有的 `createTextureFromSource` 逻辑），以便将用于生成文本的离屏 Canvas 转换为 WebGL 纹理。

2.  **重构 `Text` 类**:
    *   修改 `src/engine/display/Text.ts`:
        *   移除 `renderCanvas(renderer: IRenderer)` 方法。
        *   添加用于管理离屏 Canvas (`HTMLCanvasElement`) 和缓存纹理 (`Texture`) 的属性。
        *   实现 `updateTexture(gl)` 方法：将文本绘制到离屏 Canvas，并使用 `TextureManager` 将其上传为 WebGL 纹理。
        *   实现 `renderWebGL(renderer: IRenderer)` 方法：检查纹理是否需要更新，然后使用 `renderer.drawQuad` 渲染文本纹理（逻辑类似于 `Sprite`）。

3.  **清理 `Node` 类**:
    *   修改 `src/engine/display/Node.ts`，移除 `renderCanvas` 方法存根 (Stub)，因为它不再是节点接口的一部分。

4.  **更新 `Renderer`**:
    *   修改 `src/engine/core/Renderer.ts`，移除 `renderNode` 中检查并调用 `renderCanvas` 的逻辑，从而完成向纯 WebGL 场景图的迁移（注：`AuxiliaryLayer` 仍然独立处理顶层 UI）。

这一变更将确保 `Text` 参与 WebGL 渲染流程，从而实现更一致的渲染管线。