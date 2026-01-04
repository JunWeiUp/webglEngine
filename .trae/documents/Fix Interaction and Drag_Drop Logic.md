I will fix the interaction issues by:

1.  **Enabling Events**: In `src/engine/core/Renderer.ts`, I will remove the `pointerEvents = 'none'` style from the 2D canvas. This is currently blocking all mouse events from reaching the `InteractionManager`.
2.  **Improving Drag Logic**: In `src/engine/events/InteractionManager.ts`, I will refine the drag calculation. Instead of just dividing by the scene scale, I will correctly transform the screen delta vector into the node's parent local space using the inverse world matrix. This ensures dragging works correctly even inside rotated or scaled containers.

This will restore drag, zoom, and pan capabilities as requested.