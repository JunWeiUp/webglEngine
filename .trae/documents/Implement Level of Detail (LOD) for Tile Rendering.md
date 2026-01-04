I will optimize the rendering performance by implementing a **Level of Detail (LOD)** system for the `TileLayer`. This will ensure that regardless of the zoom level, the number of rendered tiles remains constant, preventing performance degradation when zoomed out.

1.  **Modify `src/engine/display/TileLayer.ts`**:
    *   Add a `baseZoom` property (defaulting to 12) to serve as the reference zoom level for the world coordinate system.
    *   Update `urlTemplate` to accept `(x, y, z)` arguments.
    *   In `renderWebGL`:
        *   Calculate the global scale from the world matrix.
        *   Determine the optimal integer `zoom` level based on the scale (`baseZoom + log2(scale)`).
        *   Calculate the `renderTileSize` in world units for that zoom level.
        *   Use this dynamic tile size to iterate over the grid, ensuring we only render a reasonable number of tiles (~visible screen area / 256).
        *   Pass the calculated `zoom` and corrected grid indices to the `urlTemplate`.

2.  **Modify `src/main.ts`**:
    *   Update the `TileLayer` instantiation to handle the new `z` parameter in the `urlTemplate`.
    *   Implement logic to adjust the tile coordinates based on the zoom level (e.g., aligning the center/offset correctly across zoom levels).

This approach directly addresses the "slow panning after zooming" issue by eliminating the quadratic increase in draw calls when zooming out.