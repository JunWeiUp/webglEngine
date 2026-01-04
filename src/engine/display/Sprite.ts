import { Node } from './Node';
import { TextureManager } from '../utils/TextureManager';
import type { IRenderer } from '../core/IRenderer';
import { mat3 } from 'gl-matrix';

export class Sprite extends Node {
    public texture: WebGLTexture | null = null;
    public textureUrl: string = "";
    public color: number[] = [1, 1, 1, 1]; // RGBA normalized

    constructor(gl: WebGLRenderingContext, url?: string) {
        super();
        if (url) {
            this.textureUrl = url;
            TextureManager.loadTexture(gl, url).then(tex => {
                this.texture = tex;
                if (this.width === 0) this.width = 100;
                if (this.height === 0) this.height = 100;
            });
        } else {
            this.texture = TextureManager.createWhiteTexture(gl);
            this.width = 100;
            this.height = 100;
        }
    }

    renderWebGL(renderer: IRenderer) {
        if (!this.texture) return;
        
        const gl = renderer.gl;
        const program = renderer.getProgram();

        renderer.bindQuad();

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Compute Final Matrix: Projection * World * LocalScale(because quad is 1x1)
        // Sprite has width/height, so we need to scale the unit quad by width/height.
        // The transform.worldMatrix includes position, rotation, scale.
        // But our quad is 1x1. If Sprite.width is 100, we need to scale by 100.
        // Wait, Node transform scale is separate from width/height? 
        // Usually width/height implies scale or boundaries.
        // Let's assume width/height is the size.
        // So we apply a scale of [width, height] to the matrix before drawing.
        
        const finalMatrix = mat3.create();
        mat3.copy(finalMatrix, this.transform.worldMatrix);
        mat3.scale(finalMatrix, finalMatrix, [this.width, this.height]);
        
        const projectionMatrix = renderer.getProjectionMatrix();
        const mvpMatrix = mat3.create();
        mat3.multiply(mvpMatrix, projectionMatrix, finalMatrix);

        const uMatrixLocation = gl.getUniformLocation(program, "u_matrix");
        gl.uniformMatrix3fv(uMatrixLocation, false, mvpMatrix);

        const uColorLocation = gl.getUniformLocation(program, "u_color");
        gl.uniform4fv(uColorLocation, this.color);

        const uTextureLocation = gl.getUniformLocation(program, "u_texture");
        gl.uniform1i(uTextureLocation, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}
