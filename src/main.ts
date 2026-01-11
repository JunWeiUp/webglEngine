import './style.css'
import { Engine } from './engine/system/Engine';
import { Node } from './engine/scene/Node';
import { TileLayer } from './engine/scene/TileLayer';
import { Sprite } from './engine/scene/Sprite';
import { Text } from './engine/scene/Text';
import { Container } from './engine/scene/Container';
import { MemoryTracker } from './engine/utils/MemoryProfiler';
import { StatsMonitor } from './engine/ui/StatsMonitor';
import { vec2, mat3 } from 'gl-matrix';
import { FontManager } from './engine/system/FontManager';

const app = document.querySelector<HTMLDivElement>('#app')!
app.style.position = 'absolute';
app.style.left = '250px';
app.style.right = '0';
app.style.top = '0';
app.style.bottom = '0';
app.style.overflow = 'hidden';
app.style.margin = '0';
app.style.padding = '0';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundColor = '#1a1a1a';

const engine = new Engine(app);

// Helper to generate debug images
function createDebugImage(text: string, color: string, width: number = 256, height: number = 256): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);

    ctx.fillStyle = '#000';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    return canvas.toDataURL();
}

// 1. Add Tile Layer (Background) with generated tiles
const tileLayer = new TileLayer(256, (x, y, z) => {
    // Determine the offset for this zoom level
    // At z=12, offset is 2048.
    // At z=11, offset is 1024 (2048 / 2).
    // offset = 2048 * 2^(z - 12)
    const offset = Math.floor(2048 * Math.pow(2, z - 12));

    const tileX = offset + x;
    const tileY = offset + y;

    // In generated mode, we just draw numbers.
    // In real map mode, we would wrap or return empty if out of bounds.

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Checkerboard pattern based on coords
    const isEven = (tileX + tileY) % 2 === 0;
    ctx.fillStyle = isEven ? '#e0e0e0' : '#ffffff';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#999';
    ctx.font = '24px monospace';
    ctx.fillText(`Z:${z}`, 20, 40);
    ctx.fillText(`${tileX},${tileY}`, 20, 80);

    // Grid line
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(0, 0, 256, 256);

    return canvas;
}, 12);
tileLayer.name = "MapLayer";
engine.scene.addChild(tileLayer);
const sprite1Url = createDebugImage("Sprite 1", "#ffcc00", 100, 100);
const sprite2Url = createDebugImage("Sprite 2", "#00ccff", 100, 100);
// 2. Add a Container
// 使用分帧加载优化首屏卡顿 (Time Slicing)
const totalRows = 1000; // 恢复为 100 行 (共 10000 个容器)
const totalCols = 300;
const batchSize = 5; // 每帧处理 5 行

let currentRow = 0;

// 添加加载提示
// const loadingText = new Text("Loading Scene... 0%");
// loadingText.transform.position = [engine.renderer.width / 2 - 100, engine.renderer.height / 2];
// loadingText.fontSize = 40;
// loadingText.fillStyle = "blue";
// loadingText.name = "LoadingText";
// engine.scene.addChild(loadingText, true);

function loadBatch() {
    const startRow = currentRow;
    const endRow = Math.min(currentRow + batchSize, totalRows);
    const batchContainers: Node[] = [];

    for (let i = startRow; i < endRow; i++) {
        for (let j = 0; j < totalCols; j++) {
            const container = new Container(engine.renderer.gl);
            container.name = "MyContainer";
            container.setPosition(500 * i, 500 * j);
            container.interactive = true;
            container.set(container.x, container.y, 400, 400);

            container.color = new Float32Array([Math.random(), Math.random(), Math.random(), 0.5]);

            container.style = {
                borderRadius: [11, 3, 44, 155],
                borderColor: [0, 0, 0, 1],
                borderWidth: 4
            };
            container.effects = {
                backgroundBlur: 2,
                outerShadow: {
                    color: [0.1, 0.3, 0.4, 0.5],
                    blur: 10,
                    offsetX: 5,
                    offsetY: 5,
                    spread: 2
                }
            }

            // 收集子节点批量添加
            const children: Node[] = [];

            // 3. Add Sprites with generated images
            const sprite1 = new Sprite(engine.renderer.gl, sprite1Url);
            sprite1.setPosition(50, 50);
            sprite1.width = 100;
            sprite1.height = 100;
            sprite1.interactive = true;
            sprite1.name = "Sprite" + i + "_" + j;
            children.push(sprite1);

            const sprite2 = new Sprite(engine.renderer.gl, sprite2Url);
            sprite2.setPosition(200, 50);
            sprite2.width = 100;
            sprite2.height = 100;
            sprite2.interactive = true;
            sprite2.name = "Sprite" + i + "_" + j;
            children.push(sprite2);

            // 4. Add Text (Canvas2D)
            const text = new Text("HelloText " + i + "_" + j);
            text.setPosition(50, 200);
            text.fontSize = 30;
            text.fontFamily = FontManager.getInstance().getPreference();
            text.fillStyle = "red";
            text.interactive = true;
            text.name = "HelloText" + i + "_" + j;
            children.push(text);

            // 批量给 container 添加子节点
            container.addChildren(children);
            
            batchContainers.push(container);
        }
    }

    // 批量给场景添加容器
    engine.scene.addChildren(batchContainers);

    currentRow = endRow;

    // loadingText.text = `Loading Scene... ${progress}%`;
    // 手动触发布局更新和重绘
    // loadingText.width = 0; // 强制重新测量
    // engine.scene.invalidate();

    if (currentRow < totalRows) {
        requestAnimationFrame(loadBatch);
    } else {
        console.log("Scene loading complete");
        // engine.scene.removeChild(loadingText);

        const instruction = new Text("Drag objects to move.\nDrop objects on other objects to reparent.\nDrag background to pan.\nScroll to Zoom.");
        instruction.setPosition(20, 20);
        instruction.fontSize = 16;
        instruction.fontFamily = FontManager.getInstance().getPreference();
        instruction.fillStyle = "black";
        instruction.name = "Instructions";
        engine.scene.addChild(instruction);

        // 更新大纲视图
        engine.outline.update();

        // 5. 添加特效演示节点
        const effectContainer = new Container(engine.renderer.gl);
        effectContainer.name = "EffectDemoContainer";
        effectContainer.setPosition(20, 100);
        effectContainer.set(20, 100, 800, 600);
        engine.scene.addChild(effectContainer);

        // 5.1 外阴影 + 圆角
        const rect1 = new Container(engine.renderer.gl);
        rect1.name = "OuterShadowRect";
        rect1.setPosition(50, 50);
        rect1.set(50, 50, 200, 150);
        rect1.style = {
            backgroundColor: [1, 1, 1, 1],
            borderRadius: 20,
            borderColor: [0, 0, 0, 1],
            borderWidth: 10,
            strokeType: 'outer'
        };
        rect1.effects = {
              outerShadow: {
                  color: [0, 0, 0, 0.5],
                  blur: 15,
                  offsetX: 10,
                  offsetY: 10,
                  spread: 5
              },
              layerBlur: 2
          };
        effectContainer.addChild(rect1);

        // 5.2 内阴影 + 渐变背景 (渐变通过样式扩展，目前先用纯色)
        const rect2 = new Container(engine.renderer.gl);
        rect2.name = "InnerShadowRect";
        rect2.setPosition(300, 50);
        rect2.set(300, 50, 200, 150);
        rect2.style = {
            backgroundColor: [0.2, 0.6, 1, 1],
            borderRadius: [40, 0, 40, 0],
        };
        rect2.effects = {
            innerShadow: {
                color: [0, 0, 0, 0.6],
                blur: 15,
                offsetX: 0,
                offsetY: 0,
                spread: 5
            }
        };
        effectContainer.addChild(rect2);

        // 5.3 背景模糊 (毛玻璃)
        const rect3 = new Container(engine.renderer.gl);
        rect3.name = "Glass Card";
        rect3.setPosition(50, 250);
        rect3.set(50, 250, 450, 200);
        rect3.style = {
            backgroundColor: [1, 1, 1, 0.2],
            borderRadius: 20,
            borderColor: [1, 1, 1, 0.5],
            borderWidth: 1,
            strokeType: 'inner'
        };
        rect3.effects = {
            backgroundBlur: 10,
            innerShadow: {
                color: [1, 1, 1, 0.5],
                blur: 10,
                offsetX: 0,
                offsetY: 0,
                spread: 2
            }
        };
        effectContainer.addChild(rect3);

        const glassText = new Text("Glassmorphism Effect");
        glassText.setPosition(20, 20);
        glassText.fontSize = 24;
        glassText.fillStyle = "white";
        rect3.addChild(glassText);

        // 5.4 裁剪示例
        const clipContainer = new Container(engine.renderer.gl);
        clipContainer.name = "ClipContainer";
        clipContainer.set(400, 100, 200, 200);
        clipContainer.style = {
            backgroundColor: [0.2, 0.2, 0.2, 1],
            borderRadius: 40,
            clipChildren: true,
            borderColor: [1, 1, 1, 1],
            borderWidth: 2
        };
        effectContainer.addChild(clipContainer);

        const childRect = new Container(engine.renderer.gl);
        childRect.name = "OverflowingChild";
        childRect.set(100, 100, 200, 200); // 故意超出父容器
        childRect.style = {
            backgroundColor: [1, 0, 0, 0.5],
            borderRadius: 20
        };
        clipContainer.addChild(childRect);
    }
}

// 启动分帧加载
requestAnimationFrame(loadBatch);

console.log("Engine started");

// ---------------------------------------------------------
// Node Creation Logic
// ---------------------------------------------------------

engine.interaction.onCreateNode = (type: 'frame' | 'image' | 'text', x: number, y: number, w: number, h: number, parent: Node) => {
    // 1. 将世界坐标转换为父节点的局部坐标
    const localPos = [x, y];
    
    // 如果有父节点且不是场景根节点，则进行坐标转换
    if (parent && parent !== engine.scene) {
        try {
            const worldMatrix = (parent as any).getWorldMatrix();
            if (worldMatrix) {
                const invMatrix = mat3.create();
                if (mat3.invert(invMatrix, worldMatrix)) {
                    const out = vec2.create();
                    vec2.transformMat3(out, vec2.fromValues(x, y), invMatrix);
                    localPos[0] = out[0];
                    localPos[1] = out[1];
                }
            }
        } catch (e) {
            console.warn('Failed to transform coordinates for nested creation:', e);
        }
    }

    let node: Node | null = null;
    if (type === 'frame') {
        const container = new Container(engine.renderer.gl);
        container.name = `Frame_${Math.floor(Math.random() * 1000)}`;
        container.interactive = true;
        container.set(localPos[0], localPos[1], w, h);
        container.color = new Float32Array([0.2, 0.6, 1.0, 0.5]);
        node = container;
    } else if (type === 'image') {
        const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
        const url = createDebugImage("Image", color, 100, 100);
        const sprite = new Sprite(engine.renderer.gl, url);
        sprite.interactive = true;
        sprite.name = `Image_${Math.floor(Math.random() * 1000)}`;
        sprite.set(localPos[0], localPos[1], w, h);
        node = sprite;
    } else if (type === 'text') {
        const textNode = new Text("New Text");
        textNode.interactive = true;
        textNode.name = `Text_${Math.floor(Math.random() * 1000)}`;
        textNode.setPosition(localPos[0], localPos[1]);
        textNode.fontSize = 24;
        textNode.fillStyle = "#ffffff";
        node = textNode;
    }

    if (node) {
        // 确保添加到正确的父节点
        const targetParent = parent || engine.scene;
        targetParent.addChild(node);
        engine.outline.update();
    }
    return node!;
};

// ==========================================
// Performance Stats & Debug Tools
// ==========================================

new StatsMonitor(engine);

