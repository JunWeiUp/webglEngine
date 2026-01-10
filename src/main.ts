import './style.css'
import { Engine } from './engine/Engine';
import { TileLayer } from './engine/display/TileLayer';
import { Sprite } from './engine/display/Sprite';
import { Text } from './engine/display/Text';
import { Container } from './engine/display/Container';
import { MemoryTracker } from './engine/utils/MemoryProfiler';
import { vec2, mat3 } from 'gl-matrix';

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

    for (let i = startRow; i < endRow; i++) {
        for (let j = 0; j < totalCols; j++) {
            const container = new Container(engine.renderer.gl);
            container.name = "MyContainer";
            container.transform.setPosition(500 * i, 500 * j);
            container.interactive = true;
            // container.width = 400;
            // container.height = 400;
            container.set(container.x, container.y, 400, 400);

            container.color = new Float32Array([Math.random(), Math.random(), Math.random(), 0.5]);


            container.style = {
            // backgroundColor: [1, 1, 1, 1],
            borderRadius: [11,3,44,155],
            borderColor: [0, 0, 0, 1],
            borderWidth: 4
             };
             container.effects={
                backgroundBlur:2,
               outerShadow: {
                color: [0.1, 0.3, 0.4, 0.5],
                blur: 10,
                offsetX: 5,
                offsetY: 5,
                spread: 2
            }
             }
            // 最后一个参数 true 表示不立即触发 invalidate，等到一批完成后统一触发
            engine.scene.addChild(container, true);

            // 3. Add Sprites with generated images
            const sprite1 = new Sprite(engine.renderer.gl, sprite1Url);
            sprite1.transform.setPosition(50, 50);
            // sprite1.width = 100;
            // sprite1.height = 100;
            sprite1.set(sprite1.x, sprite1.y, 100, 100);
            sprite1.interactive = true;
            sprite1.name = "Sprite"+i+"_"+j;
            container.addChild(sprite1, true);

            const sprite2 = new Sprite(engine.renderer.gl, sprite2Url);
            sprite2.transform.setPosition(200, 50);
            // sprite2.width = 100;
            // sprite2.height = 100;
            sprite2.set(sprite2.x, sprite2.y, 100, 100);

            sprite2.interactive = true;
            sprite2.name = "Sprite"+i+"_"+j;    
            container.addChild(sprite2, true);

            // 4. Add Text (Canvas2D)
            const text = new Text("HelloText "+i+"_"+j);
            text.transform.setPosition(50, 200);
            text.fontSize = 30;
            text.fillStyle = "red";
            text.interactive = true;
            text.name = "HelloText"+i+"_"+j;
            container.addChild(text, true);
        }
    }

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
        instruction.transform.setPosition(20, 20);
        instruction.fontSize = 16;
        instruction.fillStyle = "black";
        instruction.name = "Instructions";
        engine.scene.addChild(instruction);

        // 更新大纲视图
        engine.outline.update();

        // 5. 添加特效演示节点
        const effectContainer = new Container(engine.renderer.gl);
        effectContainer.name = "EffectDemoContainer";
        effectContainer.transform.setPosition(20, 100);
        effectContainer.set(20, 100, 800, 600);
        engine.scene.addChild(effectContainer);

        // 5.1 外阴影 + 圆角
        const rect1 = new Container(engine.renderer.gl);
        rect1.name = "OuterShadowRect";
        rect1.transform.setPosition(50, 50);
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
        rect2.transform.setPosition(300, 50);
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
        rect3.transform.setPosition(50, 250);
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
        glassText.transform.setPosition(20, 20);
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

// ==========================================
// UI Logic: Figma-style Toolbar at bottom center
// ==========================================

const toolbar = document.createElement('div');
Object.assign(toolbar.style, {
    position: 'absolute',
    bottom: '24px',
    left: 'calc(250px + (100% - 250px) / 2)',
    transform: 'translateX(-50%)',
    height: '40px',
    backgroundColor: '#2c2c2c',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px',
    gap: '2px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)',
    zIndex: '1000',
    userSelect: 'none',
    transition: 'left 0.3s ease' // Smooth move when property panel toggles
});
document.body.appendChild(toolbar);

// Update toolbar position when selection changes (because canvas size changes)
const originalOnSelectionChange = engine.interaction.onSelectionChange;
engine.interaction.onSelectionChange = () => {
    if (originalOnSelectionChange) originalOnSelectionChange();
    
    // Adjust toolbar position based on whether property panel is shown
    if (engine.auxLayer.selectedNode) {
        toolbar.style.left = 'calc(250px + (100% - 250px - 240px) / 2)';
    } else {
        toolbar.style.left = 'calc(250px + (100% - 250px) / 2)';
    }
};

// ---------------------------------------------------------
// Node Creation Logic
// ---------------------------------------------------------

engine.interaction.onCreateNode = (type, x, y, w, h, parent) => {
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

    let node;
    if (type === 'frame') {
        const container = new Container(engine.renderer.gl);
        container.name = `Frame_${Math.floor(Math.random() * 1000)}`;
        container.interactive = true;
        container.set(localPos[0], localPos[1], w, h);
        container.color = new Float32Array([0.2, 0.6, 1.0, 0.5]);
        node = container;
    } else {
        const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
        const url = createDebugImage("Image", color, 100, 100);
        const sprite = new Sprite(engine.renderer.gl, url);
        sprite.interactive = true;
        sprite.name = `Image_${Math.floor(Math.random() * 1000)}`;
        sprite.set(localPos[0], localPos[1], w, h);
        node = sprite;
    }

    if (node) {
        // 确保添加到正确的父节点
        const targetParent = parent || engine.scene;
        targetParent.addChild(node);
        engine.outline.update();
    }
    return node;
};

function createToolbarButton(label: string, icon: string, type: 'frame' | 'image') {
    const btn = document.createElement('div');
    btn.draggable = true; // Enable HTML5 drag and drop
    Object.assign(btn.style, {
        height: '32px',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        color: '#e0e0e0',
        fontSize: '12px',
        cursor: 'pointer',
        borderRadius: '4px',
        transition: 'background-color 0.2s',
        whiteSpace: 'nowrap'
    });

    btn.innerHTML = `<span style="font-size: 16px;">${icon}</span> <span>${label}</span>`;

    btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = '#444';
    });
    btn.addEventListener('mouseleave', () => {
        if (engine.activeTool !== type) {
            btn.style.backgroundColor = 'transparent';
        }
    });

    // 1. Click to enter creation mode (draw size on canvas)
    btn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (engine.activeTool === type) {
            engine.activeTool = null;
            btn.style.backgroundColor = 'transparent';
        } else {
            engine.activeTool = type;
            // Clear other buttons' background if needed, but here we just set this one
            btn.style.backgroundColor = '#444';
        }
    });

    // 2. Drag to create 100x100 element following mouse
    btn.addEventListener('dragstart', (e) => {
        // Set drag image to empty/transparent to avoid default ghost image
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer?.setDragImage(img, 0, 0);
        
        // Use engine interaction to start drag creation
        engine.interaction.startDragCreation(type, [e.clientX, e.clientY]);
    });

    btn.addEventListener('drag', (e) => {
        if (e.clientX === 0 && e.clientY === 0) return; // Ignore final drag event
        engine.interaction.updateDragCreation([e.clientX, e.clientY]);
    });

    btn.addEventListener('dragend', (e) => {
        engine.interaction.endDragCreation([e.clientX, e.clientY]);
    });

    toolbar.appendChild(btn);
    return btn;
}

// 1. Add Container Button
createToolbarButton("Frame", "⬜", 'frame');

// 2. Add Sprite Button
createToolbarButton("Image", "🖼️", 'image');

// ==========================================
// Performance Stats & Debug Tools
// ==========================================

const statsContainer = document.createElement('div');
statsContainer.style.position = 'absolute';
statsContainer.style.bottom = '10px';
statsContainer.style.left = '10px';
statsContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
statsContainer.style.color = '#00ff00';
statsContainer.style.padding = '10px';
statsContainer.style.fontFamily = 'monospace';
statsContainer.style.fontSize = '12px';
statsContainer.style.pointerEvents = 'none';
statsContainer.style.zIndex = '1000';
document.body.appendChild(statsContainer);

let lastUpdateTime = 0;
let totalNodes = 0;

function updateStats(time: number) {
    // 每 300ms 更新一次 UI，而不是每帧 (16ms)
    if (time - lastUpdateTime < 300) {
        requestAnimationFrame(updateStats);
        return;
    }
    lastUpdateTime = time;

    const glStats = engine.renderer.stats;
    const smooth = glStats.smoothTimes;
    const scene = engine.scene;
    const memTracker = MemoryTracker.getInstance();
    const memStats = memTracker.getStats();

    // 只有当节点数量可能变化时才重新遍历 (或者简单地每秒遍历一次)
    if (totalNodes === 0 || Math.random() < 0.05) {
        totalNodes = 0;
        scene.traverse(() => totalNodes++);
    }

    statsContainer.innerHTML = `
        <div style="font-weight: bold; color: #fff; margin-bottom: 5px;">Performance Monitor</div>
        FPS: ${glStats.lastFPS}<br>
        Total Nodes: ${totalNodes}<br>
        Draw Calls: ${glStats.drawCalls}<br>
        Quads: ${glStats.quadCount}<br>
        <hr style="border: 0; border-top: 1px solid #444; margin: 5px 0;">
        <div style="font-weight: bold; color: #fff; margin-bottom: 2px;">Memory Usage</div>
        <div style="color: #00ffff;">Total: ${MemoryTracker.formatBytes(memStats.totalBytes)}</div>
        GPU Tex: ${MemoryTracker.formatBytes(memStats.totalByGroup['GPU Texture'] || 0)}<br>
        GPU Buf: ${MemoryTracker.formatBytes(memStats.totalByGroup['GPU Buffer'] || 0)}<br>
        CPU Canvas: ${MemoryTracker.formatBytes(memStats.totalByGroup['CPU Canvas'] || 0)}<br>
        CPU Array: ${MemoryTracker.formatBytes(memStats.totalByGroup['CPU TypedArray'] || 0)}<br>
        <hr style="border: 0; border-top: 1px solid #444; margin: 5px 0;">
        <div style="font-weight: bold; color: #fff; margin-bottom: 2px;">Timing (ms)</div>
        WebGL Render: ${smooth.renderWebGL.toFixed(2)}<br>
        Flush (GPU): ${smooth.flush.toFixed(2)}<br>
        Canvas 2D: ${smooth.canvas2D.toFixed(2)}<br>
        Logic: ${smooth.logic.toFixed(2)}<br>
        Interaction to Render: ${smooth.interactionToRender.toFixed(2)}<br>
        <div style="color: #ffff00; margin-top: 2px;">Total: ${smooth.total.toFixed(2)}</div>
    `;
    requestAnimationFrame(updateStats);
}
requestAnimationFrame(updateStats);
