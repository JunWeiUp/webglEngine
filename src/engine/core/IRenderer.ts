import { mat3 } from 'gl-matrix';
import type { Rect } from './Rect';

export interface IRenderer {
    gl: WebGL2RenderingContext;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    
    drawQuadFast(
        texture: WebGLTexture,
        x0: number, y0: number,
        x1: number, y1: number,
        x2: number, y2: number,
        x3: number, y3: number,
        uvs: Float32Array,
        color: Float32Array
    ): void;
    
    getProjectionMatrix(): mat3;
    getViewMatrix(): mat3;
    flush(): void;
}
