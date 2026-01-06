基于用户的反馈（严重卡顿、重新加载），问题的主要原因在于 `Text` 组件在频繁更新文本内容时（如加载进度的百分比变化），每一帧都在销毁并重新创建 WebGL 纹理对象。这会导致显存压力过大和 GPU 驱动开销过高，从而引发浏览器崩溃或页面重载。

### 解决方案：纹理复用优化

我们需要修改 `Text` 的渲染逻辑，**复用**现有的 WebGL 纹理对象，而不是每次都删除重建。

**具体步骤：**

1.  **修改 `src/engine/utils/TextureManager.ts`**：
    *   新增 `updateTextureFromSource(gl, texture, source)` 方法。
    *   该方法将绑定现有的 `WebGLTexture`，并调用 `gl.texImage2D` 更新其内容，而不是创建新纹理。

2.  **修改 `src/engine/display/Text.ts`**：
    *   在 `updateTexture` 方法中：
        *   如果 `this.texture` 已经存在，直接调用 `TextureManager.updateTextureFromSource` 更新内容。
        *   只有在 `this.texture` 为空时，才创建新的纹理对象。
    *   移除 `gl.deleteTexture` 的调用（除非组件被销毁，但在 update 过程中不需要）。

这一优化将消除频繁创建/销毁纹理的开销，解决卡顿和崩溃问题。