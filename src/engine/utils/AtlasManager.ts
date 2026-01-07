import { TextureManager } from './TextureManager';

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

export class AtlasManager {
    private static instance: AtlasManager;

    private pages: AtlasPage[] = [];
    private gl: WebGL2RenderingContext | null = null;
    private readonly ATLAS_SIZE = 2048;

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
     * @returns 分配到的 UV 坐标和纹理对象
     */
    public add(source: HTMLCanvasElement): { uvs: Float32Array, texture: WebGLTexture } | null {
        if (!this.gl) return null;

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
            // 当前页放不下，标记为满（虽然可能还有碎片空间，但简单流式分配无法利用）
            currentPage.isFull = true;
            // 创建新页
            targetPage = this.createPage();
            console.log(`Created new Atlas Page #${this.pages.length}`);
        }

        return this.addToPage(targetPage, source, w, h);
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
        this.pages = [];
        this.createPage();
        
        // 通知所有使用者
        for (const cb of this.onResetCallbacks) {
            cb();
        }
    }
}
