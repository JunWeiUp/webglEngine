import { TextureManager } from './TextureManager';
import { MemoryTracker, MemoryCategory } from './MemoryProfiler';

/**
 * 简单的纹理图集管理器 (单例模式)
 * 用于将多个小图合并到一个大纹理中，减少 Draw Calls 和纹理切换。
 */

interface AtlasPage {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: WebGLTexture | null;
    cursorX: number;
    cursorY: number;
    rowMaxHeight: number;
    isFull: boolean;
}

export interface AtlasResult {
    uvs: Float32Array;
    texture: WebGLTexture;
}

export class AtlasManager {
    private static instance: AtlasManager;

    private pages: AtlasPage[] = [];
    private cache: Map<string, AtlasResult> = new Map(); // 添加缓存 map
    private gl: WebGL2RenderingContext | null = null;
    private readonly ATLAS_SIZE = 2048;
    private readonly MAX_PAGES = 4; // 限制最大页数，超过则重置

    // 记录已分配的区域，以便在重置时通知使用者失效 (简单起见，目前只支持 Append，满则清空)
    // 实际生产中可能需要更复杂的 LRU 或回调机制
    private onResetCallbacks: Set<() => void> = new Set();

    private constructor() {
        // 初始创建一个 Page
        this.createPage();
    }

    private createPage(): AtlasPage {
        const canvas = document.createElement('canvas');
        canvas.width = this.ATLAS_SIZE;
        canvas.height = this.ATLAS_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        
        const page: AtlasPage = {
            canvas,
            ctx,
            texture: null,
            cursorX: 0,
            cursorY: 0,
            rowMaxHeight: 0,
            isFull: false
        };

        const pageId = this.pages.length;
        MemoryTracker.getInstance().track(
            MemoryCategory.CPU_CANVAS,
            `Atlas_Page_Canvas_${pageId}`,
            this.ATLAS_SIZE * this.ATLAS_SIZE * 4,
            `Atlas Page Canvas #${pageId}`
        );

        if (this.gl) {
            this.initPageTexture(this.gl, page);
        }

        this.pages.push(page);
        return page;
    }

    private initPageTexture(gl: WebGL2RenderingContext, page: AtlasPage) {
        if (page.texture) return;
        page.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, page.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page.canvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // 追踪图集纹理内存
        const pageId = this.pages.indexOf(page);
        if (pageId !== -1) {
            MemoryTracker.getInstance().track(
                MemoryCategory.GPU_TEXTURE,
                `Atlas_Page_Texture_${pageId}`,
                this.ATLAS_SIZE * this.ATLAS_SIZE * 4,
                `Atlas Page Texture #${pageId}`
            );
        }
    }

    public static getInstance(): AtlasManager {
        if (!AtlasManager.instance) {
            AtlasManager.instance = new AtlasManager();
        }
        return AtlasManager.instance;
    }

    public init(gl: WebGL2RenderingContext) {
        if (this.gl === gl) return;
        this.gl = gl;
        
        // 初始化所有已存在的 Page
        for (const page of this.pages) {
            this.initPageTexture(gl, page);
        }
    }

    /**
     * 注册重置回调
     * 当图集空间不足被清空时，调用此回调让使用者重新提交
     */
    public onReset(callback: () => void) {
        this.onResetCallbacks.add(callback);
    }

    public offReset(callback: () => void) {
        this.onResetCallbacks.delete(callback);
    }

    /**
     * 将 Canvas 图像添加到图集中
     * @param source 源 Canvas
     * @param key 可选的缓存键，用于复用相同内容的纹理
     * @returns 分配到的 UV 坐标和纹理对象
     */
    public add(source: HTMLCanvasElement, key?: string): AtlasResult | null {
        if (!this.gl) return null;

        // 如果提供了 key 且缓存中存在，则直接返回
        if (key && this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        const w = source.width + 2; // Padding 2px 防止出血
        const h = source.height + 2;

        if (w > this.ATLAS_SIZE || h > this.ATLAS_SIZE) {
            console.warn("Image too big for atlas:", w, h);
            return null; // 单张图太大，无法放入
        }

        // 尝试在现有的 Page 中寻找空间
        let targetPage: AtlasPage | null = null;
        
        // 优先尝试最后一个 Page (通常是未满的)
        // 也可以遍历所有未满的 Page，这里简化策略：只往最后一个加，满了开新的
        let currentPage = this.pages[this.pages.length - 1];
        
        if (this.canFit(currentPage, w, h)) {
            targetPage = currentPage;
        } else {
            // 当前页放不下，检查是否达到最大页数
            if (this.pages.length >= this.MAX_PAGES) {
                console.log(`Atlas full (${this.pages.length} pages), resetting...`);
                this.reset();
                // reset 后会创建一个新页，重新获取
                targetPage = this.pages[0];
            } else {
                // 没到上限，创建新页
                currentPage.isFull = true;
                targetPage = this.createPage();
                console.log(`Created new Atlas Page #${this.pages.length}`);
            }
        }

        const result = this.addToPage(targetPage, source, w, h);
        
        // 如果提供了 key，将结果存入缓存
        if (key && result) {
            this.cache.set(key, result);
        }

        return result;
    }

    private canFit(page: AtlasPage, w: number, h: number): boolean {
        // 检查当前行
        if (page.cursorX + w <= this.ATLAS_SIZE) {
            // X 轴放得下，还需要检查 Y 轴 (当前行高度由 maxRowHeight 决定，如果换行高度由当前 cursorY + h 决定)
            // 这里逻辑有点绕，流式布局通常是：
            // 如果当前行放得下 -> OK (高度由当前行最高的决定，如果新图更高，行高会增加)
            // 唯一风险是增加行高后，整行超出 Y 限制？流式布局一般不回溯。
            // 简单判断：如果当前行放得下，且 (cursorY + max(rowHeight, h)) <= SIZE
            const estimatedRowHeight = Math.max(page.rowMaxHeight, h);
            if (page.cursorY + estimatedRowHeight <= this.ATLAS_SIZE) {
                return true;
            }
        } 
        
        // 如果当前行放不下，尝试换行
        // 换行后的 Y = cursorY + rowMaxHeight
        if (page.cursorY + page.rowMaxHeight + h <= this.ATLAS_SIZE) {
            return true;
        }

        return false;
    }

    private addToPage(page: AtlasPage, source: HTMLCanvasElement, w: number, h: number) {
        // 检查换行
        if (page.cursorX + w > this.ATLAS_SIZE) {
            page.cursorX = 0;
            page.cursorY += page.rowMaxHeight;
            page.rowMaxHeight = 0;
        }

        // 绘制
        const x = page.cursorX + 1;
        const y = page.cursorY + 1;
        page.ctx.drawImage(source, x, y);

        // 更新 WebGL 纹理
        if (this.gl && page.texture) {
            this.gl.bindTexture(this.gl.TEXTURE_2D, page.texture);
            this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, x, y, this.gl.RGBA, this.gl.UNSIGNED_BYTE, source);
        }

        // 计算 UV
        const u0 = x / this.ATLAS_SIZE;
        const v0 = y / this.ATLAS_SIZE;
        const u1 = (x + source.width) / this.ATLAS_SIZE;
        const v1 = (y + source.height) / this.ATLAS_SIZE;

        // 更新游标
        page.cursorX += w;
        if (h > page.rowMaxHeight) {
            page.rowMaxHeight = h;
        }

        return {
            texture: page.texture!,
            uvs: new Float32Array([
                u0, v0,  // TL
                u1, v0,  // TR
                u1, v1,  // BR
                u0, v1   // BL
            ])
        };
    }

    public reset() {
        console.log("Resetting All Atlas Pages");
        this.cache.clear(); // 清空去重缓存
        
        // 清除旧的内存记录
        for (let i = 0; i < this.pages.length; i++) {
            MemoryTracker.getInstance().untrack(`Atlas_Page_Canvas_${i}`);
            MemoryTracker.getInstance().untrack(`Atlas_Page_Texture_${i}`);
            if (this.gl && this.pages[i].texture) {
                this.gl.deleteTexture(this.pages[i].texture);
            }
        }

        this.pages = [];
        this.createPage();
        
        // 通知所有使用者
        for (const cb of this.onResetCallbacks) {
            cb();
        }
    }

    /**
     * 彻底销毁图集管理器，释放所有资源
     */
    public dispose() {
        if (this.gl) {
            for (let i = 0; i < this.pages.length; i++) {
                const page = this.pages[i];
                if (page.texture) {
                    this.gl.deleteTexture(page.texture);
                }
                MemoryTracker.getInstance().untrack(`Atlas_Page_Canvas_${i}`);
                MemoryTracker.getInstance().untrack(`Atlas_Page_Texture_${i}`);
            }
        }
        this.pages = [];
        this.onResetCallbacks.clear();
        this.gl = null;
    }
}
