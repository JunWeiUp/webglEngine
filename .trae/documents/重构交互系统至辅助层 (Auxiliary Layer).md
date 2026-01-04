我将重构交互系统，引入一个专门的“辅助层”（Auxiliary Layer / Overlay Layer），用于处理所有的交互反馈（Hover, Select, Drag）和视觉提示。这将使交互逻辑与主渲染逻辑分离，提高系统的清晰度和灵活性。

具体计划如下：

1.  **创建 `SelectionOverlay` 类**（辅助层核心）：
    *   这是一个特殊的 `Node` 或独立的渲染模块，位于场景图的最上层，或者独立于场景图直接在 `render` 循环的最后绘制。
    *   **职责**：负责绘制 Hover 边框、Selection 边框、拖拽过程中的预览（Ghost）或连接线。
    *   它将持有 `InteractionManager` 的状态引用（hoveredNode, selectedNode）。

2.  **重构 `InteractionManager.ts`**：
    *   **移除直接修改物体属性的逻辑**：不再直接修改 `Node` 的 `isHovered` 或 `isSelected` 属性来改变其外观（目前 `Node` 里只有标志位，没有实际视觉效果）。
    *   **状态管理**：`InteractionManager` 将维护当前 Hover 和 Select 的节点，并通知 `SelectionOverlay` 进行绘制。
    *   **拖拽重构**：
        *   当开始拖拽时，不再直接移动场景中的物体。
        *   而是创建一个“代理”（Proxy）或在辅助层绘制该物体的半透明副本跟随鼠标。
        *   只有在 `onMouseUp` 且确认操作有效（如 reparent）时，才真正修改场景图结构和物体位置。
        *   **或者**（更符合通常的编辑器习惯）：拖拽时物体本身移动，但在辅助层绘制“目标父节点”的高亮框，提示用户如果松手会落入哪里。根据您的需求“将拖入拖出移入到辅助层去实现”，我理解为您希望交互的**视觉反馈和判定逻辑**更集中在辅助层。
        *   **方案选择**：为了更好的体验，我将采用：**物体跟随鼠标移动（保持现状，因为直观）+ 辅助层绘制高亮框（提示 Hover 目标和父级关系）**。如果您的意思是“拖拽逻辑本身”要在辅助层处理（即不改变原物体位置，直到松手），我也可以调整为 Proxy 模式。**这里我将采用 Proxy 模式**，即拖拽时原物体不动（或半透明），辅助层显示一个跟随鼠标的 Ghost，松手后原物体瞬移过去。这能更清晰地展示“拖入拖出”的意图。

3.  **实现 `AuxiliaryLayer` (Canvas2D)**：
    *   利用现有的 Canvas2D (`ctx`)。
    *   在 `Renderer.render` 的最后，调用 `AuxiliaryLayer.render(ctx)`。
    *   `AuxiliaryLayer` 会根据 `InteractionManager` 的状态，在物体周围绘制矩形框（蓝色表示选中，黄色表示 Hover，绿色表示拖拽放置目标）。

4.  **步骤**：
    1.  创建 `src/engine/display/AuxiliaryLayer.ts`。
    2.  修改 `InteractionManager`，引入 `AuxiliaryLayer`，并将交互状态（Hover/Select/Drag）同步给它。
    3.  修改 `InteractionManager` 的拖拽逻辑，改为更新辅助层的 Ghost 位置，而不是直接修改节点位置（直到 Drop）。
    4.  在 `Engine` 中集成 `AuxiliaryLayer`。

**效果目标**：
*   **Hover**：鼠标悬停在物体上时，辅助层绘制黄色边框。
*   **Select**：点击物体时，辅助层绘制蓝色边框。
*   **Drag**：拖拽时，原物体可能变半透明，辅助层显示一个跟随鼠标的“影子”。当影子经过其他容器时，该容器高亮（绿色），提示可以“放入”。松手后，物体真正移动并切换父子关系。