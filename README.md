# WebGL High-Performance Scene Engine

这是一个基于原生 WebGL 和 TypeScript 构建的高性能 2D 场景图渲染引擎。它专为处理数万个节点的大规模场景而设计，实现了类似 PIXI.js 或 Flash 的显示列表架构，并针对渲染和交互进行了深度性能优化。

## ✨ 核心特性 (Features)

*   **高性能渲染核心 (Rendering Core)**
    *   **原生 WebGL 批处理 (Auto Batching)**：自动合并 Draw Call，支持单次提交上万个 Quad，极大减少 GPU 通信开销。
    *   **混合渲染管线 (Hybrid Pipeline)**：清晰分离 **WebGL Pass** (高性能场景) 和 **Canvas 2D Pass** (高质量矢量 UI/辅助线)，兼顾性能与绘图质量。
    *   **零 GC 渲染循环 (Zero-GC Loop)**：热路径完全移除临时对象分配（如 `new Float32Array`），利用共享缓冲和直接内存写入，消除 GC 造成的卡顿。
    *   **智能视锥体剔除 (Smart Culling)**：复用 Transform 更新阶段缓存的 **World AABB**，避免在剔除阶段重复进行昂贵的矩阵乘法计算。

*   **极速文本渲染 (Text Rendering)**
    *   **多页纹理图集 (Multi-Page Texture Atlas)**：自动将离屏 Canvas 绘制的文本合并到 2048x2048 的大纹理中，支持动态扩容，彻底解决纹理切换频繁和图集溢出问题。
    *   **Data URL 零网络加载**：针对 Base64 图片实现纯内存解析，绕过 Fetch API，提升加载稳定性。

*   **智能脏矩形 (Smart Dirty Rect)**
    *   **区分式重绘策略**：
        *   **全屏重绘**：针对场景平移/缩放（根节点变换），直接全屏刷新，避免递归计算数万个节点的包围盒。
        *   **局部重绘**：针对单个实体节点移动，仅计算 O(1) 的局部脏矩形，实现像素级精确更新。
    *   **辅助层独立刷新**：交互 UI（选框、高亮）拥有独立的脏矩形生命周期，互不干扰。

*   **强大的场景图 (Scene Graph)**
    *   支持层级嵌套 (`Node`, `Container`)。
    *   内置基础组件：`Sprite` (精灵), `Text` (文本), `TileLayer` (瓦片地图层)。
    *   **分帧加载 (Time Slicing)**：支持将海量节点的创建任务分散到多帧执行，消除首屏卡顿。

*   **完善的交互系统**
    *   **基本操作**：点击选中、拖拽移动、滚轮缩放、右键/背景拖拽平移。
    *   **高级交互**：
        *   **框选 (Box Selection)**：按住 Shift 拖拽进行多选。
        *   **层级变更 (Reparenting)**：将物体拖拽到另一个容器上即可改变父子关系。
        *   **交互剪枝**：基于包围盒的快速点击检测优化。

*   **调试与开发工具**
    *   **大纲视图 (Outline View)**：实时显示场景层级结构，支持虚拟滚动。
    *   **辅助图层 (Auxiliary Layer)**：可视化显示包围盒、选中框和拖拽目标。
    *   **性能监控**：集成 Stats.js 监控 FPS。

## 🚀 性能优化亮点

本项目包含多项针对海量数据的优化策略：

1.  **渲染剪枝**：利用缓存的 World AABB，在首帧和后续帧均能高效剔除视口外的物体。
2.  **资源去重**：大量 Sprite 共享纹理资源；所有 Text 共享全局图集。
3.  **按需渲染 (On-Demand Rendering)**：仅在画面变化（交互、加载、动画）时触发渲染循环，静止状态下 0 GPU 占用。
4.  **无损变换**：Node 属性 (`x/y/scale/rotation`) 更新时直接触发失效，无需昂贵的 `getBounds` 递归。

## 🛠️ 安装与运行

确保你已安装 Node.js 和 npm。

```bash
# 1. 克隆项目
git clone <repository-url>
cd webglTile2

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

打开浏览器访问 `http://localhost:5173` (或控制台显示的地址)。

## 🎮 操作指南

*   **平移画布**：按住鼠标左键在空白处拖拽。
*   **缩放画布**：滚动鼠标滚轮。
*   **选中物体**：点击物体（变蓝表示选中）。
*   **多选/框选**：按住 **Shift** 键并拖拽鼠标画框。
*   **移动物体**：选中物体后拖拽。
*   **改变层级**：将物体 A 拖拽并放置在物体 B 上，A 将成为 B 的子节点。

## 📂 项目结构

```
src/
├── engine/
│   ├── core/           # 核心渲染逻辑 (Renderer, WebGL Shader, TextureAtlas)
│   ├── display/        # 显示对象 (Node, Sprite, Container, Text)
│   ├── events/         # 交互管理 (InteractionManager)
│   ├── ui/             # 调试 UI (OutlineView)
│   └── utils/          # 工具类 (AtlasManager, TextureManager)
├── main.ts             # 入口文件 (场景初始化, 测试数据生成)
└── style.css           # 基础样式
```

## 📝 待办 / 计划 (Future Optimizations)

*   [ ] **静态批处理 (Static Batching)**: 对于不移动的背景物体（如 TileLayer），预先合并顶点数据，进一步减少 CPU 提交开销。
*   [ ] **空间索引 (Spatial Indexing)**: 引入 QuadTree 或 BVH，将剔除和交互检测复杂度从 O(N) 降低到 O(logN)。
*   [ ] **文本位图化 (SDF Fonts)**: 引入 Signed Distance Field 字体渲染，提供更高性能和无限放大清晰度。
*   [ ] **多纹理排序 (Texture Sorting)**: 优化渲染顺序，尽量让使用相同纹理的物体靠在一起绘制，减少 Flush 次数。
*   [ ] **WebGPU 支持**: 探索 WebGPU 后端以利用 Compute Shader 进行大规模粒子模拟。



待办事项：
1. 类似Figma的工具常需支持超大尺寸画布（如几十甚至上百像素的画布），传统渲染方式在平移/缩放时，需重新计算所有元素的视口坐标，导致交互卡顿。瓦片化渲染通过“瓦片索引映射”，平移时仅需更新可见瓦片列表，缩放时仅需重新渲染受缩放影响的瓦片（而非全量元素），大幅降低交互时的实时计算压力。
- 采用空间索引结构（如四叉树、R树）管理元素与瓦片的映射关系，支持快速查询“某瓦片内的所有元素”和“某元素所属的所有瓦片”；
- 元素编辑时（如移动、缩放），仅更新该元素涉及的瓦片映射（而非全量瓦片），并标记相关瓦片为“脏瓦片”，下一次渲染时仅重新渲染脏瓦片。
解释瓦片化，假设画布大小为1024x1024，每个瓦片大小为256x256，那么画布就被分成了4x4个瓦片。
当用户平移/缩放时，仅需更新可见瓦片列表，而不是全量元素，当瓦片没有加载出来时，会调用加载，直到加载完成触发回调，然后重新渲染该瓦片。
2. 