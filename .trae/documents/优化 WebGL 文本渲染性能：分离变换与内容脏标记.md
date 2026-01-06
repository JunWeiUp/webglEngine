# WebGL 文本渲染性能优化计划

用户反馈切换到 WebGL 渲染 Text 后，缩放和平移变得非常卡顿。经过分析，主要原因是 `Text` 节点在 `renderWebGL` 时过于频繁地调用 `updateTexture`，导致每帧都进行 Canvas 绘制和纹理上传。

## 1. 优化 `Text.ts` 中的 `updateTexture` 逻辑
目前的 `updateTexture` 依赖 `_dirty` 标记。我们需要确保 `_dirty` 仅在文本内容或样式改变时触发，而不是在父节点变换（平移/缩放）时触发。

- **问题点**: `Node` 类中的 `invalidate` 会向上冒泡。虽然 `Text` 的 `invalidate` 只是简单地设 `_dirty=true`，但我们需要确认谁在调用它。
- **关键修复**:
    - `updateTexture` 中增加检查：如果 `_dirty` 为 false 且 `_texture` 存在，直接返回。
    - 检查 `Text` 是否有逻辑会在变换时错误地设 `_dirty`。目前代码中只有 setter 会设 `_dirty`。
    - **潜在问题**: 如果 `Node` 的某些操作（如 `updateTransform`）触发了 `invalidate`（目前看没有，只有 setter 触发），那么就会导致重绘。
    - **真正的问题**: 很可能是因为 `InteractionManager` 在拖拽时，会修改 `node.x/y`。在 `Node.ts` 中，`x/y` setter 会调用 `invalidateWithChange`，进而调用 `invalidate()`。
    - **Text.ts** 重写了 `invalidate` 方法：
      ```typescript
      public invalidate() {
          this._dirty = true; // <--- 罪魁祸首！
          super.invalidate();
      }
      ```
      这意味着，只要 `Text` 节点（或其子节点）发生任何变动（包括位置移动），`invalidate` 就会被调用，进而导致 `_dirty = true`，然后在下一帧渲染时重新生成纹理！

## 2. 修正 `Text.ts` 的脏标记逻辑
我们需要区分 "变换脏" (Transform Dirty) 和 "内容脏" (Content Dirty)。
- **修改**:
    - 将 `_dirty` 重命名为 `_contentDirty` 以明确意图。
    - 移除 `invalidate()` 的重写，或者修改它使其不标记内容脏。
    - 仅在 `text`, `fontSize`, `fillStyle`, `fontFamily` 的 setter 中设置 `_contentDirty = true`。
    - `invalidate()` 应该只负责通知渲染循环需要重绘（Scene Dirty），而不应该标记内容需要更新。

## 3. 验证
- 确认拖拽 Text 节点时，不会触发 `updateTexture` 中的 Canvas 绘制和纹理上传。
- 确认修改文本内容时，纹理会正确更新。
