我已经找到了问题所在。`InteractionManager.ts` 和 `main.ts` 仍然直接修改 `node.transform.position` 并调用 `scene.invalidate()`（这会触发全屏重绘），从而绕过了我在 `Node.ts` 中新增的脏矩形优化逻辑。

为了修复这个问题并确保 `dirtyRect` 的日志被触发，我需要重构代码以使用新的 `x`, `y`, `scaleX`, `scaleY` Getters/Setters。

## 计划

### 1. 重构 `src/engine/events/InteractionManager.ts`
更新交互逻辑以使用 Node 属性而不是直接访问 Transform。这将自动触发带有正确脏区域的 `invalidate(rect)`。

*   **拖拽逻辑 (Dragging)**: 将 `node.transform.position[0] += ...` 改为 `node.x += ...`。
*   **平移逻辑 (Panning)**: 将 `this.scene.transform.position[...] += ...` 改为 `this.scene.x += ...`。
*   **缩放逻辑 (Zooming)**: 将 `this.scene.transform.scale[...] = ...` 改为 `this.scene.scaleX = ...`。
*   **层级改变逻辑 (Reparenting)**: 更新位置赋值以使用 `node.x` 和 `node.y`。
*   **移除手动失效调用**: 在使用 Setter 的地方移除 `node.transform.dirty = true` 和 `scene.invalidate()` 调用，因为 Setter 会自动处理。

### 2. 重构 `src/main.ts`
更新 UI 按钮处理程序以使用新 API。

*   在创建新 Sprite/Container 时，将 `sprite.transform.position = [...]` 改为 `sprite.x = ...; sprite.y = ...;`。

### 3. 验证
更改后，当您拖动对象时，引擎将：
1.  通过 Setter 检测属性更改。
2.  自动计算脏矩形（旧包围盒 U 新包围盒）。
3.  调用 `invalidateArea(rect)`。
4.  使用有效的 `dirtyRect` 触发 `Renderer.render`。
5.  执行 `Renderer.ts:210` 处的日志语句。