# WebGL 深度优化计划：多纹理批处理与静态批处理

用户同意继续优化，我们将重点解决以下两个问题：

## 1. 多纹理批处理优化 (Texture Sorting / Smart Batching)

**现状**：
目前 `Renderer.drawQuad` 的逻辑是简单的“先进先出”：
```typescript
let textureIndex = this.textureSlots.indexOf(texture);
if (textureIndex === -1) {
    if (this.textureSlots.length >= MAX_TEXTURES) {
        this.flush(); // <--- 只要遇到第 9 个不同的纹理，就强制 Flush
        // ...
    }
}
```
**问题**：如果场景中交替出现不同的纹理（例如 A, B, C, D, E, F, G, H, I, A, B...），一旦纹理种类超过 8 个，且绘制顺序是交错的，就会导致极其频繁的 `flush()`。例如：绘制了前 8 个不同纹理的物体后，第 9 个物体用了纹理 I，导致 Flush；第 10 个物体又用了纹理 A（已被清空），又导致 Flush。

**优化方案：纹理重排序 (Texture Reordering) 或 延迟 Flush**
要完全解决这个问题，通常需要对渲染指令进行排序（按纹理 ID 排序）。但这会破坏透明物体的混合顺序（Painter's Algorithm）。
考虑到我们是 2D 引擎，层级（Z-order）通常由 Scene Graph 的遍历顺序决定，不能随意改变绘制顺序。

**折中方案：智能 Flush**
我们无法改变遍历顺序，但我们可以优化 `textureSlots` 的替换策略？
WebGL 的 `drawElements` 使用的纹理槽是固定的。一旦 Flush，所有槽位清空。
目前的逻辑已经是标准的“贪婪批处理”了。

**改进点**：
如果纹理数量确实很多，唯一的办法是**增加纹理图集 (Atlas)** 的使用。
我们已经对 Text 做了 Atlas。对于 `TileLayer`，每个瓦片是独立的纹理。如果屏幕上同时显示超过 8 个不同的瓦片（很常见），就会频繁 Flush。

**针对 TileLayer 的优化**：
TileLayer 的瓦片通常是 256x256。如果屏幕是 1920x1080，大概会有 8x5 = 40 个瓦片。
这意味着绘制一个全屏地图，至少要 Flush 40 / 8 = 5 次。这其实是可以接受的（5 次 draw calls）。
**真正的问题是**：如果这 40 个瓦片和上面的几千个 Sprite/Text 交错绘制（例如每个瓦片上放一个 Sprite），那 Flush 次数就是 40 * N。
但通常 TileLayer 是作为背景一次性绘制的（位于节点树底层）。所以它自己 Flush 5 次问题不大。

**真正的瓶颈可能在于 Sprite**：
如果用户有大量不同的 Sprite 图片（图标、头像），且没有打成图集。
**行动**：我们需要在 `README` 中强烈建议用户使用图集，或者在引擎层面提供自动 Sprite Atlas（类似 Text Atlas）。

**本次任务的具体优化**：
我们将实现一个简单的 **Sprite Atlas** 系统，或者优化 `Renderer` 的统计信息，让用户知道发生了多少次 Flush。
同时，我们可以尝试将 `MAX_TEXTURES` 增加到 16（如果硬件支持）。大多数现代 PC/手机支持 16 个纹理单元。

## 2. 静态批处理 (Static Batching) 探索

对于 `TileLayer` 这种一旦加载就不动的物体，每帧计算顶点并上传是浪费的。
虽然我们用了 `sharedVertices` 减少 GC，但 CPU 依然在计算 `posX * m00...` 并写入 `Float32Array`。

**优化方案**：
对于 `TileLayer`，我们可以创建一个**专用的 VertexBuffer**。
当瓦片加载完成或视口变化时，一次性构建好整个网格的顶点数据，上传到 GPU。
渲染时，只需绑定这个 Buffer 并调用一次 `gl.drawArrays`（或 Elements）。
*难点*：TileLayer 是无限滚动的，且包含 LOD。它的网格是动态变化的。
真正的“静态”是指网格拓扑不变。但 TileLayer 的可见瓦片列表每帧都可能变（在平移时）。
不过，在**不平移**的时候，它是完全静态的。

**更实际的优化**：
目前 `Renderer` 是全量的动态批处理（每帧上传所有顶点）。
我们可以引入 `StaticMeshNode`？
考虑到工程复杂度，目前性价比最高的是 **增加纹理槽位** 和 **性能监控**。

## 计划执行

1.  **增加纹理槽位检测**：在 `Renderer` 初始化时检查 `gl.MAX_TEXTURE_IMAGE_UNITS`，并动态设置 `MAX_TEXTURES`（通常可达 16 或 32），这将直接减少 Flush 次数。
2.  **性能监控增强**：在 `Renderer` 中添加 `drawCallCount` 和 `flushCount` 统计，并在 `perf_monitor.ts` 或控制台输出，帮助用户（和我们）诊断瓶颈。

这两点是立竿见影且风险较低的优化。
