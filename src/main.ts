import { Engine } from './engine/Engine';
import { Container } from './engine/display/Container';
import { Node } from './engine/display/Node';
import { TileLayer } from './engine/display/TileLayer';
import type { TileSource } from './engine/display/TileLayer';
import { FlexDirection, Justify, Align, Wrap } from 'yoga-layout';
import { TextureManager } from './engine/utils/TextureManager';

// 模拟瓦片生成函数
function createTileSource(x: number, y: number, z: number): TileSource {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const isEven = (x + y) % 2 === 0;
    ctx.fillStyle = isEven ? '#e0e0e0' : '#ffffff';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#999';
    ctx.font = '24px monospace';
    ctx.fillText(`Z:${z}`, 20, 40);
    ctx.fillText(`${x},${y}`, 20, 80);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(0, 0, 256, 256);

    return canvas;
}

// 红色矩形测试节点
class TestRect extends Node {
    public override renderWebGL(renderer: any) {
        const gl = renderer.gl;
        // 确保白色纹理已创建
        TextureManager.createWhiteTexture(gl);
        const whiteTex = TextureManager.getWhiteTexture();
        if (!whiteTex) return;

        const vertices = new Float32Array([
            0, 0,
            200, 0,
            200, 200,
            0, 200
        ]);
        const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
        const color = new Float32Array([1, 0, 0, 1]); // 纯红色

        // 转换顶点到世界坐标
        const m = this.transform.worldMatrix;
        const v = new Float32Array(8);
        for (let i = 0; i < 4; i++) {
            const px = vertices[i * 2];
            const py = vertices[i * 2 + 1];
            v[i * 2] = px * m[0] + py * m[3] + m[6];
            v[i * 2 + 1] = px * m[1] + py * m[4] + m[7];
        }

        renderer.drawQuad(whiteTex.baseTexture, v, uvs, color);
    }
}

async function initApp() {
    const app = document.getElementById('app')!;
    if (!app) return;

    // 确保容器有尺寸
    if (app.clientWidth === 0 || app.clientHeight === 0) {
        app.style.width = '100vw';
        app.style.height = '100vh';
    }

    const engine = new Engine(app);

    // 1. 等待引擎初始化完成 (加载 WASM, 纹理等)
    console.log("[Main] Initializing engine...");
    await engine.init();
    console.log("[Main] Engine initialized.");

    // 2. 添加瓦片层 (背景 - 最先添加，处于最底层)
    const tileLayer = new TileLayer(256, createTileSource, 12);
    tileLayer.name = "MapLayer";
    engine.scene.addChild(tileLayer);


    // 5. 性能测试：创建 100,000 个节点
    console.time("PerformanceTest: Create 100k nodes");
    const performanceContainer = new Container(engine.renderer.gl);
    performanceContainer.name = "PerformanceContainer";
    performanceContainer.interactive = true; // 开启交互
    performanceContainer.layoutWidth = 5000;  // 给定一个大的布局尺寸
    performanceContainer.layoutHeight = 5000;
    performanceContainer.flexDirection = FlexDirection.Row;
    performanceContainer.flexWrap = Wrap.Wrap; // 允许换行，否则 10 万个节点会排成一行
    performanceContainer.gap = 10;
    engine.scene.addChild(performanceContainer);

    for (let i = 0; i < 100000; i++) {
        const box = new Container(engine.renderer.gl);
        box.name = `Box_${i}`;
        box.interactive = true; // 开启子节点交互
        // 随机大小
        box.layoutWidth = 10 + Math.random() * 20;
        box.layoutHeight = 10 + Math.random() * 20;
        // 随机颜色
        box.color = new Float32Array([
            Math.random(),
            Math.random(),
            Math.random(),
            0.8
        ]);
        performanceContainer.addChild(box);
    }
    console.timeEnd("PerformanceTest: Create 100k nodes");

    // 4. 演示 Yoga 布局 (UI层 - 处于最顶层)
    const root = new Container(engine.renderer.gl);
    root.name = "UIRoot";
    root.ignoreCamera = true; // UI 根节点忽略摄像机平移和缩放
    root.flexDirection = FlexDirection.Column;
    root.justifyContent = Justify.Center;
    root.alignItems = Align.Center;
    root.layoutWidth = '100%';
    root.layoutHeight = '100%';
    root.padding = 20;
    root.interactive = true; // 允许作为拖拽目标
    engine.scene.addChild(root);

    const panel = new Container(engine.renderer.gl);
    panel.name = "UIPanel";
    panel.flexDirection = FlexDirection.Row;
    panel.padding = 10;
    panel.gap = 10;
    panel.color = new Float32Array([1, 1, 1, 0.5]); // 半透明白色背景
    panel.interactive = true; // 允许交互
    root.addChild(panel);

    // 添加两个子元素用于测试交互
    const box1 = new Container(engine.renderer.gl);
    box1.name = "BlueBox";
    box1.layoutWidth = 100;
    box1.layoutHeight = 100;
    box1.color = new Float32Array([0.2, 0.5, 1, 1]); // 蓝色
    box1.interactive = true; // 允许交互
    panel.addChild(box1);

    const box2 = new Container(engine.renderer.gl);
    box2.name = "GreenBox";
    box2.layoutWidth = 100;
    box2.layoutHeight = 100;
    box2.color = new Float32Array([0.2, 0.8, 0.2, 1]); // 绿色
    box2.interactive = true; // 允许交互
    panel.addChild(box2);

    // 计算布局并强制刷新
    engine.scene.calculateLayout(engine.renderer.width, engine.renderer.height);
    engine.invalidateFull();

    console.log("[Main] App setup complete. Scene children:", engine.scene.children.length);
}

initApp().catch(console.error);
