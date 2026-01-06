# WebGL 剔除优化：确保首帧及后续帧均只渲染视口内容

用户指出“第一次也不需要全部渲染，只渲染视口内的”。这意味着我们需要确认当前的剔除逻辑是否在所有情况下（包括首帧）都生效，并且足够严格。

## 现状确认
目前 `Renderer.renderNodeWebGL` 中的逻辑是：
```typescript
        // 视锥体剔除 (Frustum Culling)
        let isVisible = true;
        
        // 仅对有尺寸的节点进行剔除检查
        if (node.width > 0 && node.height > 0) {
            isVisible = this.isNodeVisible(node, cullingRect);
        }

        if (isVisible) {
             // render...
        }
```
这里的 `cullingRect` 参数来自 `render(scene, dirtyRect)`。
*   如果是全屏重绘 (`invalidateFull`)，`dirtyRect` 是 `undefined`。
*   在 `isNodeVisible` 中：
    ```typescript
        // AABB 相交检测: 检查是否与视口 (或 DirtyRect) 重叠
        const viewX = cullingRect ? cullingRect.x : 0;
        const viewY = cullingRect ? cullingRect.y : 0;
        const viewW = cullingRect ? cullingRect.width : this.width;
        const viewH = cullingRect ? cullingRect.height : this.height;

        if (maxX < viewX || minX > viewX + viewW || maxY < viewY || minY > viewY + viewH) {
            return false;
        }
    ```
    当 `cullingRect` 为 `undefined` 时，它默认使用 `this.width` 和 `this.height` (即 Canvas 尺寸，也就是视口大小)。

**结论：逻辑上已经是只渲染视口内的了。** 即使是第一帧全屏重绘，也只会绘制与 Canvas 矩形相交的节点。

## 可能的问题
如果用户感觉“第一次全部渲染了”，可能是因为：
1.  **节点没有尺寸**：如果 `Sprite` 或 `Text` 在第一帧渲染时 `width/height` 为 0（例如图片未加载完成，或 Text 未测量），则 `isVisible` 默认为 `true`，导致所有节点都被提交给 GPU（虽然可能画不出东西，但占用了遍历和批处理开销）。
2.  **世界矩阵未更新**：在第一帧 `render` 之前，`updateTransform` 被调用。如果此时位置/尺寸不对，剔除就会失效。
3.  **视口尺寸错误**：`renderer.width/height` 是否在第一帧正确设置？

## 优化方案：利用缓存 AABB 强化剔除

无论是否第一帧，我们都应该利用 `Node` 中已缓存的 `worldAABB` 来加速 `isNodeVisible`。这不仅能解决性能问题，也能确保剔除逻辑的一致性。

同时，我们需要检查 `Node` 初始化时（特别是图片加载前）的尺寸问题。
对于 `Sprite`，默认宽高可能是 0。
对于 `Text`，默认宽高可能是 0 或估算值。

**更激进的剔除**：
如果节点有子节点，但自身无尺寸（Group），目前是默认可见。如果能计算 Group 的 AABB，就能整块剔除。但动态计算 Group AABB 开销大。

**针对用户的回应**：
我们将重点优化 `Renderer.ts`，确保 `isNodeVisible` **总是** 生效且高效，利用 `worldAABB` 缓存。这样，只要 `worldAABB` 正确（它在 `updateTransform` 中更新，早于 `render`），剔除就是准确的。

## 执行步骤
1.  **修改 `Renderer.ts`**：
    *   在 `isNodeVisible` 中，优先读取 `node.worldAABB`。
    *   仅当 `worldAABB` 为空时（理论上不应发生，只要有尺寸），才回退到实时计算。

2.  **验证逻辑**：
    *   当 `cullingRect` 为空时，确保使用 `renderer.width/height` 作为剔除边界（这已经是现状，确认保持）。

这将确保无论是首帧还是后续帧，任何在视口外的实体节点都会被高效剔除。
