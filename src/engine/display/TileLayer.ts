import { Node } from './Node';
import type { IRenderer } from '../core/IRenderer';
import type { Rect } from '../core/Rect';
import { TextureManager } from '../utils/TextureManager';
import { mat3, vec2 } from 'gl-matrix';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

export type TileSource = string | HTMLCanvasElement | Promise<HTMLCanvasElement>;

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

    // --- 共享渲染数据 (GC 优化) ---
    private static sharedColor: Float32Array = (() => {
        const arr = new Float32Array([1, 1, 1, 1]);
        MemoryTracker.getInstance().track(MemoryCategory.CPU_TYPED_ARRAY, 'TileLayer_sharedColor', arr.byteLength, 'TileLayer Shared Color');
        return arr;
    })();
    private static sharedVertices: Float32Array = (() => {
        const arr = new Float32Array(8);
        MemoryTracker.getInstance().track(MemoryCategory.CPU_TYPED_ARRAY, 'TileLayer_sharedVertices', arr.byteLength, 'TileLayer Shared Vertices');
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
    private static MAX_TILES = 1000; // 从 20000 下调至 1000 (约 256MB 显存)
    private static GC_INTERVAL = 30; // 缩短 GC 间隔
    private gcFrameCount = 0;

    constructor(tileSize: number, tileSourceProvider: (x: number, y: number, z: number) => TileSource, baseZoom: number = 12) {
        super();
        this.tileSize = tileSize;
        this.tileSourceProvider = tileSourceProvider;
        this.baseZoom = baseZoom;
    }

    renderWebGL(renderer: IRenderer, cullingRect?: Rect) {
        // 计算全局缩放系数以确定 LOD (Level of Detail)
        // 世界矩阵的缩放分量 (假设大致均匀缩放)
        // m00 是 scaleX (如果没有旋转)。如果有旋转，则是第 0 列的长度。
        const wm = this.transform.worldMatrix;
        const globalScale = Math.hypot(wm[0], wm[1]);

        // 计算缩放层级差异
        // 如果 scale = 0.5, log2(0.5) = -1. 我们需要 z - 1.
        // 如果 scale = 2.0, log2(2.0) = 1. 我们需要 z + 1.
        const zoomDiff = Math.floor(Math.log2(globalScale));
        const effectiveZoom = this.baseZoom + zoomDiff;
        
        // 计算世界单位下的有效瓦片大小
        // 如果缩小 (diff = -1), 瓦片覆盖 2x 空间. size = 256 * 2.
        // scaleFactor = 2 ^ (-diff)
        const scaleFactor = Math.pow(2, -zoomDiff);
        const renderTileSize = this.tileSize * scaleFactor;

        // 1. 计算局部空间的可见范围
        const sx = cullingRect ? cullingRect.x : 0;
        const sy = cullingRect ? cullingRect.y : 0;
        const sw = cullingRect ? cullingRect.width : renderer.gl.canvas.width;
        const sh = cullingRect ? cullingRect.height : renderer.gl.canvas.height;

        const screenCorners = [
            vec2.fromValues(sx, sy),
            vec2.fromValues(sx + sw, sy),
            vec2.fromValues(sx + sw, sy + sh),
            vec2.fromValues(sx, sy + sh)
        ];

        // 逆转世界矩阵
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

        // 2. 确定网格范围
        const startX = Math.floor(minX / renderTileSize);
        const startY = Math.floor(minY / renderTileSize);
        const endX = Math.ceil(maxX / renderTileSize);
        const endY = Math.ceil(maxY / renderTileSize);

        // 3. 渲染瓦片
        const gl = renderer.gl;
        const visibleKeys = new Set<string>();

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

                        const handleTexture = (tex: WebGLTexture, url?: string) => {
                            if (this.loading.has(key)) { // 检查是否已被取消
                                this.tileTextures.set(key, { 
                                    texture: tex, 
                                    lastUsedTime: performance.now(),
                                    url: url 
                                });

                                // 追踪动态生成的纹理内存 (URL 加载的已在 TextureManager 中追踪)
                                if (!url) {
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
                                // 已经被取消但加载完成了
                                if (!url) {
                                    // 如果是动态生成的纹理，需要手动释放
                                    gl.deleteTexture(tex);
                                    MemoryTracker.getInstance().untrack(`Tile_${key}`);
                                }
                                // 如果是 URL 纹理，TextureManager 会处理（或者已经在 LRU 中被处理）
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
                            // Promise<HTMLCanvasElement> 模式
                            source.then(canvas => {
                                if (controller.signal.aborted) return;
                                const tex = TextureManager.createTextureFromSource(gl, canvas);
                                if (tex) {
                                    handleTexture(tex);
                                } else {
                                    this.loading.delete(key);
                                }
                            }).catch(() => {
                                this.loading.delete(key);
                            });
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
                
                const v = TileLayer.sharedVertices;

                // TL (posX, posY)
                v[0] = posX * m00 + posY * m10 + m20;
                v[1] = posX * m01 + posY * m11 + m21;

                // TR (posX + w, posY)
                v[2] = (posX + w) * m00 + posY * m10 + m20;
                v[3] = (posX + w) * m01 + posY * m11 + m21;

                // BR (posX + w, posY + h)
                v[4] = (posX + w) * m00 + (posY + h) * m10 + m20;
                v[5] = (posX + w) * m01 + (posY + h) * m11 + m21;

                // BL (posX, posY + h)
                v[6] = posX * m00 + (posY + h) * m10 + m20;
                v[7] = posX * m01 + (posY + h) * m11 + m21;

                // 使用批处理渲染
                renderer.drawQuad(
                    texture,
                    TileLayer.sharedVertices,
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
        const toRemoveCount = this.tileTextures.size - TileLayer.MAX_TILES + 20; // 每次多删一点，避免频繁 GC
        
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
}
