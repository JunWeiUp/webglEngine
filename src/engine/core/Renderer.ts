import { defaultFragmentShader, defaultVertexShader } from './shaders';
import { Node } from '../display/Node';
import { mat3 } from 'gl-matrix';

export class Renderer {
    public gl: WebGLRenderingContext;
    public ctx: CanvasRenderingContext2D;
    public width: number;
    public height: number;
    
    private shaderProgram: WebGLProgram | null = null;
    private positionBuffer: WebGLBuffer | null = null;
    private texCoordBuffer: WebGLBuffer | null = null;

    private projectionMatrix: mat3 = mat3.create();

    constructor(container: HTMLElement) {
        // Create WebGL Canvas
        const canvasGL = document.createElement('canvas');
        canvasGL.style.position = 'absolute';
        canvasGL.style.top = '0';
        canvasGL.style.left = '0';
        container.appendChild(canvasGL);
        this.gl = canvasGL.getContext('webgl')!;

        // Create 2D Canvas (Auxiliary)
        const canvas2D = document.createElement('canvas');
        canvas2D.style.position = 'absolute';
        canvas2D.style.top = '0';
        canvas2D.style.left = '0';
        // canvas2D.style.pointerEvents = 'none'; // Let events pass through to GL canvas (or handle manually)
        container.appendChild(canvas2D);
        this.ctx = canvas2D.getContext('2d')!;

        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.resize(this.width, this.height);
        this.initWebGL();
    }

    resize(w: number, h: number) {
        this.width = w;
        this.height = h;
        
        this.gl.canvas.width = w;
        this.gl.canvas.height = h;
        this.ctx.canvas.width = w;
        this.ctx.canvas.height = h;

        this.gl.viewport(0, 0, w, h);

        // Compute Projection Matrix: map pixel coords (0..w, 0..h) to clip space (-1..1, 1..-1)
        // 2/w, 0, 0
        // 0, -2/h, 0
        // -1, 1, 1
        mat3.set(this.projectionMatrix, 
            2 / w, 0, 0,
            0, -2 / h, 0,
            -1, 1, 1
        );
    }

    private initWebGL() {
        const gl = this.gl;
        
        // Compile Shaders
        const vs = this.createShader(gl, gl.VERTEX_SHADER, defaultVertexShader);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, defaultFragmentShader);
        
        this.shaderProgram = this.createProgram(gl, vs, fs);
        gl.useProgram(this.shaderProgram);

        // Enable Alpha Blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Create Unit Quad Buffer
        // 0,0  1,0
        // 0,1  1,1
        const positions = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            0, 1,
            1, 0,
            1, 1,
        ]);
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const texCoords = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            0, 1,
            1, 0,
            1, 1,
        ]);
        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
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

    public render(scene: Node) {
        // Clear WebGL
        this.gl.clearColor(0.1, 0.1, 0.1, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Clear Canvas2D
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before clearing
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Update World Transforms
        scene.updateTransform(null);

        // Render Tree
        this.renderNode(scene);
    }

    private renderNode(node: Node) {
        // Check if node is Sprite (WebGL) or Text (Canvas2D) or Container
        // We can do this by checking properties or instanceof
        // Ideally Node has a render method, but we separated Renderer.
        
        // Let's call node.render(this) - Dependency Injection
        // We need to update Node.ts to accept Renderer
        // But for now, let's cast or check type to keep it simple in one place, 
        // OR better: define a render interface.
        
        // Since I can't easily cyclic import Renderer into Node if I'm not careful,
        // I will use a simple convention:
        // if node has 'renderWebGL' method, call it.
        // if node has 'renderCanvas' method, call it.
        
        if ('renderWebGL' in node && typeof (node as any).renderWebGL === 'function') {
            (node as any).renderWebGL(this);
        }

        if ('renderCanvas' in node && typeof (node as any).renderCanvas === 'function') {
            (node as any).renderCanvas(this);
        }

        for (const child of node.children) {
            this.renderNode(child);
        }
    }

    // Helpers for nodes to use
    public bindQuad() {
        const gl = this.gl;
        const program = this.shaderProgram!;

        const positionLocation = gl.getAttribLocation(program, "a_position");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    }

    public getProjectionMatrix() {
        return this.projectionMatrix;
    }

    public getProgram() {
        return this.shaderProgram!;
    }
}
