import { Texture } from './Texture';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

export class TextureManager {
    private static cache: Map<string, Texture> = new Map();
    private static pending: Map<string, Promise<Texture>> = new Map();
    // 使用 WeakMap 缓存原生 Image/Canvas/Bitmap 对应的 WebGL 纹理
    private static sourceCache: WeakMap<TexImageSource, WebGLTexture> = new WeakMap();

    /**
     * 从任意源创建或获取纹理，并使用 key 进行缓存。
     * 适用于动态生成的 Canvas 内容（如相同的瓦片、相同的图标）。
     */
    static getOrCreateTexture(gl: WebGL2RenderingContext, key: string, source: TexImageSource | HTMLCanvasElement): Texture {
        if (this.cache.has(key)) {
            const tex = this.cache.get(key)!;
            tex.useCount++;
            return tex;
        }

        const webglTex = this.createTextureFromSource(gl, source);
        if (!webglTex) {
            // 降级返回白色纹理
            return this.createWhiteTexture(gl);
        }

        const texture = new Texture(webglTex, (source as any).width || 0, (source as any).height || 0);
        texture.useCount++;
        this.cache.set(key, texture);

        // 追踪纹理内存
        MemoryTracker.getInstance().track(
            MemoryCategory.GPU_TEXTURE,
            `Texture_${key}`,
            (texture.width * texture.height * 4) || 0,
            `Texture: ${key}`
        );

        return texture;
    }

    static loadTexture(gl: WebGL2RenderingContext, url: string, signal?: AbortSignal): Promise<Texture> {
        if (this.cache.has(url)) {
            const tex = this.cache.get(url)!;
            tex.useCount++;
            return Promise.resolve(tex);
        }

        if (this.pending.has(url)) {
            return this.pending.get(url)!.then(tex => {
                tex.useCount++;
                return tex;
            });
        }

        const promise = this._loadTextureInternal(gl, url, signal).then(tex => {
            tex.useCount++;
            return tex;
        });
        this.pending.set(url, promise);
        
        return promise.finally(() => {
            this.pending.delete(url);
        });
    }

    private static _loadTextureInternal(gl: WebGL2RenderingContext, url: string, signal?: AbortSignal): Promise<Texture> {
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

                    // 追踪纹理内存
                    MemoryTracker.getInstance().track(
                        MemoryCategory.GPU_TEXTURE,
                        `Texture_${url}`,
                        image.width * image.height * 4,
                        `Texture: ${url}`
                    );

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

    private static async loadTextureBitmap(gl: WebGL2RenderingContext, url: string, signal?: AbortSignal): Promise<Texture> {
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
                
                // 追踪纹理内存
                MemoryTracker.getInstance().track(
                    MemoryCategory.GPU_TEXTURE,
                    `Texture_${url}`,
                    bitmap.width * bitmap.height * 4,
                    `Texture: ${url}`
                );

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

    static createTextureFromSource(gl: WebGL2RenderingContext, source: TexImageSource | HTMLImageElement | HTMLCanvasElement | ImageBitmap): WebGLTexture | null {
        // 尝试从 WeakMap 缓存中获取
        if (this.sourceCache.has(source)) {
            return this.sourceCache.get(source)!;
        }

        const texture = gl.createTexture();
        if (!texture) return null;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

        // WebGL1 parameters for non-power-of-2 images
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // 存入 WeakMap 缓存
        this.sourceCache.set(source, texture);

        return texture;
    }

    static createWhiteTexture(gl: WebGL2RenderingContext): Texture {
        const key = "__white__";
        if (this.cache.has(key)) return this.cache.get(key)!;

        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const whitePixel = new Uint8Array([255, 255, 255, 255]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, whitePixel);
        
        const texObj = new Texture(texture, 1, 1);
        this.cache.set(key, texObj);

        MemoryTracker.getInstance().track(
            MemoryCategory.GPU_TEXTURE,
            `Texture_${key}`,
            1 * 1 * 4,
            `Texture: White Placeholder`
        );

        return texObj;
    }

    /**
     * 获取已创建的白色纹理 (如果尚未创建则返回 null)
     */
    static getWhiteTexture(): Texture | null {
        return this.cache.get("__white__") || null;
    }

    /**
     * Dispose a texture by URL and remove from cache.
     * This is crucial for LRU cache implementation to free GPU memory.
     * Now with reference counting.
     */
    static disposeTexture(gl: WebGL2RenderingContext, url: string) {
        if (this.cache.has(url)) {
            const texture = this.cache.get(url)!;
            
            // Only dispose if it's not the white placeholder (which might be shared)
            if (url === "__white__") return;

            texture.useCount--;

            if (texture.useCount <= 0) {
                gl.deleteTexture(texture.baseTexture);
                this.cache.delete(url);
                MemoryTracker.getInstance().untrack(`Texture_${url}`);
                // console.log(`[TextureManager] Disposed texture: ${url}`);
            }
        }
    }
}
