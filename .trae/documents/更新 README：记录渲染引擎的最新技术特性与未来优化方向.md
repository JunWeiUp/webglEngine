# 更新 README 文档计划

根据我们最近对渲染引擎进行的一系列深度优化，需要更新 README.md 以准确反映当前的技术栈和性能特性，并列出未来的优化方向。

## 1. 技术特性更新 (Technical Stack)

我们需要在文档中强调最近加入的关键技术：

*   **渲染优化 (Rendering Optimization)**
    *   **混合渲染管线 (Hybrid Rendering Pipeline)**: 清晰分离 WebGL Pass (场景) 和 Canvas 2D Pass (UI/Aux)，确保高性能场景渲染与高质量矢量绘制的完美结合。
    *   **零 GC 渲染循环 (Zero-GC Rendering Loop)**: 彻底移除了热路径上的对象分配（如 `new Float32Array`），利用共享缓冲和直接内存操作，消除频繁 GC 导致的微卡顿。
    *   **智能脏矩形 (Smart Dirty Rect)**: 区分全屏重绘（场景平移/缩放）与局部重绘（单个物体移动），避免昂贵的递归包围盒计算，实现 O(1) 的变换更新开销。
    *   **缓存加速剔除 (Cached AABB Culling)**: 复用 Transform 更新阶段计算的世界包围盒，避免在剔除阶段重复进行矩阵乘法。

*   **文本渲染 (Text Rendering)**
    *   **多页纹理图集 (Multi-Page Texture Atlas)**: 自动将离屏 Canvas 绘制的文本合并到大纹理中，极大减少纹理切换和 Draw Call。支持动态扩容，彻底解决图集溢出导致的死循环问题。
    *   **Data URL 优化**: 针对 Base64 图片实现零网络请求加载，提升加载稳定性。

*   **交互优化 (Interaction)**
    *   **辅助层独立 (Auxiliary Layer)**: 交互 UI（选框、高亮）独立于 WebGL 场景，使用脏矩形技术高效局部刷新，不干扰主场景渲染。

## 2. 待优化项 (Future Optimizations)

列出当前已知但尚未实现或可进一步提升的点：

*   **静态批处理 (Static Batching)**: 对于不移动的背景物体（如 TileLayer），预先合并顶点数据，进一步减少 CPU 提交开销。
*   **空间索引 (Spatial Indexing)**: 虽然实现了 AABB 剔除，但目前仍是线性遍历场景树。引入 QuadTree 或 BVH 可以将剔除复杂度降低到 O(logN)。
*   **文本位图化 (Bitmap Fonts)**: 目前使用的是 Canvas 绘制到纹理 (Dynamic Atlas)。对于固定字符集，使用预生成的 SDF (Signed Distance Field) 或 Bitmap Font 可以获得更高性能和清晰度。
*   **多纹理批处理 (Multi-Texture Batching)**: 目前虽然支持多纹理槽，但在纹理数量超过槽位限制时会触发 Flush。可以优化排序策略 (Texture Sorting) 来最小化切换。
*   **WebGPU 支持**: 探索 WebGPU 以利用 Compute Shader 进行更高效的粒子系统或大规模剔除。

## 3. 执行计划

更新 `README.md` 文件，替换旧的描述，增加新的技术细节章节，并刷新 To-Do 列表。
