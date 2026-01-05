export class Texture {
    public baseTexture: WebGLTexture;
    public uvs: Float32Array; // [u0,v0, u1,v1, u2,v2, u3,v3] (TL, TR, BR, BL)
    public width: number;
    public height: number;

    constructor(baseTexture: WebGLTexture, width: number, height: number, uvs?: Float32Array) {
        this.baseTexture = baseTexture;
        this.width = width;
        this.height = height;
        // Default full texture UVs
        this.uvs = uvs || new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ]);
    }
}
