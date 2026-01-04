我将实现一个大纲树（Scene Outline/Hierarchy）功能，实时显示场景中所有部件的层级结构。

具体计划如下：

1.  **创建 `OutlineView` 类**：
    *   在 `src/engine/ui/`（需新建目录）下创建 `OutlineView.ts`。
    *   该类负责管理一个 DOM 元素（侧边栏），用于展示树状结构。
    *   实现递归遍历场景图（Scene Graph）并生成 HTML 列表（`<ul>`, `<li>`）的逻辑。
    *   **实时更新**：提供一个 `update()` 方法，每当场景结构发生变化（如添加、移除、重排父子关系）时调用。

2.  **集成到 `Engine` 和 `Main`**：
    *   在 `Engine` 类中实例化 `OutlineView`。
    *   为了性能考虑，可以使用观察者模式或简单的回调机制：每当 `Node` 的 `addChild`/`removeChild` 被调用时，或者在 `InteractionManager` 完成拖拽操作后，触发大纲树的更新。
    *   为了简化实现，初期可以在 `requestAnimationFrame` 循环中低频更新（例如每秒更新一次），或者在关键交互操作后手动触发更新。

3.  **UI 样式**：
    *   在屏幕左侧创建一个半透明的浮动面板，显示层级树。
    *   支持简单的展开/折叠（可选，视时间而定），显示节点名称（`name`）和类型。

4.  **交互同步（进阶）**：
    *   点击大纲树中的节点，高亮场景中的对应物体（设置 `isSelected`）。

**主要步骤：**
1.  新建 `src/engine/ui/OutlineView.ts`。
2.  修改 `src/engine/Engine.ts` 集成 `OutlineView`。
3.  在 `src/engine/display/Node.ts` 中添加简单的事件通知机制（或在 `InteractionManager` 中手动触发更新）。
4.  调整 `src/main.ts` 确保 UI 不遮挡。