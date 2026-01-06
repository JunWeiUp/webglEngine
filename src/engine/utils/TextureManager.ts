import { Texture } from '../core/Texture';

export class TextureManager {
    private static cache: Map<string, Texture> = new Map();

    static loadTexture(gl: WebGLRenderingContext, url: string, signal?: AbortSignal): Promise<Texture> {
        if (this.cache.has(url)) {
            return Promise.resolve(this.cache.get(url)!);
        }

        // Use modern fetch + createImageBitmap if available for off-main-thread decoding
        if (typeof createImageBitmap !== 'undefined') {
            return this.loadTextureBitmap(gl, url, signal);
        }

        return new Promise((resolve, reject) => {
            // Check if already aborted
            if (signal?.aborted) {
                return reject(new DOMException('Aborted', 'AbortError'));
            }

            const image = new Image();
            image.crossOrigin = "Anonymous";

            const onAbort = () => {
                image.src = ''; // Cancel request if possible
                reject(new DOMException('Aborted', 'AbortError'));
            };

            if (signal) {
                signal.addEventListener('abort', onAbort);
            }

            image.onload = () => {
                if (signal) signal.removeEventListener('abort', onAbort);
                const webglTex = this.createTextureFromSource(gl, image);
                if (webglTex) {
                    const texture = new Texture(webglTex, image.width, image.height);
                    this.cache.set(url, texture);
                    resolve(texture);
                } else {
                    reject(new Error("Failed to create texture"));
                }
            };
            image.onerror = (e) => {
                if (signal) signal.removeEventListener('abort', onAbort);
                reject(e);
            };
            image.src = url;
        });
    }

    private static async loadTextureBitmap(gl: WebGLRenderingContext, url: string, signal?: AbortSignal): Promise<Texture> {
        try {
            let blob: Blob;

            if (url.startsWith('data:')) {
                // Avoid fetch for data URIs to bypass potential network stack issues
                blob = this.base64ToBlob(url);
            } else {
                const fetchOptions: RequestInit = { signal, mode: 'cors' };
                const response = await fetch(url, fetchOptions);
                if (!response.ok) throw new Error(`Failed to load texture: ${response.statusText}`);
                blob = await response.blob();
            }
            
            const bitmap = await createImageBitmap(blob, {
                premultiplyAlpha: 'premultiply', // Standard for WebGL
                colorSpaceConversion: 'default'
            });

            const webglTex = this.createTextureFromSource(gl, bitmap);
            if (webglTex) {
                const texture = new Texture(webglTex, bitmap.width, bitmap.height);
                this.cache.set(url, texture);
                bitmap.close(); // Clean up bitmap memory
                return texture;
            } else {
                 bitmap.close();
                 throw new Error("Failed to create texture from bitmap");
            }
        } catch (error) {
            throw error;
        }
    }

    private static base64ToBlob(dataURI: string): Blob {
        // Basic Base64 decoding
        const splitDataURI = dataURI.split(',');
        const byteString = atob(splitDataURI[1]);
        const mimeString = splitDataURI[0].split(':')[1].split(';')[0];
        
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        
        return new Blob([ab], { type: mimeString });
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

    /**
     * Dispose a texture by URL and remove from cache.
     * This is crucial for LRU cache implementation to free GPU memory.
     */
    static disposeTexture(gl: WebGLRenderingContext, url: string) {
        if (this.cache.has(url)) {
            const texture = this.cache.get(url)!;
            // Only dispose if it's not the white placeholder (which might be shared)
            if (url !== "__white__") {
                gl.deleteTexture(texture.baseTexture);
                this.cache.delete(url);
            }
        }
    }
}
