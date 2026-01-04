import { mat3 } from 'gl-matrix';

export interface IRenderer {
    gl: WebGLRenderingContext;
    ctx: CanvasRenderingContext2D;
    bindQuad(): void;
    getProjectionMatrix(): mat3;
    getProgram(): WebGLProgram;
}
