I will fix the ghosting/residual issue when dragging text by resetting the Canvas2D transform before clearing the canvas.

1.  **Modify `src/engine/core/Renderer.ts`**:
    *   In the `render` method, insert `this.ctx.setTransform(1, 0, 0, 1, 0, 0);` before `this.ctx.clearRect(...)`.
    *   This ensures that the `clearRect` operation always clears the entire physical canvas, regardless of any transformations applied during the previous frame's rendering.

This change guarantees a clean slate for every frame, eliminating any trails left by moving text elements.