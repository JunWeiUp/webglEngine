import { Node } from './Node';
import type { IRenderer } from '../rendering/IRenderer';
import { Renderer } from '../rendering/Renderer';
import type { Rect } from '../math/Rect';
import { TextureManager } from '../rendering/TextureManager';
import { mat3, vec2 } from 'gl-matrix';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

export type TileSource = string | HTMLCanvasElement | Promise<HTMLCanvasElement> | { source: string | HTMLCanvasElement, key: string };

/**
 * TileLayer (瓦片图层) 类
 * 
 * 类似于 Google Maps / OSM 的瓦片地图渲染层。
 * - 支持无限滚动
 * - 支持 LOD (Level of Detail) 缩放
 * - 动态计算可见区域并加载对应瓦片
 */
export class TileLayer extends Node {
    /** 瓦片基础尺寸 (通常为 256) */
    public tileSize: number = 256;
    /** 基础缩放级别 (对应 scale=1 时) */
    public baseZoom: number = 12;
    /** 瓦片 URL 生成函数 */
    public tileSourceProvider: (x: number, y: number, z: number) => TileSource;

    // 缓存纹理
    private tileTextures: Map<string, { texture: WebGLTexture, lastUsedTime: number, url?: string }> = new Map();
    // 正在加载的集合 (支持取消)
    private loading: Map<string, AbortController> = new Map();
    // 缓存 GL 上下文，用于销毁
    private _gl: WebGL2RenderingContext | null = null;

    // --- 预分配临时变量 (GC 优化) ---
    private static _tempVec2a = vec2.create();
    private static _tempMat3a = mat3.create();
    private static _tempMat3b = mat3.create();
    private static _tempCorners = [vec2.create(), vec2.create(), vec2.create(), vec2.create()];
    private static _visibleKeys = new Set<string>();

    // --- 共享渲染数据 (GC 优化) ---
    private static sharedColor: Float32Array = (() => {
        const arr = new Float32Array([1, 1, 1, 1]);
        MemoryTracker.getInstance().track(MemoryCategory.CPU_TYPED_ARRAY, 'TileLayer_sharedColor', arr.byteLength, 'TileLayer Shared Color');
        return arr;
    })();
    private static sharedUVs: Float32Array = (() => {
        const arr = new Float32Array([
            0, 0, // TL
            1, 0, // TR
            1, 1, // BR
            0, 1  // BL
        ]);
        MemoryTracker.getInstance().track(MemoryCategory.CPU_TYPED_ARRAY, 'TileLayer_sharedUVs', arr.byteLength, 'TileLayer Shared UVs');
        return arr;
    })();

    // LRU 配置
    private static MAX_TILES = 400; // 进一步下调至 400 (约 100MB 显存)
    private static GC_INTERVAL = 15; // 进一步缩短 GC 间隔
    private gcFrameCount = 0;

    constructor(tileSize: number, tileSourceProvider: (x: number, y: number, z: number) => TileSource, baseZoom: number = 12) {
        super();
        this.tileSize = tileSize;
        this.tileSourceProvider = tileSourceProvider;
        this.baseZoom = baseZoom;

        this.set(-10000000, -10000000, 20000000, 20000000);
    }

    renderWebGL(renderer: IRenderer, cullingRect?: Rect) {
        // 计算全局缩放系数以确定 LOD (Level of Detail)
        // 现在需要结合视图矩阵 (Camera) 计算
        const viewMatrix = renderer.getViewMatrix();
        const wm = this.getWorldMatrix();

        // 综合矩阵: view * world
        const combinedMatrix = TileLayer._tempMat3a;
        mat3.multiply(combinedMatrix, viewMatrix, wm);

        // 从综合矩阵计算缩放分量
        const globalScale = Math.hypot(combinedMatrix[0], combinedMatrix[1]);

        // 计算缩放层级差异
        const zoomDiff = Math.floor(Math.log2(globalScale));
        const effectiveZoom = this.baseZoom + zoomDiff;

        // 计算世界单位下的有效瓦片大小
        const scaleFactor = Math.pow(2, -zoomDiff);
        const renderTileSize = this.tileSize * scaleFactor;

        // 1. 计算局部空间的可见范围
        const sx = cullingRect ? cullingRect.x : 0;
        const sy = cullingRect ? cullingRect.y : 0;
        const sw = cullingRect ? cullingRect.width : renderer.gl.canvas.width;
        const sh = cullingRect ? cullingRect.height : renderer.gl.canvas.height;

        const corners = TileLayer._tempCorners;
        vec2.set(corners[0], sx, sy);
        vec2.set(corners[1], sx + sw, sy);
        vec2.set(corners[2], sx + sw, sy + sh);
        vec2.set(corners[3], sx, sy + sh);

        // 逆转综合矩阵，将屏幕空间坐标直接映射到 TileLayer 的局部空间
        const invertMatrix = TileLayer._tempMat3b;
        if (!mat3.invert(invertMatrix, combinedMatrix)) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const local = TileLayer._tempVec2a;
        for (const p of corners) {
            vec2.transformMat3(local, p, invertMatrix);
            minX = Math.min(minX, local[0]);
            minY = Math.min(minY, local[1]);
            maxX = Math.max(maxX, local[0]);
            maxY = Math.max(maxY, local[1]);
        }

        // 2. 确定网格范围
        const startX = Math.floor(minX / renderTileSize);
        const startY = Math.floor(minY / renderTileSize);
        const endX = Math.ceil(maxX / renderTileSize);
        const endY = Math.ceil(maxY / renderTileSize);

        // 3. 渲染瓦片
        const gl = renderer.gl;
        this._gl = gl; // 缓存 GL 上下文
        const visibleKeys = TileLayer._visibleKeys;
        visibleKeys.clear();

        // 范围限制安全检查 (现在不太可能触发)
        if ((endX - startX) * (endY - startY) > 2500) {
            // 保留作为安全措施
            return;
        }

        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                // Key 需要包含缩放级别！
                const key = `${effectiveZoom}:${x},${y}`;
                visibleKeys.add(key);

                // 按需加载
                if (!this.tileTextures.has(key)) {
                    if (!this.loading.has(key)) {
                        const controller = new AbortController();
                        this.loading.set(key, controller);

                        const source = this.tileSourceProvider(x, y, effectiveZoom);

                        const handleTexture = (tex: WebGLTexture, urlOrKey?: string) => {
                            if (this.loading.has(key)) { // 检查是否已被取消
                                this.tileTextures.set(key, {
                                    texture: tex,
                                    lastUsedTime: performance.now(),
                                    url: urlOrKey
                                });

                                // 如果没有 urlOrKey，说明是未经过 TextureManager 缓存的原始 WebGLTexture
                                if (!urlOrKey) {
                                    MemoryTracker.getInstance().track(
                                        MemoryCategory.GPU_TEXTURE,
                                        `Tile_${key}`,
                                        this.tileSize * this.tileSize * 4,
                                        `Tile Texture: ${key}`
                                    );
                                }

                                this.loading.delete(key);
                                this.invalidate(); // 瓦片加载完成，请求重绘
                            } else {
                                // 已经被取消但加载完成了，必须释放资源
                                if (urlOrKey) {
                                    // 使用了缓存标识，通知 TextureManager 释放
                                    TextureManager.disposeTexture(gl, urlOrKey);
                                } else {
                                    // 原始纹理，直接删除
                                    gl.deleteTexture(tex);
                                    MemoryTracker.getInstance().untrack(`Tile_${key}`);
                                }
                            }
                        };

                        if (typeof source === 'string') {
                            // URL 模式 (支持取消)
                            TextureManager.loadTexture(gl, source, controller.signal)
                                .then(t => handleTexture(t.baseTexture, source))
                                .catch((e) => {
                                    if (e.name !== 'AbortError') {
                                        // console.warn(e);
                                    }
                                    this.loading.delete(key);
                                });
                        } else if (source instanceof HTMLCanvasElement || (source as any).tagName === 'CANVAS') {
                            // 直接 Canvas 模式 (同步)
                            const tex = TextureManager.createTextureFromSource(gl, source as HTMLCanvasElement);
                            if (tex) {
                                handleTexture(tex);
                            } else {
                                this.loading.delete(key);
                            }
                        } else if (source instanceof Promise) {
                            // Promise 模式
                            source.then(result => {
                                if (controller.signal.aborted) return;

                                if (result instanceof HTMLCanvasElement || (result as any).tagName === 'CANVAS') {
                                    const tex = TextureManager.createTextureFromSource(gl, result as HTMLCanvasElement);
                                    if (tex) handleTexture(tex);
                                    else this.loading.delete(key);
                                }
                            }).catch(() => {
                                this.loading.delete(key);
                            });
                        } else if (typeof source === 'object' && 'source' in source && 'key' in (source as any)) {
                            // 带 Key 的复用模式
                            const s = source as { source: string | HTMLCanvasElement, key: string };
                            if (typeof s.source === 'string') {
                                TextureManager.loadTexture(gl, s.source, controller.signal)
                                    .then(t => handleTexture(t.baseTexture, s.key)) // 注意：这里使用 s.key 作为缓存标识
                                    .catch(() => this.loading.delete(key));
                            } else {
                                const tex = TextureManager.getOrCreateTexture(gl, s.key, s.source);
                                handleTexture(tex.baseTexture, s.key);
                            }
                        }
                    }
                    continue;
                }

                const tileInfo = this.tileTextures.get(key)!;
                tileInfo.lastUsedTime = performance.now(); // 更新最后使用时间
                const texture = tileInfo.texture;

                // --- 计算瓦片的世界坐标 (用于批处理) ---
                // 瓦片在局部空间的位置
                const posX = x * renderTileSize;
                const posY = y * renderTileSize;
                const w = renderTileSize;
                const h = renderTileSize;

                // 手动计算世界坐标顶点，避免为每个瓦片创建矩阵对象
                // WorldPos = WorldMatrix * LocalPos
                // Matrix: [a, b, 0, c, d, 0, tx, ty, 1]
                // x' = x*a + y*c + tx
                // y' = x*b + y*d + ty

                const m00 = wm[0], m01 = wm[1];
                const m10 = wm[3], m11 = wm[4];
                const m20 = wm[6], m21 = wm[7];

                // 使用批处理渲染
                renderer.drawQuadFast(
                    texture,
                    posX * m00 + posY * m10 + m20,
                    posX * m01 + posY * m11 + m21,
                    (posX + w) * m00 + posY * m10 + m20,
                    (posX + w) * m01 + posY * m11 + m21,
                    (posX + w) * m00 + (posY + h) * m10 + m20,
                    (posX + w) * m01 + (posY + h) * m11 + m21,
                    posX * m00 + (posY + h) * m10 + m20,
                    posX * m01 + (posY + h) * m11 + m21,
                    TileLayer.sharedUVs,
                    TileLayer.sharedColor
                );
            }
        }


        // 4. 取消不可见区域的正在加载任务
        for (const [key, controller] of this.loading) {
            if (!visibleKeys.has(key)) {
                controller.abort();
                this.loading.delete(key);
            }
        }

        // 5. 执行 GC (LRU)
        this.gcFrameCount++;
        if (this.gcFrameCount > TileLayer.GC_INTERVAL) {
            this.gcFrameCount = 0;
            this.performGC(gl);
        }
    }

    /**
     * 执行瓦片垃圾回收
     */
    private performGC(gl: WebGL2RenderingContext) {
        if (this.tileTextures.size <= TileLayer.MAX_TILES) return;

        // 按最后使用时间排序
        const entries = Array.from(this.tileTextures.entries());
        entries.sort((a, b) => a[1].lastUsedTime - b[1].lastUsedTime);

        // 删除最旧的瓦片
        const toRemoveCount = Math.max(20, this.tileTextures.size - TileLayer.MAX_TILES + 10); // 确保每次至少删除一些

        for (let i = 0; i < toRemoveCount && i < entries.length; i++) {
            const [key, info] = entries[i];

            if (info.url) {
                // 如果是 URL 加载的，通知 TextureManager 释放
                TextureManager.disposeTexture(gl, info.url);
            } else {
                // 如果是动态生成的，直接删除纹理
                gl.deleteTexture(info.texture);
                MemoryTracker.getInstance().untrack(`Tile_${key}`);
            }

            this.tileTextures.delete(key);
        }
    }

    /**
     * 销毁图层，释放所有瓦片资源
     */
    dispose() {
        // 1. 取消所有正在进行的加载
        for (const controller of this.loading.values()) {
            controller.abort();
        }
        this.loading.clear();

        // 2. 释放所有已缓存的纹理
        const gl = this._gl || (Renderer as any).instance?.gl;

        if (gl) {
            for (const info of this.tileTextures.values()) {
                if (info.url) {
                    TextureManager.disposeTexture(gl, info.url);
                } else {
                    gl.deleteTexture(info.texture);
                }
            }
        }

        this.tileTextures.clear();
        MemoryTracker.getInstance().untrackByPrefix('Tile_');

        super.dispose();
    }
}
