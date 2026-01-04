用户希望实现“框选能力”。这意味着用户可以通过拖拽鼠标在屏幕上画一个矩形框，所有被该矩形框覆盖或包含的节点（主要是 Sprite 或 Container）都应该被选中。

**核心需求分析**：
1.  **交互模式**：需要区分“拖拽移动物体/平移地图”和“框选”。通常的做法是：
    *   点击空白处拖拽 -> 平移地图（当前行为）。
    *   按住 Shift/Ctrl 键拖拽 -> 框选。
    *   或者：默认拖拽空白处是框选，按住空格/中键是平移（但这会改变当前行为）。
    *   考虑到当前已有拖拽物体和平移地图的逻辑，我建议使用 **按住 Shift 键 + 拖拽** 来触发框选模式。
2.  **视觉反馈**：在拖拽过程中，需要在屏幕上绘制一个半透明的矩形框（Selection Box）。这应该在 `AuxiliaryLayer` 中实现。
3.  **选中逻辑**：当释放鼠标时，计算框选矩形与场景中所有可交互节点的碰撞（AABB 相交测试），并将所有命中的节点标记为选中。
4.  **多选支持**：`AuxiliaryLayer` 目前只有 `selectedNode`（单选），需要扩展为 `selectedNodes: Set<Node>` 或 `Node[]` 以支持多选。

**实施计划**：

1.  **修改 `AuxiliaryLayer.ts`**：
    *   将 `selectedNode` 改为 `selectedNodes: Set<Node>`。
    *   添加 `selectionRect` 属性（`{start: vec2, end: vec2} | null`）用于存储当前的框选区域。
    *   更新 `render` 方法：
        *   绘制 `selectedNodes` 集合中所有节点的包围盒。
        *   如果 `selectionRect` 存在，绘制半透明的蓝色矩形框。

2.  **修改 `InteractionManager.ts`**：
    *   添加 `isBoxSelecting` 状态标志。
    *   **OnMouseDown**：
        *   如果按住了 Shift 键，且没有点击到物体（或者即使点击到物体也想框选？通常是点击空白处开始），则进入框选模式。
        *   记录框选起始点。
    *   **OnMouseMove**：
        *   如果是框选模式，更新框选结束点。
        *   同时更新 `AuxiliaryLayer` 的 `selectionRect`。
    *   **OnMouseUp**：
        *   如果是框选模式：
            *   计算框选矩形（世界坐标或屏幕坐标）。
            *   遍历场景树，检测哪些节点与框选矩形相交（使用屏幕空间 AABB 比较最简单）。
            *   更新 `AuxiliaryLayer.selectedNodes`。
            *   重置框选状态。
    *   兼容单选逻辑：点击单个物体时，清除之前的多选，只选中当前物体（除非按住 Shift/Ctrl 进行加选，这里先简化为 Shift 仅用于画框，点击用于单选）。

3.  **适配现有逻辑**：
    *   确保拖拽逻辑（`draggingNode`）与框选逻辑互斥。
    *   确保平移逻辑（`isPanning`）与框选逻辑互斥。

**具体修改点**：
*   `AuxiliaryLayer`: `selectedNode` -> `selectedNodes`.
*   `InteractionManager`: 处理 Shift + Drag 事件流，实现 `boxSelect` 方法。

**注意**：为了保持代码稳健，我将保留 `selectedNode` 作为 getter（返回第一个选中的节点），以兼容可能依赖它的代码，但内部使用 `selectedNodes` 集合。或者彻底重构为多选。考虑到当前代码量不大，我将重构相关引用。