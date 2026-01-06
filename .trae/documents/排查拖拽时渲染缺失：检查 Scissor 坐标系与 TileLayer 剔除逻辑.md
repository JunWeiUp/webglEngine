# 解决拖拽时的渲染缺失问题

用户反馈在拖拽（拖砖？）的时候，周围的部件会出现没有绘制的问题。这通常意味着脏矩形（Dirty Rect）的更新范围不足，或者在拖拽过程中某些应该被重绘的区域被遗漏了。

## 问题分析

我们之前已经针对“子部件超出父节点”的情况进行了修复（在 `Node.ts` 中，如果有子节点则全屏重绘）。
但用户现在的描述是“周围的部件会出现没有绘制”。这可能指向以下几个原因：

1.  **脏矩形清除不彻底**：当物体移动后，旧位置需要被清除（用背景色填充）。如果脏矩形计算正确，`gl.scissor` + `gl.clear` 会清除该区域。但如果该区域内还有**其他静止的物体**（周围的部件），它们也必须被重绘。
    *   `Renderer.render` 的逻辑是：清除脏矩形 -> 遍历场景树 -> 绘制与脏矩形相交的节点。
    *   如果 `isNodeVisible`（基于 AABB 剔除）判断错误，认为某些周围的部件不在脏矩形内（实际上它们被脏矩形覆盖了一部分），那么这些部件就不会被重绘。
    *   **结果**：脏矩形区域被 `gl.clear` 擦成了背景色，而被覆盖的那部分“周围部件”没有画上去，看起来就像是缺失了（显示为背景色漏洞）。

2.  **`isNodeVisible` 的精度问题**：
    *   我们最近优化了 `isNodeVisible`，优先使用 `node.worldAABB`。
    *   如果 `node.worldAABB` 没有及时更新（例如在同一帧内，拖拽导致了变换，但 AABB 还没更新），或者 AABB 计算有误，就会导致剔除错误。
    *   在 `Node.ts` 的 `invalidateWithSelfBounds` 中，我们调用了 `updateTransform`，所以 AABB 应该是新的。

3.  **AuxiliaryLayer 的高亮影响**：
    *   `InteractionManager` 中在 `onMouseMove` 处理悬停高亮时，会计算 `oldBounds` 和 `newBounds` 并提交 `invalidateAuxArea`。
    *   如果这个计算不准确，或者 padding 不够，可能会导致高亮框残影，或者擦除了周围的内容。
    *   但用户说的是“拖拽的时候”，此时悬停高亮逻辑通常是暂停的（`if (!this.auxLayer.draggingNode ...)`）。

4.  **全屏重绘的回退**：
    *   如果拖拽的是一个复杂的组合体（有子节点），我们在 `Node.ts` 中强制触发了 `invalidate()` (全屏重绘)。此时 `dirtyRect` 为 undefined，`Renderer` 会重绘整个视口。这种情况下应该不会有“周围部件缺失”的问题，除非 `isNodeVisible` 在全屏重绘时也剔除了屏幕内的物体。

5.  **单节点拖拽 (局部重绘) 的隐患**：
    *   如果拖拽的是一个**没有子节点**的 Sprite（例如一个砖块）。
    *   `Node.ts` 计算出局部脏矩形 `union(oldRect, newRect)`。
    *   `Engine` 提交这个脏矩形。
    *   `Renderer` 设置 Scissor 为该脏矩形，Clear，然后重绘。
    *   **关键点**：`Renderer` 必须重绘**所有**与该脏矩形相交的物体，而不仅仅是正在拖拽的那个物体。
    *   如果“周围的部件”与脏矩形相交，但被 `isNodeVisible` 错误剔除了，就会消失。

    *   **为什么会被错误剔除？**
        *   `isNodeVisible` 检查的是 `node.worldAABB` 与 `cullingRect` (即脏矩形) 的交集。
        *   如果 AABB 是正确的，逻辑就没问题。
        *   **除非**：AABB 是旧的？
        *   周围的部件没有动，它们的 AABB 是上一帧的（或者是初始化的）。应该是正确的。
        *   **除非**：浮点数精度问题？或者 `isNodeVisible` 的边界判断太严格？
        *   `maxX < viewX` vs `maxX <= viewX`? 我们用的是 `<`，这是对的。

6.  **特殊情况：Z-fighting 或 深度测试？**
    *   我们是 2D 引擎，通常不开深度测试，按顺序绘制。

**最可疑的点：`InteractionManager` 的拖拽逻辑直接修改 `x, y`**
```typescript
node.x += localDeltaX;
node.y += localDeltaY;
```
这会触发 `Node` 的 setter，进而触发 `invalidateWithSelfBounds`。
这会立即提交一个脏矩形给 `Engine`。
如果一帧内移动了多个节点（例如多选拖拽），或者鼠标移动事件频率很高，可能会提交多个脏矩形。
`Engine` 是如何处理多个脏矩形的？
让我们检查 `Engine.ts`。

如果 `Engine` 将多个脏矩形合并（Union），或者只处理最后一个？
通常 `Engine` 会在 `requestAnimationFrame` 中处理。
如果 `invalidate` 只是设置标志位或合并 Rect，然后在下一帧渲染。

**假设 `Engine` 正确合并了脏矩形。**

**再看 `InteractionManager` 的拖拽逻辑**：
```typescript
            for (const node of topLevelNodes) {
                // ...
                node.x += localDeltaX;
                node.y += localDeltaY;
            }
```
如果是多选拖拽，每个节点都会触发一次 `invalidate`。`Engine` 应该合并它们。

**还有一种可能：Canvas 2D AuxLayer 的干扰**
AuxLayer（选框、高亮）是画在另一个 Canvas 上的吗？还是同一个？
如果是同一个 WebGL Canvas（混合渲染），`gl.clear` 会擦除 Aux 内容。
如果是分层的（HTML 叠加），则互不影响。
查看 `Renderer.ts` 或 `Engine.ts`，似乎是分离的 Pass，或者是同一个 Context？
通常 WebGL 引擎的 UI 层是独立的 DOM 元素。

**回到用户描述：“周围的部件会出现没有绘制”**
这听起来像是 Scissor 区域被 Clear 了，但只有被拖拽的物体被重绘了，背景里的其他物体没画出来。
这意味着 `isNodeVisible` 返回了 `false`，对于那些静止的背景物体。
但它们明明在 Scissor 区域内（否则不会被 Clear 掉）。

**让我们检查 `Renderer.ts` 的 `isNodeVisible` 实现**：
```typescript
        const viewX = cullingRect ? cullingRect.x : 0;
        const viewY = cullingRect ? cullingRect.y : 0;
        const viewW = cullingRect ? cullingRect.width : this.width;
        const viewH = cullingRect ? cullingRect.height : this.height;

        if (maxX < viewX || minX > viewX + viewW || maxY < viewY || minY > viewY + viewH) {
            return false;
        }
```
逻辑看起来是标准的 AABB 相交检测。

**有没有可能是坐标系问题？**
`cullingRect` 是屏幕坐标（像素）。
`node.worldAABB` 是世界坐标。
在我们的引擎中，世界坐标 = 屏幕坐标吗？
如果 `Scene` 被缩放或平移了，`Node` 的 `worldMatrix` 包含了 Scene 的变换。
所以 `node.worldAABB` 是屏幕空间下的包围盒（因为根节点 Scene 的 parent 是 null，或者 Scene 的变换直接映射到屏幕？）。
通常 `Scene` 是根节点，它的变换决定了视口漫游。
所以 `node.worldAABB` 确实是屏幕坐标。

**但是**，`Renderer` 的 `render(scene)` 并没有应用任何全局 Camera 矩阵，而是依赖 Scene 自身的 transform。
所以 `isNodeVisible` 的比较是正确的。

**那问题出在哪里？**
**Padding!**
如果脏矩形计算得非常紧凑（精确等于物体移动前后的包围盒并集）。
在浮点数运算下，可能存在微小的误差。
或者，纹理采样时的双线性过滤（Bilinear Filtering）需要额外的 1 像素边缘。
如果 Scissor 刚好切在物体的边缘，可能会导致边缘像素被切掉，或者由于采样不到相邻像素而变透明？
但这不会导致“周围的部件”消失，只会导致拖拽物体边缘异常。

**用户说的是“周围的部件”**。
这意味着被 Scissor 框住的背景物体没画出来。
如果背景物体很大（比如 TileLayer 的一个 Tile，或者一个大背景图）。
它的 AABB 很大，肯定与 Scissor 相交。`isNodeVisible` 应该返回 true。

**除非... `TileLayer` 或其他容器的剔除逻辑有问题？**
如果周围部件是 `TileLayer` 里的瓦片。
`TileLayer` 有自己的 `renderWebGL` 实现吗？还是用的通用 `renderNodeWebGL`？
通常 `TileLayer` 会重写 `renderWebGL`。
让我们检查 `TileLayer.ts`。

**假设 `TileLayer` 自定义了剔除**：
如果 `TileLayer` 内部只渲染“它认为可见”的瓦片。
而它判断可见性的依据是“当前视口”。
如果传入了 `dirtyRect`，`TileLayer` 是否使用了这个 `dirtyRect` 来判断瓦片可见性？
如果 `TileLayer` 忽略了 `dirtyRect`，只用全屏视口判断，那应该画得更多，而不是更少。
但如果 `TileLayer` 的 `renderWebGL` 并没有正确处理 `cullingRect` 参数，或者 `Renderer` 在调用子节点渲染时没传下去？

`Renderer.ts`:
```typescript
    private renderNodeWebGL(node: Node, cullingRect?: Rect) {
        // ...
        if (isVisible) {
            // ...
            if ('renderWebGL' in node) {
                (node as any).renderWebGL(this, cullingRect); // <--- 传递了吗？
            }
            // ...
        }
    }
```
我们需要确认 `node.renderWebGL` 是否接收并使用了 `cullingRect`。
如果是默认的 `Node` 或 `Sprite`，它们没有 `renderWebGL` 方法（或者用的是基类的？不，`Renderer` 负责绘制 Sprite）。
只有自定义渲染逻辑的节点（如 `Text`, `TileLayer`）才有。

**检查 `TileLayer.ts`**：
如果 `TileLayer` 在局部重绘时，发现脏矩形很小（比如在屏幕中间），它应该绘制与该脏矩形相交的所有瓦片。
如果它因为某种原因（比如优化过度）判定不需要绘制，那背景就黑了。

**另一个可能性：`Engine` 的 `dirtyRect` 坐标系**
`Node.getBounds()` 返回的是世界坐标（屏幕坐标）。
`Engine` 接收并传递给 `Renderer`。
`Renderer` 用它做 `scissor`。`scissor` 坐标系原点在左下角（WebGL 标准）还是左上角？
`gl.scissor(x, y, width, height)`。
在 WebGL 中，`x, y` 指定裁剪框的**左下角**。
而我们的 2D 引擎坐标系通常原点在**左上角**。
**这是一个巨大的坑！**
如果 `Renderer` 没有对 `dirtyRect.y` 做翻转处理，那么 Scissor 区域就是错的（垂直镜像）。
如果 Scissor 区域切到了错误的地方（比如屏幕下方而不是上方），那么：
1.  该区域被 Clear 了。
2.  该区域内的物体被重绘了（如果 `isNodeVisible` 用的是同样的错误区域，或者 `isNodeVisible` 是对的但画错了位置）。

**检查 `Renderer.ts` 的 `gl.scissor` 调用**：
```typescript
            const y = this.height - dirtyRect.y - dirtyRect.height; // <--- 是否做了翻转？
            this.gl.scissor(dirtyRect.x, y, dirtyRect.width, dirtyRect.height);
```
如果没有这行翻转代码，或者翻转逻辑不对，那就是原因！
当拖拽物体在屏幕上方时，Scissor 切在屏幕下方。
屏幕下方被 Clear 了（背景变黑）。
屏幕上方的物体移动了，留下了残影（因为没被 Clear）。
或者反过来。

**待验证点**：
1.  `Renderer.ts` 中 `gl.scissor` 的 Y 轴翻转逻辑。
2.  `TileLayer.ts` 对 `cullingRect` 的处理。

**计划**：
1.  读取 `Renderer.ts`，检查 `gl.scissor`。
2.  读取 `TileLayer.ts`，检查渲染逻辑。

如果是 Scissor 坐标系问题，那修复起来很快。
如果是 TileLayer 问题，也容易修。
