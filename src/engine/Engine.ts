import { Renderer } from './core/Renderer';
import { Node } from './display/Node';
import { InteractionManager } from './events/InteractionManager';
import { OutlineView } from './ui/OutlineView';
import { PropertyPanel } from './ui/PropertyPanel';
import { Toolbar } from './ui/Toolbar';
import { AuxiliaryLayer } from './display/AuxiliaryLayer';
import type { Rect } from './core/Rect';
import { AtlasManager } from './utils/AtlasManager';
import { MatrixSpatialIndex } from './core/MatrixSpatialIndex';

/**
 * 引擎入口类
 * 
 * 负责初始化和管理核心模块：
 * - Renderer: WebGL 渲染器
 * - Scene: 场景图根节点
 * - InteractionManager: 交互管理
 * - AuxiliaryLayer: 辅助图层 (UI/调试)
 * - OutlineView: 大纲视图 (调试 UI)
 * 
 * 同时也负责主循环 (Loop)。
 */
export class Engine {
    public renderer: Renderer;
    public scene: Node;
    public interaction: InteractionManager;
    public outline: OutlineView;
    public propertyPanel: PropertyPanel;
    public toolbar: Toolbar;
    public auxLayer: AuxiliaryLayer;
    public alwaysRender: boolean = false;
    public activeTool: 'frame' | 'image' | 'text' | null = null;
    private container: HTMLElement;

    // 渲染请求 ID (防抖动)
    private _rafId: number | null = null;

    // 脏矩形管理
    private dirtyRect: Rect | null = null;
    private _dirtyCount: number = 0; // 脏矩形计数，用于性能阈值控制
    private fullInvalidate: boolean = true; // 默认第一帧全屏渲染
    private sceneDirty: boolean = true; // WebGL 场景是否变脏
    public lastInteractionTime: number = 0; // 最近一次交互发生的时间戳

    private _resizeHandler: () => void;

    /**
     * 构造函数
     * @param container 引擎挂载的 DOM 容器
     */
    constructor(container: HTMLElement) {
        this.container = container;
        // 初始化渲染器
        this.renderer = new Renderer(container, this);

        // 初始化场景根节点
        this.scene = new Node();
        this.scene.name = "Scene";
        this.scene.childSpatialIndex = new MatrixSpatialIndex();

        // 绑定场景失效回调，触发渲染
        this.scene.onInvalidate = (rect?: Rect) => {
            if (rect) {
                this.invalidateArea(rect);
            } else {
                this.invalidateFull();
            }
        };

        // 初始化辅助图层
        this.auxLayer = new AuxiliaryLayer();

        // 初始化交互管理器 (连接渲染器、场景和辅助图层)
        this.interaction = new InteractionManager(this, this.renderer, this.scene, this.auxLayer);

        // 初始化调试用的大纲视图
        this.outline = new OutlineView(this.scene, this.auxLayer, this.renderer, this.interaction);

        // 初始化属性面板
        this.propertyPanel = new PropertyPanel();
        this.propertyPanel.onPropertyChange = () => {
            this.requestRender();
        };

        // 初始化工具栏
        this.toolbar = new Toolbar(this);

        // 监听场景结构变化，更新大纲视图
        this.interaction.onStructureChange = () => {
            this.outline.update();
            this.requestRender(); // 结构变化也触发渲染
        };

        // 监听选中/悬停变化，更新大纲视图高亮
        this.interaction.onSelectionChange = () => {
            this.outline.updateHighlight();
            this.propertyPanel.updateNodes(this.auxLayer.selectedNodes);
            this.toolbar.updatePosition();
            
            // 更新容器布局：选中节点时显示属性栏，容器向左收缩
            if (this.auxLayer.selectedNodes.size > 0) {
                this.container.style.right = '240px';
            } else {
                this.container.style.right = '0';
            }
            // 触发布局变化后的 resize
            const rect = this.container.getBoundingClientRect();
            this.renderer.resize(rect.width, rect.height);
            
            this.requestRender();
        };
        this.interaction.onTransformChange = () => {
            this.propertyPanel.updateNodes(this.auxLayer.selectedNodes);
            // 变换时也确保布局正确
            if (this.auxLayer.selectedNodes.size > 0) {
                this.container.style.right = '240px';
            }
            const rect = this.container.getBoundingClientRect();
            this.renderer.resize(rect.width, rect.height);
            this.requestRender();
        };
        this.interaction.onHoverChange = () => {
            this.outline.updateHighlight();
            this.requestRender();
        };

        // 自动处理窗口大小调整
        this._resizeHandler = () => {
            const rect = container.getBoundingClientRect();
            this.renderer.resize(rect.width, rect.height);
            this.requestRender(); // 尺寸变化触发渲染
        };
        window.addEventListener('resize', this._resizeHandler);
        // 初始调用一次以设置正确尺寸
        this._resizeHandler();

        // 初始渲染
        this.requestRender();
    }

    /**
     * 彻底销毁引擎，释放所有资源
     */
    public dispose() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        window.removeEventListener('resize', this._resizeHandler);

        // 销毁场景 (会触发所有节点的 dispose)
        this.scene.dispose();

        // 销毁全局管理器
        AtlasManager.getInstance().dispose();

        // 注意：TextureManager 是静态类，目前通过场景节点的 dispose 间接清理了它引用的纹理
        // 如果需要彻底清理 TextureManager 缓存，可以添加一个清理方法

        // 销毁交互管理器
        this.interaction.dispose();
    }

    /**
     * 记录交互发生的时间戳
     */
    public recordInteractionTime() {
        this.lastInteractionTime = performance.now();
    }

    /**
     * 请求全屏重绘
     */
    public invalidateFull() {
        this.fullInvalidate = true;
        this.requestRender();
    }

    /**
     * 更新脏矩形区域
     */
    private updateDirtyRect(rect: Rect) {
        if (this.fullInvalidate) return; // 已经全屏脏了，无需处理

        // 性能优化：如果变脏的区域过多，直接切换为全屏刷新
        // 合并海量脏矩形的 CPU 开销可能超过直接重绘全屏的 GPU 开销
        this._dirtyCount++;
        if (this._dirtyCount > 50) {
            this.invalidateFull();
            return;
        }

        // 加上一点 Padding，防止边缘残留 (抗锯齿/纹理过滤溢出/阴影)
        // 增加到 5 像素以应对更极端的情况
        const padding = 5;
        const paddedRect = {
            x: Math.floor(rect.x - padding),
            y: Math.floor(rect.y - padding),
            width: Math.ceil(rect.width + padding * 2),
            height: Math.ceil(rect.height + padding * 2)
        };

        if (this.dirtyRect) {
            // 合并矩形 (Union)
            const minX = Math.min(this.dirtyRect.x, paddedRect.x);
            const minY = Math.min(this.dirtyRect.y, paddedRect.y);
            const maxX = Math.max(this.dirtyRect.x + this.dirtyRect.width, paddedRect.x + paddedRect.width);
            const maxY = Math.max(this.dirtyRect.y + this.dirtyRect.height, paddedRect.y + paddedRect.height);

            this.dirtyRect.x = minX;
            this.dirtyRect.y = minY;
            this.dirtyRect.width = maxX - minX;
            this.dirtyRect.height = maxY - minY;

            // 额外优化：如果合并后的矩形已经覆盖了大部分屏幕，直接全屏
            const canvas = this.renderer.ctx.canvas;
            if (this.dirtyRect.width > canvas.width * 0.8 && this.dirtyRect.height > canvas.height * 0.8) {
                this.invalidateFull();
            }
        } else {
            this.dirtyRect = paddedRect;
        }
    }

    /**
     * 请求局部重绘
     * @param rect 变脏的区域 (屏幕坐标)
     */
    public invalidateArea(rect: Rect) {
        this.updateDirtyRect(rect);
        this.sceneDirty = true;
        this.requestRender();
    }

    /**
     * 请求局部重绘 (仅辅助层变化，不重绘 WebGL)
     * @param rect 变脏的区域 (屏幕坐标)
     */
    public invalidateAuxArea(rect: Rect) {
        this.updateDirtyRect(rect);
        this.requestRender();
    }

    /**
     * 请求执行一次渲染
     * 使用 requestAnimationFrame 进行防抖，确保每帧只渲染一次
     */
    public requestRender() {
        // console.trace()

        // // 3. 计算从交互到渲染完成的全链路耗时
        // if (this.lastInteractionTime > 0) {
        //     this.renderer.stats.times.interactionToRender = performance.now() - this.lastInteractionTime;
        //     // 处理完成后重置，避免在没有交互的帧中重复计算（如果是 alwaysRender 模式）
        //     this.lastInteractionTime = 0;
        // }
        if (this._rafId === null) {
            this._rafId = requestAnimationFrame(() => {
                // console.log("engine requestAnimationFrame")

                this.loop();
                if (this.alwaysRender) {
                    this._rafId = null;
                    this.invalidateFull(); // 强制模式下每帧全屏刷新
                } else {
                    this._rafId = null;
                }
            });
        }
    }

    /**
     * 单帧渲染逻辑
     */
    private loop() {
        const l0 = performance.now();

        // 确定渲染区域
        const drawWebGL = this.sceneDirty || this.fullInvalidate;
        const drawAux = this.dirtyRect !== null || this.fullInvalidate;

        if (!drawWebGL && !drawAux) {
            // 如果什么都不需要画，直接退出
            this._rafId = null;
            return;
        }

        const renderRect = this.fullInvalidate ? undefined : (this.dirtyRect || undefined);

        // 记录逻辑处理耗时
        this.renderer.stats.times.logic = performance.now() - l0;

        // 1. WebGL Pass
        if (drawWebGL) {
            this.renderer.render(this.scene, renderRect);
        }

        // 2. 绘制辅助内容 (Canvas 2D)
        if (drawAux || drawWebGL) {
            this.auxLayer.render(this.renderer.ctx, this.scene, this.renderer, renderRect);
        }

        // 重置脏状态
        this.fullInvalidate = false;
        this.sceneDirty = false;
        this.dirtyRect = null;
        this._dirtyCount = 0;
    }
}
