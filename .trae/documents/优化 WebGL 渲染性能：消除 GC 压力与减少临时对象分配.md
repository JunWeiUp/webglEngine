# WebGL 文本渲染性能进一步优化计划

用户反馈在实现纹理图集后，Text 渲染在缩放平移时仍然卡顿。我们已经解决了重复上传纹理的问题，现在的瓶颈可能在于 **Draw Call 的频繁 Flush**。

## 问题分析
在 `Renderer.ts` 的 `drawQuad` 中，我们有一个批处理机制：
```typescript
let textureIndex = this.textureSlots.indexOf(texture);
if (textureIndex === -1) {
    if (this.textureSlots.length >= Renderer.MAX_TEXTURES) {
        this.flush(); // <--- 关键点
        // ...
    }
}
```
虽然我们有了 `AtlasManager`，所有的 Text 理想情况下都应该共享同一个（或少数几个）Page Texture。但是，如果场景中混杂了 `Sprite`（使用独立纹理或另一个 Atlas）和 `Text`，且渲染顺序是交错的（例如：Sprite -> Text -> Sprite -> Text），那么 `Renderer` 会因为纹理切换频繁而不断 `flush`，导致批处理失效。

## 解决方案：按纹理排序 (Texture Sorting)
在提交渲染之前，如果我们能对渲染指令进行排序，尽量让使用相同纹理的 Quad 靠在一起，就能最大化批处理效率。
但改变渲染顺序可能会破坏混合（Alpha Blending）的正确性（后绘制的盖在先绘制的上面）。
对于不透明物体，排序是安全的且推荐的。
对于半透明物体（如 Text），必须严格按照从后到前的顺序（Painter's Algorithm）或者依赖 Z-Buffer（但 WebGL 2D 引擎通常不开启深度测试以简化混合）。

**更实际的优化方案：**
1.  **Z轴排序/层级管理**：确保同一层级的节点尽量使用相同的纹理。
2.  **增加纹理槽位**：WebGL 通常支持至少 8 个甚至 16/32 个纹理单元。我们目前硬编码了 `MAX_TEXTURES = 8`。可以检查硬件上限并增加它。
3.  **避免无意义的 Flush**：检查 `Renderer` 是否过于激进地 Flush。
4.  **剔除优化 (Culling)**：目前的剔除是基于 AABB 的，对于大量文本节点，计算量也不小。可以考虑更高效的空间索引（如 QuadTree），但在当前架构下可能改动较大。
5.  **减少 updateTransform 开销**：`scene.updateTransform` 是递归的，如果层级很深，每帧计算矩阵也有开销。

**针对当前情况的快速优化 (Quick Win)**：
**优化 `isNodeVisible` 计算**：
目前的 `isNodeVisible` 在每一帧对每个节点都计算了 4 个顶点的世界坐标变换，涉及大量的矩阵乘法。
```typescript
// 4次矩阵向量乘法
const wx = x * m[0] + y * m[3] + m[6];
// ...
```
对于成千上万个文本节点，这非常昂贵。
**优化策略**：
1.  **预计算 Bounds**：如果节点没有移动（Dirty 标记），复用上一帧的 AABB。
2.  **简化剔除**：对于 Text，通常尺寸较小，可以用一个简化的中心点 + 半径或粗略的 AABB 进行剔除，或者仅在父容器层面剔除。

**更直接的瓶颈：**
用户提到 "缩放平移的时候"，这正是 `updateTransform` 和 `isNodeVisible` 压力最大的时候。
且 `Text` 的 `renderWebGL` 中：
```typescript
const vertices = new Float32Array([...]); // 每帧都在 new Float32Array
```
**这是巨大的 GC 压力！** 每帧为每个可见的 Text 创建一个新的 `Float32Array`，在大量文本移动时会造成频繁 GC 卡顿。

## 执行计划

1.  **移除 `renderWebGL` 中的内存分配** (Critical)
    *   `Text.ts`: 避免在 `renderWebGL` 中 `new Float32Array`。使用成员变量或静态共享的临时数组。
2.  **优化 `Renderer` 的矩阵计算** (Major)
    *   `Renderer.ts`: `isNodeVisible` 中的矩阵乘法可以内联展开，或者避免每一帧都对所有节点做全量 AABB 计算（虽然这个较难改，先从内存入手）。

## 具体步骤
1.  修改 `Text.ts`，将 `vertices` 和 `color` 缓存起来，或者直接计算数值传递给 `renderer.drawQuad`（需要修改 `drawQuad` 签名以接受普通数组或直接传数值，避免 TypedArray 开销）。
    *   其实 `renderer.drawQuad` 内部也是把 `Float32Array` 里的值读出来填进 `vertexBufferData`。
    *   **最佳实践**：`drawQuad` 应该接受 `x, y, w, h, matrix` 或直接接受 4 个顶点的坐标，而不是要求调用者打包成 `Float32Array`。

2.  修改 `Renderer.ts` 的 `drawQuad` 接口，支持直接传入坐标数值，避免调用方创建临时数组。

3.  (可选) 增加 `MAX_TEXTURES` 到 16 (如果硬件支持)。

我们先执行 1 和 2，这能显著减少 GC。
