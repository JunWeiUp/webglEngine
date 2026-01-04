import { Node } from './Node';
import type { IRenderer } from '../core/IRenderer';
import { TextureManager } from '../utils/TextureManager';
import { mat3, vec2 } from 'gl-matrix';

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
    public urlTemplate: (x: number, y: number, z: number) => string;
    
    // 缓存纹理
    private tileTextures: Map<string, WebGLTexture> = new Map();
    // 正在加载的集合
    private loading: Set<string> = new Set();

    // --- 共享渲染数据 (GC 优化) ---
    private static sharedColor: Float32Array = new Float32Array([1, 1, 1, 1]);
    private static sharedVertices: Float32Array = new Float32Array(8);
    private static sharedUVs: Float32Array = new Float32Array([
        0, 0, // TL
        1, 0, // TR
        1, 1, // BR
        0, 1  // BL
    ]);

    constructor(tileSize: number, urlTemplate: (x: number, y: number, z: number) => string, baseZoom: number = 12) {
        super();
        this.tileSize = tileSize;
        this.urlTemplate = urlTemplate;
        this.baseZoom = baseZoom;
    }

    renderWebGL(renderer: IRenderer) {
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
        // 将屏幕四个角转换到局部空间
        const screenCorners = [
            vec2.fromValues(0, 0),
            vec2.fromValues(renderer.gl.canvas.width, 0),
            vec2.fromValues(renderer.gl.canvas.width, renderer.gl.canvas.height),
            vec2.fromValues(0, renderer.gl.canvas.height)
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

        // 范围限制安全检查 (现在不太可能触发)
        if ((endX - startX) * (endY - startY) > 2500) {
             // 保留作为安全措施
             return;
        }

        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                // Key 需要包含缩放级别！
                const key = `${effectiveZoom}:${x},${y}`;
                const url = this.urlTemplate(x, y, effectiveZoom);

                // 按需加载
                if (!this.tileTextures.has(key)) {
                    if (!this.loading.has(key)) {
                        this.loading.add(key);
                        TextureManager.loadTexture(gl, url).then(tex => {
                            this.tileTextures.set(key, tex);
                            this.loading.delete(key);
                            this.invalidate(); // 瓦片加载完成，请求重绘
                        }).catch(() => {
                            this.loading.delete(key);
                        });
                    }
                    continue;
                }

                const texture = this.tileTextures.get(key)!;
                
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
                // console.log("key", key);
            }
        }
    }
}
