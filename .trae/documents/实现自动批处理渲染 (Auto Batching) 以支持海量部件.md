为了支持 10 万+ 部件的高性能绘制，我们需要解决目前的性能瓶颈。当前的渲染管线对每个 `Sprite` 都进行单独的 `drawArrays` 调用（即使它们使用相同的纹理和 Shader），这会导致巨大的 CPU 开销。

我将通过实现 **自动批处理（Auto Batching）** 来解决这个问题。

具体计划如下：

1.  **修改 `src/engine/core/Renderer.ts`**：
    *   **实现 Batch 管理**：
        *   创建一个巨大的顶点缓冲区（Vertex Buffer）和索引缓冲区（Index Buffer），例如支持 10,000 个 Quad（40,000 顶点）。
        *   维护一个 `currentTexture` 状态。
        *   当 `render` 被调用时，如果不涉及纹理切换（Texture Switching）且 Buffer 未满，则将当前 Quad 的顶点数据（位置、UV、颜色、变换后的世界坐标）写入 CPU 端的 Buffer 中，而不立即调用 WebGL 的 draw。
        *   当纹理发生变化、Buffer 已满或渲染结束时，执行 `flush()`，一次性将 Buffer 上传到 GPU 并调用一次 `drawElements`。
    *   **支持多纹理（可选但推荐）**：为了进一步减少 Draw Call，可以在 Shader 中支持纹理数组（或 Texture Atlas），但在 WebGL 1 中这比较复杂。为了简化，我们先实现**基于相同纹理的 Batching**。如果所有 Sprite 使用相同的 Texture Atlas，性能将极大提升。

2.  **修改 `Sprite.ts` 和 `TileLayer.ts`**：
    *   调整它们的 `renderWebGL` 方法。
    *   不再直接调用 `gl.drawArrays`。
    *   而是调用 `renderer.drawQuad(texture, position, size, color, worldMatrix)`。
    *   `Renderer` 负责将这些信息变换到世界空间（或保留 WorldMatrix 在 Shader 中计算，但为了 Batching 通常在 CPU 计算最终顶点位置更灵活，或者使用 Instancing）。
    *   **决策**：为了最大的兼容性和灵活性，我将在 CPU 端预计算顶点位置（World Position），然后提交给 Batch Renderer。这意味着 Shader 只需要接受 Projection Matrix，不需要 Model Matrix（因为顶点已经是 World Space 了）。

3.  **优化 Shader**：
    *   修改 `defaultVertexShader`，移除 `u_matrix`（Model Matrix），只保留 `u_projectionMatrix`。
    *   顶点属性将包含 `a_position` (World Space), `a_texCoord`, `a_color`。

4.  **性能测试**：
    *   在 `main.ts` 中生成 10,000 个（甚至更多）微小的 Sprite 进行压力测试。

**核心改动点**：
- `Renderer.ts`: 增加 `BatchRenderer` 逻辑（`flush`, `drawImage`）。
- `shaders.ts`: 更新 Shader 以适应 Batching（去除逐对象的 Model Matrix）。
- `Sprite.ts`: 改为提交数据给 Renderer。

这将把 Draw Call 从 N 减少到 N / BatchSize (理想情况下接近 1，如果纹理统一)。