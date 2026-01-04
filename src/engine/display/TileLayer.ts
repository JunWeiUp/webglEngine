import { Node } from './Node';
import type { IRenderer } from '../core/IRenderer';
import { TextureManager } from '../utils/TextureManager';
import { mat3, vec2 } from 'gl-matrix';

export class TileLayer extends Node {
    public tileSize: number = 256;
    public baseZoom: number = 12;
    public urlTemplate: (x: number, y: number, z: number) => string;
    
    // Cache textures
    private tileTextures: Map<string, WebGLTexture> = new Map();
    private loading: Set<string> = new Set();

    constructor(tileSize: number, urlTemplate: (x: number, y: number, z: number) => string, baseZoom: number = 12) {
        super();
        this.tileSize = tileSize;
        this.urlTemplate = urlTemplate;
        this.baseZoom = baseZoom;
    }

    renderWebGL(renderer: IRenderer) {
        // Calculate Global Scale to determine LOD
        // World matrix scale component (assuming uniform scale roughly)
        // m00 is scaleX if no rotation. With rotation, it's length of column 0.
        const wm = this.transform.worldMatrix;
        const globalScale = Math.hypot(wm[0], wm[1]);

        // Calculate zoom difference
        // If scale = 0.5, log2(0.5) = -1. We want z - 1.
        // If scale = 2.0, log2(2.0) = 1. We want z + 1.
        const zoomDiff = Math.floor(Math.log2(globalScale));
        const effectiveZoom = this.baseZoom + zoomDiff;
        
        // Calculate effective tile size in World Units
        // If zoomed out (diff = -1), tile covers 2x space. size = 256 * 2.
        // scaleFactor = 2 ^ (-diff)
        const scaleFactor = Math.pow(2, -zoomDiff);
        const renderTileSize = this.tileSize * scaleFactor;

        // 1. Calculate visible bounds in local space
        // Transform screen corners to local space
        const screenCorners = [
            vec2.fromValues(0, 0),
            vec2.fromValues(renderer.gl.canvas.width, 0),
            vec2.fromValues(renderer.gl.canvas.width, renderer.gl.canvas.height),
            vec2.fromValues(0, renderer.gl.canvas.height)
        ];

        // Invert world matrix
        const invertMatrix = mat3.create();
        mat3.invert(invertMatrix, this.transform.worldMatrix);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const p of screenCorners) {
            const local = vec2.create();
            vec2.transformMat3(local, p, invertMatrix);
            minX = Math.min(minX, local[0]);
            minY = Math.min(minY, local[1]);
            maxX = Math.max(maxX, local[0]);
            maxY = Math.max(maxY, local[1]);
        }

        // 2. Determine grid range
        const startX = Math.floor(minX / renderTileSize);
        const startY = Math.floor(minY / renderTileSize);
        const endX = Math.ceil(maxX / renderTileSize);
        const endY = Math.ceil(maxY / renderTileSize);

        // 3. Render tiles
        const gl = renderer.gl;
        const program = renderer.getProgram();
        renderer.bindQuad();

        const uMatrixLocation = gl.getUniformLocation(program, "u_matrix");
        const uColorLocation = gl.getUniformLocation(program, "u_color");
        const uTextureLocation = gl.getUniformLocation(program, "u_texture");
        
        gl.uniform1i(uTextureLocation, 0);
        gl.uniform4f(uColorLocation, 1, 1, 1, 1); // White

        // Limit range safety check (should be less likely to trigger now)
        if ((endX - startX) * (endY - startY) > 2500) {
             // Still good to have
             return;
        }

        const projectionMatrix = renderer.getProjectionMatrix();

        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                // Key needs to include zoom level now!
                const key = `${effectiveZoom}:${x},${y}`;
                const url = this.urlTemplate(x, y, effectiveZoom);

                // Load if needed
                if (!this.tileTextures.has(key)) {
                    if (!this.loading.has(key)) {
                        this.loading.add(key);
                        TextureManager.loadTexture(gl, url).then(tex => {
                            this.tileTextures.set(key, tex);
                            this.loading.delete(key);
                        }).catch(() => {
                            this.loading.delete(key);
                        });
                    }
                    continue;
                }

                const texture = this.tileTextures.get(key)!;
                gl.bindTexture(gl.TEXTURE_2D, texture);

                // Calculate Matrix
                // Position: x * renderTileSize, y * renderTileSize
                const posX = x * renderTileSize;
                const posY = y * renderTileSize;

                const tileLocalMatrix = mat3.create();
                mat3.identity(tileLocalMatrix);
                mat3.translate(tileLocalMatrix, tileLocalMatrix, [posX, posY]);
                mat3.scale(tileLocalMatrix, tileLocalMatrix, [renderTileSize, renderTileSize]);

                // World = ParentWorld * Local
                // Since TileLayer is the "Parent" of these virtual tiles:
                // TileWorld = LayerWorld * TileLocal
                const tileWorldMatrix = mat3.create();
                mat3.multiply(tileWorldMatrix, this.transform.worldMatrix, tileLocalMatrix);

                // MVP = Projection * TileWorld
                const mvp = mat3.create();
                mat3.multiply(mvp, projectionMatrix, tileWorldMatrix);

                gl.uniformMatrix3fv(uMatrixLocation, false, mvp);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        }
    }
}
