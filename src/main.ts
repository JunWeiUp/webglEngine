import './style.css'
import { Engine } from './engine/Engine';
import { TileLayer } from './engine/display/TileLayer';
import { Sprite } from './engine/display/Sprite';
import { Text } from './engine/display/Text';
import { Container } from './engine/display/Container';

const app = document.querySelector<HTMLDivElement>('#app')!
app.style.width = '100vw';
app.style.height = '100vh';
app.style.overflow = 'hidden';
app.style.margin = '0';
app.style.padding = '0';
document.body.style.margin = '0';

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

    // Check if tile coords are valid for this zoom level (0 to 2^z - 1)
    const maxTile = Math.pow(2, z);
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
const totalRows = 300; // 恢复为 100 行 (共 10000 个容器)
const totalCols = 100;
const batchSize = 5; // 每帧处理 5 行

let currentRow = 0;

// 添加加载提示
const loadingText = new Text("Loading Scene... 0%");
loadingText.transform.position = [engine.renderer.width / 2 - 100, engine.renderer.height / 2];
loadingText.fontSize = 40;
loadingText.fillStyle = "blue";
loadingText.name = "LoadingText";
engine.scene.addChild(loadingText, true);

function loadBatch() {
    const startRow = currentRow;
    const endRow = Math.min(currentRow + batchSize, totalRows);

    for (let i = startRow; i < endRow; i++) {
        for (let j = 0; j < totalCols; j++) {
            const container = new Container(engine.renderer.gl);
            container.name = "MyContainer";
            container.transform.position = [300 * i, 300 * j];
            container.interactive = true;
            container.width = 400;
            container.height = 400;

            container.color = new Float32Array([0.8, 0.8, 1.0, 0.5]);
            // 最后一个参数 true 表示不立即触发 invalidate，等到一批完成后统一触发
            engine.scene.addChild(container, true);

            // 3. Add Sprites with generated images
            const sprite1 = new Sprite(engine.renderer.gl, sprite1Url);
            sprite1.transform.position = [50, 50];
            sprite1.width = 100;
            sprite1.height = 100;
            sprite1.interactive = true;
            sprite1.name = "Sprite1";
            container.addChild(sprite1, true);

            const sprite2 = new Sprite(engine.renderer.gl, sprite2Url);
            sprite2.transform.position = [200, 50];
            sprite2.width = 100;
            sprite2.height = 100;
            sprite2.interactive = true;
            sprite2.name = "Sprite2";
            container.addChild(sprite2, true);

            // 4. Add Text (Canvas2D)
            const text = new Text("Hello WebGL + Canvas!");
            text.transform.position = [50, 200];
            text.fontSize = 30;
            text.fillStyle = "red";
            text.interactive = true;
            text.name = "HelloText";
            container.addChild(text, true);
        }
    }

    currentRow = endRow;

    // 更新进度
    const progress = Math.floor((currentRow / totalRows) * 100);
    loadingText.text = `Loading Scene... ${progress}%`;
    // 手动触发布局更新和重绘
    loadingText.width = 0; // 强制重新测量
    engine.scene.invalidate();

    if (currentRow < totalRows) {
            requestAnimationFrame(loadBatch);
        } else {
            console.log("Scene loading complete");
            engine.scene.removeChild(loadingText);
            
            const instruction = new Text("Drag objects to move.\nDrop objects on other objects to reparent.\nDrag background to pan.\nScroll to Zoom.");
            instruction.transform.position = [20, 20];
            instruction.fontSize = 16;
            instruction.fillStyle = "black";
            instruction.name = "Instructions";
            engine.scene.addChild(instruction);

            // 更新大纲视图
            engine.outline.update();
        }
}

// 启动分帧加载
requestAnimationFrame(loadBatch);

console.log("Engine started");

// ==========================================
// UI Logic: Add Buttons to create components
// ==========================================

const uiContainer = document.createElement('div');
uiContainer.style.position = 'absolute';
uiContainer.style.top = '10px';
uiContainer.style.right = '10px';
uiContainer.style.display = 'flex';
uiContainer.style.gap = '10px';
document.body.appendChild(uiContainer);

function createButton(label: string, onClick: () => void) {
    const btn = document.createElement('button');
    btn.innerText = label;
    btn.style.padding = '8px 12px';
    btn.style.fontSize = '14px';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', onClick);
    uiContainer.appendChild(btn);
}

// 1. Add Sprite Button
createButton("添加图片 (Sprite)", () => {
    // Create random color sprite
    const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    const url = createDebugImage("New Sprite", color, 100, 100);

    const sprite = new Sprite(engine.renderer.gl, url);
    sprite.width = 100;
    sprite.height = 100;
    sprite.interactive = true;
    sprite.name = `Sprite_${Math.floor(Math.random() * 1000)}`;

    // Position at center of screen (approx, relative to scene)
    // We should inverse transform screen center to scene local
    // For simplicity, just put it at 400, 400 or random offset from current scene pos
    // Better: Put it at (400, 400)
    sprite.transform.position = [400 + Math.random() * 50, 400 + Math.random() * 50];

    engine.scene.addChild(sprite);
    console.log(`Created ${sprite.name}`);
});

// 2. Add Container Button
// 2. Add Container Button
createButton("添加容器 (Container)", () => {
    const container = new Container(engine.renderer.gl);
    container.name = `Container_${Math.floor(Math.random() * 1000)}`;
    container.transform.position = [300 + Math.random() * 50, 300 + Math.random() * 50];
    container.interactive = true;
    container.width = 200;
    container.height = 200;

    // Visual background set directly
    container.color = new Float32Array([Math.random(), Math.random(), Math.random(), 0.5]);

    engine.scene.addChild(container);
    console.log(`Created ${container.name}`);
});
