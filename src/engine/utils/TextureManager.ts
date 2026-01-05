import { Texture } from '../core/Texture';

export class TextureManager {
    private static cache: Map<string, Texture> = new Map();

    static loadTexture(gl: WebGLRenderingContext, url: string): Promise<Texture> {
        if (this.cache.has(url)) {
            return Promise.resolve(this.cache.get(url)!);
        }

        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "Anonymous";
            image.onload = () => {
                const webglTex = this.createTextureFromSource(gl, image);
                if (webglTex) {
                    const texture = new Texture(webglTex, image.width, image.height);
                    this.cache.set(url, texture);
                    resolve(texture);
                } else {
                    reject(new Error("Failed to create texture"));
                }
            };
            image.onerror = (e) => reject(e);
            image.src = url;
        });
    }

    static createTextureFromSource(gl: WebGLRenderingContext, source: TexImageSource): WebGLTexture | null {
        const texture = gl.createTexture();
        if (!texture) return null;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

        // WebGL1 parameters for non-power-of-2 images
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        return texture;
    }

    static createWhiteTexture(gl: WebGLRenderingContext): Texture {
        const key = "__white__";
        if (this.cache.has(key)) return this.cache.get(key)!;

        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const whitePixel = new Uint8Array([255, 255, 255, 255]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, whitePixel);
        
        const texObj = new Texture(texture, 1, 1);
        this.cache.set(key, texObj);
        return texObj;
    }
}
