# WebGL High-Performance Scene Engine | 高性能 WebGL 场景引擎

[English](#english) | [简体中文](#简体中文)

---

<a name="english"></a>

## English

A high-performance 2D scene graph rendering engine built with native WebGL and TypeScript. Designed for large-scale scenes with tens of thousands of nodes, implementing a display list architecture similar to PIXI.js or Flash, with deep optimizations for rendering and interaction.

### ✨ Key Features

*   **High-Performance Rendering Core**
    *   **Native WebGL Batching**: Automatically merges Draw Calls, supporting tens of thousands of quads in a single submission, significantly reducing GPU communication overhead.
    *   **Hybrid Rendering Pipeline**: Clearly separates **WebGL Pass** (high-performance scene) and **Canvas 2D Pass** (high-quality vector UI/auxiliary lines).
    *   **Zero-GC Loop**: Hot paths eliminate temporary object allocations (e.g., `new Float32Array`), utilizing shared buffers and direct memory writes.
    *   **Smart Culling**: Reuses **World AABB** cached during Transform updates to avoid redundant matrix multiplications.

*   **Advanced Text & Font System**
    *   **Multi-Page Texture Atlas**: Automatically merges text drawn on offscreen canvases into large 2048x2048 textures with dynamic expansion.
    *   **Multi-Font Management**: Supports standard fonts (Songti, Heiti, Arial, etc.) and custom TTF/OTF uploads with persistence.
    *   **Xiaohongshu-Style Highlights**: Optimized text highlight effects (Mark, Rect, Circle, Wave, etc.) with precise bounding box measurement.
    *   **Stable Baseline Alignment**: Unified alignment based on `alphabetic` baseline ensures consistent positioning across different fonts.

*   **Smart Dirty Rect & Tile Rendering**
    *   **Differentiated Redraw Strategy**:
        *   **Full Redraw**: For scene pan/zoom (root transform), direct full-screen refresh.
        *   **Local Redraw**: For single node movement, calculates O(1) local dirty rects.
    *   **Tile-Based Optimization**: Planned spatial indexing (Quadtree/R-Tree) for ultra-large canvas management.

*   **Powerful Scene Graph & Interaction**
    *   Hierarchical nesting (`Node`, `Container`, `Sprite`, `Text`, `TileLayer`).
    *   **Time Slicing**: Distributed node creation across multiple frames to eliminate first-screen lag.
    *   **Advanced Interaction**: Box selection (Shift+Drag), reparenting (Drag & Drop), and high-precision hit testing.

### 🚀 Performance Highlights

1.  **Rendering Pruning**: Efficiently culls objects outside the viewport using cached World AABB.
2.  **Resource De-duplication**: Shared textures for Sprites and global atlas for all Text.
3.  **On-Demand Rendering**: 0% GPU usage when the scene is static.
4.  **Zero-Cost Transform**: Node attribute updates trigger invalidation without expensive recursive calculations.

### 🛠️ Installation & Usage

```bash
# 1. Clone
git clone <repository-url>
cd webglEngine

# 2. Install
npm install

# 3. Dev
npm run dev
```

### 📂 Project Structure

```
src/
├── engine/
│   ├── core/           # Rendering logic (Renderer, Shaders, TextureAtlas)
│   ├── scene/          # Display objects (Node, Sprite, Container, Text)
│   ├── system/         # Managers (FontManager, Engine, Interaction)
│   ├── ui/             # UI Components (PropertyPanel, Toolbar, Stats)
│   ├── math/           # Math & Transform (Rect, Matrix, Transform)
│   └── utils/          # Tools (MemoryProfiler, AtlasManager)
├── main.ts             # Entry point
└── style.css           # Styles
```

---

<a name="简体中文"></a>

## 简体中文

基于原生 WebGL 和 TypeScript 构建的高性能 2D 场景图渲染引擎。专为处理数万个节点的大规模场景设计，实现了类似 PIXI.js 或 Flash 的显示列表架构，并针对渲染和交互进行了深度性能优化。

### ✨ 核心特性

*   **高性能渲染核心**
    *   **原生 WebGL 批处理**：自动合并 Draw Call，支持单次提交上万个 Quad，极大减少 GPU 通信开销。
    *   **混合渲染管线**：清晰分离 **WebGL Pass**（高性能场景）和 **Canvas 2D Pass**（高质量矢量 UI/辅助线）。
    *   **零 GC 渲染循环**：热路径完全移除临时对象分配，利用共享缓冲和直接内存写入，消除 GC 卡顿。
    *   **智能视锥体剔除**：复用 Transform 更新阶段缓存的 **World AABB**，避免重复的矩阵计算。

*   **先进的文本与字体系统**
    *   **多页纹理图集**：自动将离屏 Canvas 绘制的文本合并到 2048x2048 的大纹理中，支持动态扩容。
    *   **多字体管理**：内置多种标准字体（宋体、黑体、Arial等），支持自定义 TTF/OTF 上传及偏好持久化。
    *   **小红书风格高亮**：优化的高亮效果（荧光笔、方框、圆圈、波浪线等），具备精确的墨迹测量。
    *   **稳定基准线对齐**：基于 `alphabetic` 基准线的统一对齐算法，确保不同字体切换时位置不跳动。

*   **智能脏矩形与瓦片渲染**
    *   **区分式重绘策略**：
        *   **全屏重绘**：针对场景平移/缩放，直接全屏刷新，效率最高。
        *   **局部重绘**：针对单个物体移动，实现像素级精确局部更新。
    *   **瓦片化优化**：计划引入空间索引（四叉树/R树）管理超大尺寸画布。

*   **强大的场景图与交互**
    *   层级嵌套支持 (`Node`, `Container`, `Sprite`, `Text`, `TileLayer`)。
    *   **分帧加载 (Time Slicing)**：支持将海量节点创建任务分散到多帧执行，消除首屏卡顿。
    *   **完善交互**：支持框选 (Shift+拖拽)、层级变更 (拖拽放置)、高精度点击检测。

### 🚀 性能优化亮点

1.  **渲染剪枝**：利用缓存的 World AABB 高效剔除视口外物体。
2.  **资源去重**：大量 Sprite 共享纹理；所有 Text 共享全局图集。
3.  **按需渲染**：静止状态下 0 GPU 占用。
4.  **无损变换**：属性更新直接触发失效，无需昂贵的递归计算。

### 🛠️ 安装与运行

```bash
# 1. 克隆
git clone <repository-url>
cd webglEngine

# 2. 安装
npm install

# 3. 启动
npm run dev
```

### 📂 项目结构

```
src/
├── engine/
│   ├── core/           # 渲染逻辑 (Renderer, Shaders, TextureAtlas)
│   ├── scene/          # 显示对象 (Node, Sprite, Container, Text)
│   ├── system/         # 系统管理 (FontManager, Engine, Interaction)
│   ├── ui/             # UI 组件 (属性面板, 工具栏, 性能监控)
│   ├── math/           # 数学与变换 (矩形, 矩阵, 变换)
│   └── utils/          # 工具类 (内存分析, 图集管理)
├── main.ts             # 入口文件
└── style.css           # 基础样式
```
