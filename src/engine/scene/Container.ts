import { Sprite } from './Sprite';

export class Container extends Sprite {
    constructor(gl: WebGL2RenderingContext) {
        super(gl);
        // Container defaults:
        // We might want it to be transparent by default if it's just a group?
        // But Sprite constructor sets it to white 100x100.
        // Let's keep Sprite behavior as the user requested "Sprite capabilities".
        // If they want it invisible, they can set color alpha to 0 or visible=false (if we had that).
        
        // Actually, for a Container, usually we want it to be 0x0 or just a wrapper unless specified.
        // But since we are replacing the "BG Sprite", we want it to be visible.
        // Let's just inherit Sprite behavior.
    }
}
