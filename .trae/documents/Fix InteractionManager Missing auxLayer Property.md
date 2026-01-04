I will fix the `TypeError`s by correctly declaring and initializing the `auxLayer` property in `InteractionManager.ts`.

It appears that a previous edit to update the constructor and add the property was either lost or incomplete, leaving the code using `this.auxLayer` without it being defined on the class instance.

**Fix Plan**:
1.  **Modify `src/engine/events/InteractionManager.ts`**:
    *   Add `private auxLayer: AuxiliaryLayer;` to the class properties.
    *   Update the `constructor` signature to accept `auxLayer: AuxiliaryLayer`.
    *   Assign `this.auxLayer = auxLayer;` in the constructor.
    *   Ensure the import for `AuxiliaryLayer` is present.

This will ensure `this.auxLayer` is valid when `onMouseDown` and `onMouseUp` are called.