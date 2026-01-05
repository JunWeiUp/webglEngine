# WebGL High-Performance Scene Engine

这是一个基于原生 WebGL 和 TypeScript 构建的高性能 2D 场景图渲染引擎。它专为处理数万个节点的大规模场景而设计，实现了类似 PIXI.js 或 Flash 的显示列表架构，并针对渲染和交互进行了深度性能优化。

## ✨ 核心特性 (Features)

*   **高性能渲染核心**
    *   **原生 WebGL 批处理 (Batch Rendering)**：自动合并 Draw Call，支持单次提交上万个 Quad。
    *   **视锥体剔除 (Frustum Culling)**：基于 AABB 包围盒，自动剔除屏幕外的对象，极大降低 GPU 负载。
    *   **智能矩阵更新**：引入 Dirty Flag 机制，仅在 Transform 变化时重新计算矩阵，避免无效的数学运算。

*   **强大的场景图 (Scene Graph)**
    *   支持层级嵌套 (`Node`, `Container`)。
    *   内置基础组件：`Sprite` (精灵), `Text` (文本, 基于 Canvas 2D 缓存), `TileLayer` (瓦片地图层)。
    *   **分帧加载 (Time Slicing)**：支持将海量节点的创建任务分散到多帧执行，消除首屏卡顿。

*   **完善的交互系统**
    *   **基本操作**：点击选中、拖拽移动、滚轮缩放、右键/背景拖拽平移。
    *   **高级交互**：
        *   **框选 (Box Selection)**：按住 Shift 拖拽进行多选。
        *   **层级变更 (Reparenting)**：将物体拖拽到另一个容器上即可改变父子关系。
        *   **交互剪枝**：基于包围盒的快速点击检测优化，支持 40,000+ 节点的实时流畅交互。

*   **调试与开发工具**
    *   **大纲视图 (Outline View)**：
        *   实时显示场景层级结构。
        *   **虚拟滚动 (Virtual Scrolling)**：仅渲染可视区域的 DOM 节点，轻松支撑数万条数据。
        *   **DOM 复用**：对象池机制，减少 GC 和 Layout 开销。
        *   **自动聚焦**：在画布选中物体时，大纲树自动展开并滚动到对应条目；大纲树选中物体时，画布自动平移居中。
    *   **辅助图层 (Auxiliary Layer)**：可视化显示包围盒、选中框和拖拽目标。
    *   **性能监控**：集成 Stats.js 监控 FPS。

## 🚀 性能优化亮点

本项目包含多项针对海量数据的优化策略：

1.  **渲染剪枝**：如果父容器完全在屏幕外，渲染器将直接跳过整个子树的遍历。
2.  **交互剪枝**：点击检测 (HitTest) 时，如果点不在父容器的包围盒内，直接跳过对子节点的检测。
3.  **资源去重**：大量 Sprite 共享纹理资源，减少显存占用。
4.  **按需渲染 (On-Demand Rendering)**：仅在画面变化（交互、加载、动画）时触发渲染循环，静止状态下 0 GPU 占用。

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
*   **大纲树操作**：
    *   点击列表项选中物体。
    *   点击箭头折叠/展开层级。
    *   选中物体后，画布会自动跳转使其居中。

## 📂 项目结构

```
src/
├── engine/
│   ├── core/           # 核心渲染逻辑 (Renderer, WebGL Shader)
│   ├── display/        # 显示对象 (Node, Sprite, Container, Text)
│   ├── events/         # 交互管理 (InteractionManager)
│   ├── ui/             # 调试 UI (OutlineView)
│   └── utils/          # 工具类
├── main.ts             # 入口文件 (场景初始化, 测试数据生成)
└── style.css           # 基础样式
```

## 📝 待办 / 计划

*   [x] 引入 Spatial Partitioning (QuadTree) 加速框选查询。
*   [x] 支持纹理图集 (Texture Atlas) 与 `Texture` 类封装。
*   [x] 实现脏矩形渲染 (Dirty Rect Rendering) 以进一步优化局部更新。


