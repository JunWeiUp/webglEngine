import { defaultFragmentShader, defaultVertexShader } from './shaders';
import { Node } from '../display/Node';
import { mat3 } from 'gl-matrix';

/**
 * 核心渲染器类
 * 负责 WebGL 上下文管理、着色器编译、批处理渲染以及场景树的遍历渲染。
 */
export class Renderer {
    public gl: WebGLRenderingContext;
    public ctx: CanvasRenderingContext2D;
    public width: number;
    public height: number;
    
    private shaderProgram: WebGLProgram | null = null;
    
    // 批处理渲染状态
    private static readonly MAX_QUADS = 10000; // 最大批处理 Quad 数量
    private static readonly MAX_TEXTURES = 8;  // 最大纹理单元数量
    private static readonly VERTEX_SIZE = 9;   // 顶点数据大小: x, y, u, v, r, g, b, a, texIndex
    
    private vertexBufferData: Float32Array; // 顶点数据缓冲区（CPU）
    private currentQuadCount: number = 0;   // 当前已填充的 Quad 数量
    private textureSlots: WebGLTexture[] = []; // 当前批次使用的纹理槽
    
    private dynamicVertexBuffer: WebGLBuffer | null = null; // 动态顶点缓冲区（GPU）
    private indexBuffer: WebGLBuffer | null = null;         // 静态索引缓冲区（GPU）

    private projectionMatrix: mat3 = mat3.create();

    /**
     * 初始化渲染器
     * @param container 承载 Canvas 的 DOM 容器
     */
    constructor(container: HTMLElement) {
        // 初始化批处理数据
        this.vertexBufferData = new Float32Array(Renderer.MAX_QUADS * 4 * Renderer.VERTEX_SIZE);

        // 创建 WebGL Canvas
        const canvasGL = document.createElement('canvas');
        canvasGL.style.position = 'absolute';
        canvasGL.style.top = '0';
        canvasGL.style.left = '0';
        container.appendChild(canvasGL);
        this.gl = canvasGL.getContext('webgl')!;

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
    }

    /**
     * 初始化 WebGL 资源（着色器、缓冲区、状态）
     */
    private initWebGL() {
        const gl = this.gl;
        
        // 编译着色器
        const vs = this.createShader(gl, gl.VERTEX_SHADER, defaultVertexShader);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, defaultFragmentShader);
        
        this.shaderProgram = this.createProgram(gl, vs, fs);
        gl.useProgram(this.shaderProgram);

        // 启用 Alpha 混合
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // 创建动态顶点缓冲区
        this.dynamicVertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexBufferData.byteLength, gl.DYNAMIC_DRAW);

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
        
        // 设置顶点属性布局
        this.bindAttributes();
    }

    /**
     * 绑定顶点属性指针
     */
    private bindAttributes() {
        const gl = this.gl;
        const program = this.shaderProgram!;
        const stride = Renderer.VERTEX_SIZE * 4; // 每个顶点的字节数

        // a_position (2 floats)
        const positionLocation = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);

        // a_texCoord (2 floats)
        const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, stride, 2 * 4);

        // a_color (4 floats)
        const colorLocation = gl.getAttribLocation(program, "a_color");
        gl.enableVertexAttribArray(colorLocation);
        gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, stride, 4 * 4);

        // a_textureIndex (1 float)
        const textureIndexLocation = gl.getAttribLocation(program, "a_textureIndex");
        if (textureIndexLocation !== -1) {
            gl.enableVertexAttribArray(textureIndexLocation);
            gl.vertexAttribPointer(textureIndexLocation, 1, gl.FLOAT, false, stride, 8 * 4);
        }
    }

    private createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
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

    private createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
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
     * 渲染整个场景
     * @param scene 场景根节点
     */
    public render(scene: Node) {
        // 清除 WebGL 画布
        this.gl.clearColor(0.1, 0.1, 0.1, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // 清除 2D 画布
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 更新场景的世界变换矩阵
        scene.updateTransform(null, true); // 根节点强制更新

        // 递归渲染节点树
        this.renderNode(scene);
        
        // 渲染结束，强制刷新剩余的批次
        this.flush();
    }

    /**
     * 递归渲染节点及其子节点
     * 包含视锥体剔除优化
     */
    private renderNode(node: Node) {
        // 视锥体剔除 (Frustum Culling)
        let isVisible = true;
        
        // 仅对有尺寸的节点进行剔除检查（如 Sprite）
        if (node.width > 0 && node.height > 0) {
            isVisible = this.isNodeVisible(node);
        }

        if (isVisible) {
            // 调用节点的 WebGL 渲染方法（如果存在）
            if ('renderWebGL' in node && typeof (node as any).renderWebGL === 'function') {
                (node as any).renderWebGL(this);
            }

            // 调用节点的 Canvas 渲染方法（如果存在）
            if ('renderCanvas' in node && typeof (node as any).renderCanvas === 'function') {
                (node as any).renderCanvas(this);
            }
        }

        // 递归遍历子节点
        // 优化：如果当前节点不可见，且不是容器（即可能是叶子），则不再遍历子节点
        // 但容器（Container）可能本身不可见（无尺寸），但子节点可见。
        // 我们假设：如果节点有尺寸且被剔除，则其子节点也被剔除（假设子节点在父节点范围内）。
        // 实际上 WebGL 场景图通常子节点是相对父节点的，但不一定被父节点包围。
        // 所以最安全的做法是只对完全确定不可见的子树剪枝。
        
        // 目前策略：继续遍历所有子节点，直到我们有世界包围盒（World Bounds）的概念。
        // 简单的优化：如果父节点是容器（width=0, height=0），必须遍历。
        // 如果父节点是 Sprite 且被剔除，且我们约定子节点在 Sprite 内部，则可以剪枝。
        // 暂时保持全遍历，但在 isNodeVisible 里已经做了快速剔除。
        
        // 更好的优化：计算 Bounds。
        
        for (const child of node.children) {
            this.renderNode(child);
        }
    }

    /**
     * 检查节点是否在视口范围内（基于 AABB）
     */
    private isNodeVisible(node: Node): boolean {
        // 获取节点的世界变换矩阵
        const m = node.transform.worldMatrix;
        const w = node.width;
        const h = node.height;

        // 计算节点四个角的世界坐标
        // 0,0  w,0  0,h  w,h
        // 变换公式:
        // x' = x*m00 + y*m10 + m20
        // y' = x*m01 + y*m11 + m21
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        const corners = [
            0, 0,
            w, 0,
            0, h,
            w, h
        ];
        
        for (let i = 0; i < 4; i++) {
            const x = corners[i*2];
            const y = corners[i*2+1];
            
            const wx = x * m[0] + y * m[3] + m[6];
            const wy = x * m[1] + y * m[4] + m[7];
            
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
        }
        
        // AABB 相交检测: 检查是否与视口 (0, 0, width, height) 重叠
        if (maxX < 0 || minX > this.width || maxY < 0 || minY > this.height) {
            return false;
        }
        
        return true;
    }

    // 废弃的辅助方法 (为了兼容旧接口暂时保留)
    public bindQuad() {
        // No-op in batch mode
    }

    public getProjectionMatrix() {
        return this.projectionMatrix;
    }

    public getProgram() {
        return this.shaderProgram!;
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
             const textureIndices = [0, 1, 2, 3, 4, 5, 6, 7];
             gl.uniform1iv(uTexturesLocation, textureIndices);
        }

        // 设置投影矩阵
        const uProjectionLocation = gl.getUniformLocation(program, "u_projectionMatrix");
        gl.uniformMatrix3fv(uProjectionLocation, false, this.projectionMatrix);

        // 执行绘制调用 (Draw Call)
        gl.drawElements(gl.TRIANGLES, this.currentQuadCount * 6, gl.UNSIGNED_SHORT, 0);

        // 重置批处理状态
        this.currentQuadCount = 0;
        this.textureSlots = [];
    }

    /**
     * 添加一个 Quad 到批处理队列
     * @param texture 纹理对象
     * @param vertices 世界坐标顶点 (4个点, 8个 float)
     * @param uvs UV坐标 (4个点, 8个 float)
     * @param color 颜色 (4个 float)
     */
    public drawQuad(texture: WebGLTexture, vertices: Float32Array, uvs: Float32Array, color: Float32Array) {
        // 查找或添加纹理到槽位
        let textureIndex = this.textureSlots.indexOf(texture);
        
        if (textureIndex === -1) {
            // 如果纹理槽已满，先 Flush
            if (this.textureSlots.length >= Renderer.MAX_TEXTURES) {
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
