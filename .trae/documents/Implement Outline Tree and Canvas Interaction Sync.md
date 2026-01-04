I will implement the synchronization between the Outline Tree (UI) and the Canvas (InteractionManager/AuxiliaryLayer) to support selection and hover states in both directions.

## Implementation Steps

### 1. Update `InteractionManager`
Modify `src/engine/events/InteractionManager.ts` to expose events for state changes:
- Add `onSelectionChange` and `onHoverChange` callbacks.
- Trigger `onSelectionChange` when `selectedNodes` changes in `onMouseDown` (or when clearing selection).
- Trigger `onHoverChange` when `hoveredNode` changes in `onMouseMove`.

### 2. Update `OutlineView`
Refactor `src/engine/ui/OutlineView.ts` to use `AuxiliaryLayer` as the source of truth:
- Update constructor to accept `AuxiliaryLayer`.
- Implement a `nodeMap: Map<Node, HTMLElement>` to store references to DOM elements for efficient updates.
- Create a `updateHighlight()` method that iterates through the `nodeMap` and updates styles (background/text color) based on `AuxiliaryLayer` state (selected/hovered), without rebuilding the entire DOM.
- Update `renderNode()` to:
    - Register nodes in `nodeMap`.
    - Add click listeners to update `AuxiliaryLayer.selectedNodes` and trigger updates.
    - Add mouseover/mouseout listeners to update `AuxiliaryLayer.hoveredNode` and trigger updates.
- Ensure `update()` calls `updateHighlight()` after rebuilding the tree.

### 3. Update `Engine`
Modify `src/engine/Engine.ts` to wire everything together:
- Pass `this.auxLayer` to the `OutlineView` constructor.
- Subscribe to `interaction.onSelectionChange` and `interaction.onHoverChange` to call `outline.updateHighlight()`.
- Ensure `interaction.onStructureChange` still calls `outline.update()` (full rebuild).

This approach ensures that:
- **Canvas -> Tree**: Clicking or hovering objects in the scene updates the tree highlighting.
- **Tree -> Canvas**: Clicking or hovering items in the tree updates the scene selection/highlighting.
