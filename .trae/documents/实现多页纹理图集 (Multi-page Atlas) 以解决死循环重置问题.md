# 实现纹理图集 (Texture Atlas) 优化

为了进一步优化 WebGL 文本渲染性能，减少纹理切换开销，我们将实现一个简单的纹理图集系统。

## 1. 新建 `TextureAtlas` 类

* **位置**: `src/engine/utils/TextureAtlas.ts`

* **功能**:

  * 维护一个大的 Canvas/Texture 作为图集。

  * 提供 `allocate(width, height)` 方法，在图集中分配空间（使用简单的行/列分配算法或二叉树算法，初期可以使用简单的 "Shelf Packing" 或 "Next Fit"）。

  * 提供 `updateSubImage(x, y, image)` 方法，将小图绘制到图集上。

  * 管理图集的扩容（如果空间不足）。

  * 记录每个子纹理的 UV 坐标。

## 2. 修改 `TextureManager`

* 引入全局唯一的（或按类型的）`TextureAtlas` 实例。

* 提供获取/创建 Atlas Texture 的接口。

## 3. 修改 `Text.ts`

* 不再为每个 Text 节点创建独立的 WebGL Texture。

* 在 `updateTexture` 中，请求 `TextureAtlas` 分配空间。

* 将生成的 Canvas 绘制到 Atlas 上。

* 记录 Atlas 的纹理引用和分配到的 UV 坐标。

* 在 `renderWebGL` 时，使用 Atlas 纹理和计算出的 UV。

## 简化方案 (MVP)

考虑到代码复杂度和当前需求，我们可以先实现一个**针对文本的专用图集系统**，或者更简单地，让 `Text` 类共享一个静态的 `TextureAtlas`。

### 具体步骤：

1. **创建** **`src/engine/utils/AtlasManager.ts`**:

   * 管理一个大尺寸 (e.g., 2048x2048) 的 Canvas 和对应的 WebGL Texture。

   * 实现简单的空间分配算法 (Shelf Packing)。

   * 提供 `addText(canvas)` 方法，返回 `{ texture, uvs }`。

2. **更新** **`Text.ts`**:

   * 移除独立的 `_texture` 管理。

   * 在 `updateTexture` 中调用 `AtlasManager.addText(this._canvas)`。

   * 保存返回的 UV 和 Texture。

   * 处理文本更新时的空间释放（或简单地不释放，直到图集满重置，初期可简化）。

### 详细设计 (AtlasManager)

* `canvas`: HTMLCanvasElement (2048x2048)

* `texture`: WebGLTexture

* `cursorX`, `cursorY`, `rowHeight`: 用于简单的流式分配。

* `add(source: HTMLCanvasElement): { uvs: Float32Array, texture: WebGLTexture }`:

  * 检查当前行是否放得下。

  * 放得下 -> 绘制 -> 更新 cursorX -> 返回 UV。

  * 放不下 -> 换行 -> 检查高度 -> 放得下 -> 绘制 -> ...

  * 图集满 -> 清空重置 (最简单的 GC 策略)。

## 4. 验证

* 检查 Network/Memory，确认纹理数量减少。

* 检查渲染结果，确认文本显示正确且无错位。

