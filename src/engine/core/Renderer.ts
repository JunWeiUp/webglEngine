import { Node, type NodeSpatialItem } from '../display/Node';
import { mat3, vec2 } from 'gl-matrix';
import type { Rect } from './Rect';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';
import RBush from 'rbush';

/**
 * 核心渲染器类
 * 负责 WebGL 上下文管理、着色器编译、批处理渲染以及场景树的遍历渲染。
 */
export class Renderer {
    public gl: WebGL2RenderingContext;
    public static instance: Renderer | null = null;
    public ctx: CanvasRenderingContext2D;
    public width: number;
    public height: number;

    // 空间索引
    private spatialIndex: RBush<NodeSpatialItem> = new RBush();
    // private allNodesInIndex: Set<Node> = new Set();

    private shaderProgram: WebGLProgram | null = null;

    // 批处理渲染状态
    private static readonly MAX_QUADS = 10000; // 最大批处理 Quad 数量
    private maxTextures: number = 8;  // 最大纹理单元数量 (动态获取)
    private static readonly VERTEX_SIZE = 9;   // 顶点数据大小: x, y, u, v, r, g, b, a, texIndex

    private vertexBufferData: Float32Array; // 顶点数据缓冲区（CPU）
    private currentQuadCount: number = 0;   // 当前已填充的 Quad 数量
    private textureSlots: WebGLTexture[] = []; // 当前批次使用的纹理槽

    // 性能统计
    public stats = {
        drawCalls: 0,
        quadCount: 0,
        frameCount: 0,
        lastFPS: 0,
        smoothTimes: {
            transform: 0,
            renderWebGL: 0,
            flush: 0,
            logic: 0,
            hitTest: 0,   // 新增：拾取检测耗时
            boxSelect: 0, // 新增：框选耗时
            nodeTransform: 0, // 新增：节点变换更新耗时
            total: 0
        },
        times: {
            transform: 0,
            renderWebGL: 0,
            canvas2D: 0,
            flush: 0,
            logic: 0,
            hitTest: 0,   // 新增：拾取检测耗时
            boxSelect: 0, // 新增：框选耗时
            nodeTransform: 0, // 新增：节点变换更新耗时
            total: 0
        }
    };

    // 静态常量，避免每次 flush 创建新数组 (将在 initWebGL 中动态生成)
    private textureIndices: Int32Array | number[] = [];

    private dynamicVertexBuffer: WebGLBuffer | null = null; // 动态顶点缓冲区（GPU）
    private indexBuffer: WebGLBuffer | null = null;         // 静态索引缓冲区（GPU）

    private projectionMatrix: mat3 = mat3.create();
    private viewMatrix: mat3 = mat3.create();
    private viewMatrixInverse: mat3 = mat3.create();

    // 矩阵栈，用于在遍历过程中维护当前的变换
    private matrixStack: mat3[] = [];
    private matrixStackIndex: number = 0;
    private static readonly MAX_STACK_DEPTH = 32;

    // 缓存用于剔除计算的临时变量
    private _tempVec2_0 = vec2.create();
    private _tempVec2_1 = vec2.create();
    private _tempVec2_2 = vec2.create();
    private _tempVec2_3 = vec2.create();

    /** 当前帧序号 */
    private _frameCount: number = 0;
    /** FPS 统计上次更新时间 */
    private lastFPSUpdateTime: number = 0;
    private _isBatchUpdatingSpatial: boolean = false;
    private _structureDirty: boolean = true;
    /** 当前帧全局时间戳 (ms) */
    public static currentTime: number = 0;

    /**
     * 标记场景结构已改变，需要重新计算渲染顺序
     */
    public markStructureDirty() {
        this._structureDirty = true;
    }

    private _nextRenderOrder: number = 0;
    private updateRenderOrder(node: Node) {
        node.renderOrder = this._nextRenderOrder++;
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            this.updateRenderOrder(children[i]);
        }
    }

    /**
     * 初始化渲染器
     * @param container 承载 Canvas 的 DOM 容器
     */
    constructor(container: HTMLElement) {
        Renderer.instance = this;
        // 初始化批处理数据
        this.vertexBufferData = new Float32Array(Renderer.MAX_QUADS * 4 * Renderer.VERTEX_SIZE);
        MemoryTracker.getInstance().track(
            MemoryCategory.CPU_TYPED_ARRAY,
            'Renderer_vertexBufferData',
            this.vertexBufferData.byteLength,
            'Renderer Vertex Buffer (CPU)'
        );

        // 创建 WebGL Canvas
        const canvasGL = document.createElement('canvas');
        canvasGL.style.position = 'absolute';
        canvasGL.style.top = '0';
        canvasGL.style.left = '0';
        container.appendChild(canvasGL);
        // 开启 preserveDrawingBuffer 以支持局部重绘 (Dirty Rect Rendering)
        // 升级到 WebGL 2
        this.gl = canvasGL.getContext('webgl2', { preserveDrawingBuffer: true })!;
        if (!this.gl) {
            console.error("WebGL 2 not supported, falling back to WebGL 1");
            // If we really wanted to fallback, we'd need to change the type of this.gl to WebGLRenderingContext | WebGL2RenderingContext
            // But for this task we assume WebGL 2 is desired.
            this.gl = (canvasGL.getContext('webgl', { preserveDrawingBuffer: true }) as any) as WebGL2RenderingContext;
        }

        // 创建 2D Canvas (用于辅助绘制，如文本、调试框)
        const canvas2D = document.createElement('canvas');
        canvas2D.style.position = 'absolute';
        canvas2D.style.top = '0';
        canvas2D.style.left = '0';
        // canvas2D.style.pointerEvents = 'none'; // 让事件穿透到 GL canvas (目前由 InteractionManager 统一接管事件，暂不需要)
        container.appendChild(canvas2D);
        this.ctx = canvas2D.getContext('2d')!;

        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.resize(this.width, this.height);
        this.initWebGL();
        this.lastFPSUpdateTime = performance.now();

        // 预分配矩阵栈空间
        for (let i = 0; i < Renderer.MAX_STACK_DEPTH; i++) {
            this.matrixStack.push(mat3.create());
        }
    }

    /**
     * 调整画布大小
     * @param w 宽度
     * @param h 高度
     */
    resize(w: number, h: number) {
        this.width = w;
        this.height = h;

        this.gl.canvas.width = w;
        this.gl.canvas.height = h;
        this.ctx.canvas.width = w;
        this.ctx.canvas.height = h;

        this.gl.viewport(0, 0, w, h);

        // 计算投影矩阵: 将像素坐标 (0..w, 0..h) 映射到裁剪空间 (-1..1, 1..-1)
        // 2/w, 0, 0
        // 0, -2/h, 0
        // -1, 1, 1
        mat3.set(this.projectionMatrix,
            2 / w, 0, 0,
            0, -2 / h, 0,
            -1, 1, 1
        );

        // 追踪 Canvas 内存
        MemoryTracker.getInstance().track(
            MemoryCategory.CPU_CANVAS,
            'Renderer_WebGL_Canvas',
            w * h * 4,
            'Renderer WebGL Canvas'
        );
        MemoryTracker.getInstance().track(
            MemoryCategory.CPU_CANVAS,
            'Renderer_2D_Canvas',
            w * h * 4,
            'Renderer 2D Canvas'
        );
    }

    /**
     * 初始化 WebGL 资源（着色器、缓冲区、状态）
     */
    private initWebGL() {
        const gl = this.gl;

        // 1. 获取硬件支持的最大纹理单元数
        const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        this.maxTextures = Math.min(maxUnits, 16); // 限制到 16，避免 shader 编译过慢或超出某些限制
        console.log(`[Renderer] Max Texture Units: ${maxUnits}, Using: ${this.maxTextures}`);

        // 初始化纹理索引数组
        this.textureIndices = new Int32Array(this.maxTextures);
        for (let i = 0; i < this.maxTextures; i++) {
            this.textureIndices[i] = i;
        }
        MemoryTracker.getInstance().track(
            MemoryCategory.CPU_TYPED_ARRAY,
            'Renderer_textureIndices',
            (this.textureIndices as Int32Array).byteLength,
            'Renderer Texture Indices'
        );

        // 2. 动态生成 Fragment Shader (GLSL 3.00 ES)
        const fsSource = this.generateFragmentShader(this.maxTextures);

        // 3. 定义 Vertex Shader (GLSL 3.00 ES)
        const vsSource = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_textureIndex;

uniform mat3 u_projectionMatrix;
uniform mat3 u_viewMatrix;

out vec2 v_texCoord;
out vec4 v_color;
out float v_textureIndex;

void main() {
    v_texCoord = a_texCoord;
    v_color = a_color;
    v_textureIndex = a_textureIndex;
    gl_Position = vec4((u_projectionMatrix * u_viewMatrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}`;

        // 编译着色器
        const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);

        this.shaderProgram = this.createProgram(gl, vs, fs);
        gl.useProgram(this.shaderProgram);

        // 启用 Alpha 混合
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // 创建动态顶点缓冲区
        this.dynamicVertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexBufferData.byteLength, gl.DYNAMIC_DRAW);
        MemoryTracker.getInstance().track(
            MemoryCategory.GPU_BUFFER,
            'Renderer_dynamicVertexBuffer',
            this.vertexBufferData.byteLength,
            'Renderer Dynamic Vertex Buffer (GPU)'
        );

        // 创建静态索引缓冲区
        const indices = new Uint16Array(Renderer.MAX_QUADS * 6);
        for (let i = 0; i < Renderer.MAX_QUADS; i++) {
            const j = i * 4;
            indices[i * 6 + 0] = j + 0;
            indices[i * 6 + 1] = j + 1;
            indices[i * 6 + 2] = j + 2;
            indices[i * 6 + 3] = j + 0;
            indices[i * 6 + 4] = j + 2;
            indices[i * 6 + 5] = j + 3;
        }
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        MemoryTracker.getInstance().track(
            MemoryCategory.GPU_BUFFER,
            'Renderer_indexBuffer',
            indices.byteLength,
            'Renderer Index Buffer (GPU)'
        );

        // 设置顶点属性布局
        this.bindAttributes();
    }

    private generateFragmentShader(maxTextures: number): string {
        let ifElseBlock = '';
        for (let i = 0; i < maxTextures; i++) {
            if (i === 0) {
                ifElseBlock += `if (index == 0) color = texture(u_textures[0], v_texCoord);\n`;
            } else {
                ifElseBlock += `    else if (index == ${i}) color = texture(u_textures[${i}], v_texCoord);\n`;
            }
        }

        return `#version 300 es
precision mediump float;

in vec2 v_texCoord;
in vec4 v_color;
in float v_textureIndex;

uniform sampler2D u_textures[${maxTextures}];

out vec4 fragColor;

void main() {
    vec4 color = vec4(1.0);
    int index = int(v_textureIndex + 0.5);
    
    ${ifElseBlock}
    
    fragColor = color * v_color;
}
`;
    }

    /**
     * 绑定顶点属性指针
     */
    private bindAttributes() {
        const gl = this.gl;
        const stride = Renderer.VERTEX_SIZE * 4; // 每个顶点的字节数

        // a_position (location = 0)
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

        // a_texCoord (location = 1)
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

        // a_color (location = 2)
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * 4);

        // a_textureIndex (location = 3)
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8 * 4);
    }

    private createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            throw new Error("Shader compile failed");
        }
        return shader;
    }

    private createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            throw new Error("Program link failed");
        }
        return program;
    }

    /**
     * 开始批量更新空间索引 (期间会挂起 RBush 插入/删除操作)
     */
    public beginSpatialBatch() {
        this._isBatchUpdatingSpatial = true;
    }

    /**
     * 结束批量更新空间索引
     */
    public endSpatialBatch() {
        this._isBatchUpdatingSpatial = false;
    }

    /**
     * 同步空间索引 (RBush)
     * 增量更新场景中发生变换的节点的 AABB
     */
    private syncSpatialIndex(node: Node, parentSpatialDirty: boolean = false) {
        if (this._isBatchUpdatingSpatial) return;

        const isDirty = node.spatialDirty || parentSpatialDirty;

        // 如果子树不脏且当前路径没有脏标记，直接跳过
        if (!node.subtreeDirty && !isDirty) {
            return;
        }

        // 如果节点有尺寸，且空间信息已脏，则更新 RBush
        if (node.width > 0 && node.height > 0) {
            if (isDirty || !node.spatialItem) {
                // 1. 从索引中移除旧条目
                if (node.spatialItem) {
                    this.spatialIndex.remove(node.spatialItem);
                } else {
                    // this.allNodesInIndex.add(node);
                }

                // 2. 更新世界 AABB (这会触发回溯计算变换矩阵)
                node.updateWorldAABB();

                // 3. 创建新条目并插入索引
                node.spatialItem = {
                    minX: node.worldMinX,
                    minY: node.worldMinY,
                    maxX: node.worldMaxX,
                    maxY: node.worldMaxY,
                    node: node
                };
                this.spatialIndex.insert(node.spatialItem);
                node.spatialDirty = false;
            }
        }

        // 递归处理子节点
        const children = node.children;
        if (children.length > 0) {
            for (let i = 0; i < children.length; i++) {
                this.syncSpatialIndex(children[i], isDirty);
            }
        }

        // 清除标记
        node.subtreeDirty = false;
        if (isDirty) node.spatialDirty = false;
    }

    /**
     * 渲染整个场景 (WebGL)
     * 优化：基于 RBush 空间查询，彻底跳过不可见节点的遍历
     */
    public render(scene: Node, dirtyRect?: Rect) {
        const startTime = performance.now();
        Renderer.currentTime = startTime;

        this.stats.frameCount++;
        if (startTime - this.lastFPSUpdateTime >= 1000) {
            const elapsed = startTime - this.lastFPSUpdateTime;
            this.stats.lastFPS = Math.round((this.stats.frameCount * 1000) / elapsed);
            this.stats.frameCount = 0;
            this.lastFPSUpdateTime = startTime;
        }

        this._frameCount++;
        this.stats.drawCalls = 0;
        this.stats.quadCount = 0;

        // 1. 同步空间索引 (增量更新)
        const t0 = performance.now();
        this.syncSpatialIndex(scene);
        
        // 如果结构发生变化，重新计算全局渲染顺序
        if (this._structureDirty) {
            this._nextRenderOrder = 0;
            this.updateRenderOrder(scene);
            this._structureDirty = false;
        }
        
        this.stats.times.nodeTransform = performance.now() - t0;

        // 2. 设置 WebGL 状态
        if (dirtyRect) {
            this.gl.enable(this.gl.SCISSOR_TEST);
            const left = Math.floor(dirtyRect.x);
            const top = Math.floor(dirtyRect.y);
            const right = Math.ceil(dirtyRect.x + dirtyRect.width);
            const bottom = Math.ceil(dirtyRect.y + dirtyRect.height);
            this.gl.scissor(left, this.height - bottom, right - left, bottom - top);
        } else {
            this.gl.disable(this.gl.SCISSOR_TEST);
        }

        this.gl.clearColor(0.1, 0.1, 0.1, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // 3. 空间查询：获取视野内的节点
        const r0 = performance.now();
        const queryBox = this.getViewportWorldAABB(dirtyRect);
        const visibleItems = this.spatialIndex.search(queryBox);
        
        // 4. 排序：确保渲染顺序（基于 renderOrder，反映场景树结构）
        visibleItems.sort((a, b) => a.node.renderOrder - b.node.renderOrder);

        // 5. 渲染可见节点
        for (const item of visibleItems) {
            const node = item.node;
            if ('renderWebGL' in node && typeof (node as any).renderWebGL === 'function') {
                (node as any).renderWebGL(this, dirtyRect);
            }
        }
        this.stats.times.renderWebGL = performance.now() - r0;

        // 6. 刷新批次
        const f0 = performance.now();
        this.flush();
        this.stats.times.flush = performance.now() - f0;

        this.stats.times.total = performance.now() - startTime;
        this.updateSmoothStats();
    }

    /**
     * 获取当前视口的世界 AABB
     */
    private getViewportWorldAABB(cullingRect?: Rect) {
        const invView = this.viewMatrixInverse;
        const p0 = vec2.set(this._tempVec2_0, 0, 0);
        const p1 = vec2.set(this._tempVec2_1, this.width, this.height);
        const w0 = this._tempVec2_2;
        const w1 = this._tempVec2_3;
        vec2.transformMat3(w0, p0, invView);
        vec2.transformMat3(w1, p1, invView);

        let minX = Math.min(w0[0], w1[0]);
        let minY = Math.min(w0[1], w1[1]);
        let maxX = Math.max(w0[0], w1[0]);
        let maxY = Math.max(w0[1], w1[1]);

        if (cullingRect) {
            const cp0 = vec2.set(this._tempVec2_0, cullingRect.x, cullingRect.y);
            const cp1 = vec2.set(this._tempVec2_1, cullingRect.x + cullingRect.width, cullingRect.y + cullingRect.height);
            const cw0 = vec2.create(); 
            const cw1 = vec2.create();
            vec2.transformMat3(cw0, cp0, invView);
            vec2.transformMat3(cw1, cp1, invView);
            minX = Math.max(minX, Math.min(cw0[0], cw1[0]));
            minY = Math.max(minY, Math.min(cw0[1], cw1[1]));
            maxX = Math.min(maxX, Math.max(cw0[0], cw1[0]));
            maxY = Math.min(maxY, Math.max(cw0[1], cw1[1]));
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * 渲染整个场景 (Canvas 2D Pass)
     */
    public renderCanvas(scene: Node, dirtyRect?: Rect) {
        const c0 = performance.now();
        
        // 1. 空间查询
        const queryBox = this.getViewportWorldAABB(dirtyRect);
        const visibleItems = this.spatialIndex.search(queryBox);
        
        // 2. 排序
        visibleItems.sort((a, b) => a.node.renderOrder - b.node.renderOrder);

        // 3. 渲染
        for (const item of visibleItems) {
            const node = item.node;
            if ('renderCanvas' in node && typeof (node as any).renderCanvas === 'function') {
                (node as any).renderCanvas(this);
            }
        }

        this.stats.times.canvas2D = performance.now() - c0;
    }


    /**
     * 恢复 2D Canvas 状态 (No-op)
     */
    public restoreCanvas2D(_dirtyRect?: Rect) {
        // No-op
    }

    // 废弃的辅助方法 (为了兼容旧接口暂时保留)
    public bindQuad() {
        // No-op in batch mode
    }

    public getProjectionMatrix() {
        return this.projectionMatrix;
    }

    /**
     * 设置视图矩阵
     * @param x 平移 X
     * @param y 平移 Y
     * @param scale 缩放比例
     */
    public setViewTransform(x: number, y: number, scale: number) {
        // 构建视图矩阵: 先缩放再平移
        mat3.identity(this.viewMatrix);
        
        // 缩放
        this.viewMatrix[0] = scale;
        this.viewMatrix[4] = scale;
        
        // 平移
        this.viewMatrix[6] = x;
        this.viewMatrix[7] = y;

        // 计算逆矩阵用于坐标转换
        mat3.invert(this.viewMatrixInverse, this.viewMatrix);
    }

    public getViewMatrix() {
        return this.viewMatrix;
    }

    public getViewMatrixInverse() {
        return this.viewMatrixInverse;
    }

    public getProgram() {
        return this.shaderProgram!;
    }

    /**
     * 更新平滑性能统计数据
     * @param alpha 平滑系数
     */
    public updateSmoothStats(alpha: number = 0.05) {
        const st = this.stats.smoothTimes;
        const t = this.stats.times;

        st.transform = st.transform * (1 - alpha) + t.transform * alpha;
        st.renderWebGL = st.renderWebGL * (1 - alpha) + t.renderWebGL * alpha;
        st.flush = st.flush * (1 - alpha) + t.flush * alpha;
        st.logic = st.logic * (1 - alpha) + t.logic * alpha;
        st.hitTest = st.hitTest * (1 - alpha) + t.hitTest * alpha;
        st.boxSelect = st.boxSelect * (1 - alpha) + t.boxSelect * alpha;
        st.nodeTransform = st.nodeTransform * (1 - alpha) + t.nodeTransform * alpha;
        st.total = st.total * (1 - alpha) + t.total * alpha;
    }

    /**
     * 提交当前批次的绘制请求 (Flush)
     */
    public flush() {
        if (this.currentQuadCount === 0) return;

        const gl = this.gl;
        const program = this.shaderProgram!;

        gl.useProgram(program);

        // 上传顶点数据
        if (this.dynamicVertexBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVertexBuffer);
            // 仅上传已使用的部分数据
            const view = this.vertexBufferData.subarray(0, this.currentQuadCount * 4 * Renderer.VERTEX_SIZE);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
        }

        // 绑定索引缓冲区
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        // 绑定多纹理
        for (let i = 0; i < this.textureSlots.length; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.textureSlots[i]);
        }

        // 设置 u_textures uniform 数组
        const uTexturesLocation = gl.getUniformLocation(program, "u_textures");
        if (uTexturesLocation) {
            gl.uniform1iv(uTexturesLocation, this.textureIndices);
        }

        // 设置投影矩阵
        const uProjectionLocation = gl.getUniformLocation(program, "u_projectionMatrix");
        gl.uniformMatrix3fv(uProjectionLocation, false, this.projectionMatrix);

        // 设置视图矩阵
        const uViewLocation = gl.getUniformLocation(program, "u_viewMatrix");
        gl.uniformMatrix3fv(uViewLocation, false, this.viewMatrix);

        // 执行绘制调用 (Draw Call)
        gl.drawElements(gl.TRIANGLES, this.currentQuadCount * 6, gl.UNSIGNED_SHORT, 0);

        // 统计
        this.stats.drawCalls++;
        this.stats.quadCount += this.currentQuadCount;

        // 重置批处理状态
        this.currentQuadCount = 0;
        this.textureSlots = [];
    }

    /**
     * 高性能绘制 Quad，避免 Float32Array 分配
     * @param texture 纹理对象
     * @param x0, y0 左上角
     * @param x1, y1 右上角
     * @param x2, y2 右下角
     * @param x3, y3 左下角
     * @param uvs UV 数组 (Float32Array, 通常从 Texture 复用)
     * @param color 颜色数组 (Float32Array, 建议缓存复用)
     */
    public drawQuadFast(
        texture: WebGLTexture,
        x0: number, y0: number,
        x1: number, y1: number,
        x2: number, y2: number,
        x3: number, y3: number,
        uvs: Float32Array,
        color: Float32Array
    ) {
        // 查找或添加纹理到槽位
        let textureIndex = this.textureSlots.indexOf(texture);

        if (textureIndex === -1) {
            if (this.textureSlots.length >= this.maxTextures) {
                this.flush();
                textureIndex = 0;
                this.textureSlots.push(texture);
            } else {
                textureIndex = this.textureSlots.length;
                this.textureSlots.push(texture);
            }
        }

        if (this.currentQuadCount >= Renderer.MAX_QUADS) {
            this.flush();
            textureIndex = 0;
            this.textureSlots.push(texture);
        }

        const offset = this.currentQuadCount * 4 * Renderer.VERTEX_SIZE;
        const data = this.vertexBufferData;
        const r = color[0], g = color[1], b = color[2], a = color[3];

        // Vertex 0 (TL)
        let idx = offset;
        data[idx++] = x0; data[idx++] = y0;
        data[idx++] = uvs[0]; data[idx++] = uvs[1];
        data[idx++] = r; data[idx++] = g; data[idx++] = b; data[idx++] = a;
        data[idx++] = textureIndex;

        // Vertex 1 (TR)
        data[idx++] = x1; data[idx++] = y1;
        data[idx++] = uvs[2]; data[idx++] = uvs[3];
        data[idx++] = r; data[idx++] = g; data[idx++] = b; data[idx++] = a;
        data[idx++] = textureIndex;

        // Vertex 2 (BR)
        data[idx++] = x2; data[idx++] = y2;
        data[idx++] = uvs[4]; data[idx++] = uvs[5];
        data[idx++] = r; data[idx++] = g; data[idx++] = b; data[idx++] = a;
        data[idx++] = textureIndex;

        // Vertex 3 (BL)
        data[idx++] = x3; data[idx++] = y3;
        data[idx++] = uvs[6]; data[idx++] = uvs[7];
        data[idx++] = r; data[idx++] = g; data[idx++] = b; data[idx++] = a;
        data[idx++] = textureIndex;

        this.currentQuadCount++;
    }

    /**
     * 添加一个 Quad 到批处理队列
     * @deprecated Use drawQuadFast instead to avoid GC
     */
    public drawQuad(texture: WebGLTexture, vertices: Float32Array, uvs: Float32Array, color: Float32Array) {
        // 查找或添加纹理到槽位
        let textureIndex = this.textureSlots.indexOf(texture);

        if (textureIndex === -1) {
            // 如果纹理槽已满，先 Flush
            if (this.textureSlots.length >= this.maxTextures) {
                this.flush();
                textureIndex = 0;
                this.textureSlots.push(texture);
            } else {
                textureIndex = this.textureSlots.length;
                this.textureSlots.push(texture);
            }
        }

        // 如果 Quad 数量已满，先 Flush
        if (this.currentQuadCount >= Renderer.MAX_QUADS) {
            this.flush();
            // Flush 后需重新添加纹理
            textureIndex = 0;
            this.textureSlots.push(texture);
        }

        // 填充顶点数据到 Buffer
        const offset = this.currentQuadCount * 4 * Renderer.VERTEX_SIZE;
        const data = this.vertexBufferData;

        // 4 个顶点
        for (let i = 0; i < 4; i++) {
            const idx = offset + i * Renderer.VERTEX_SIZE;

            // Pos (x, y)
            data[idx + 0] = vertices[i * 2 + 0];
            data[idx + 1] = vertices[i * 2 + 1];

            // UV (u, v)
            data[idx + 2] = uvs[i * 2 + 0];
            data[idx + 3] = uvs[i * 2 + 1];

            // Color (r, g, b, a)
            data[idx + 4] = color[0];
            data[idx + 5] = color[1];
            data[idx + 6] = color[2];
            data[idx + 7] = color[3];

            // Texture Index
            data[idx + 8] = textureIndex;
        }

        this.currentQuadCount++;
    }
}
