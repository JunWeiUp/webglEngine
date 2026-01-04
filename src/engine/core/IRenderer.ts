import { mat3 } from 'gl-matrix';

export interface IRenderer {
    drawQuad(texture: WebGLTexture, sharedVertices: Float32Array<ArrayBufferLike>, sharedUVs: Float32Array<ArrayBufferLike>, sharedColor: Float32Array<ArrayBufferLike>): unknown;
    gl: WebGLRenderingContext;
    ctx: CanvasRenderingContext2D;
    bindQuad(): void;
    getProjectionMatrix(): mat3;
    getProgram(): WebGLProgram;
}
