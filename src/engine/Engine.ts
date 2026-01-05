import { Renderer } from './core/Renderer';
import { Node } from './display/Node';
import { InteractionManager } from './events/InteractionManager';
import { OutlineView } from './ui/OutlineView';
import { AuxiliaryLayer } from './display/AuxiliaryLayer';
import Stats from 'stats.js';
import { PerfMonitor } from './utils/perf_monitor';
import type { Rect } from './core/Rect';

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
    public auxLayer: AuxiliaryLayer;
    public alwaysRender: boolean = false;

    // 渲染请求 ID (防抖动)
    private _rafId: number | null = null;
    
    // 脏矩形管理
    private dirtyRect: Rect | null = null;
    private fullInvalidate: boolean = true; // 默认第一帧全屏渲染

    /**
     * 构造函数
     * @param container 引擎挂载的 DOM 容器
     */
    constructor(container: HTMLElement) {
        // 初始化渲染器
        this.renderer = new Renderer(container);

        // 初始化场景根节点
        this.scene = new Node();
        this.scene.name = "Scene";

        // 绑定场景失效回调，触发渲染
        this.scene.onInvalidate = () => {
            this.invalidateFull();
        };

        // 初始化辅助图层
        this.auxLayer = new AuxiliaryLayer();

        // 初始化交互管理器 (连接渲染器、场景和辅助图层)
        this.interaction = new InteractionManager(this, this.renderer, this.scene, this.auxLayer);

        // 初始化调试用的大纲视图
        this.outline = new OutlineView(this.scene, this.auxLayer, this.renderer);

        // 监听场景结构变化，更新大纲视图
        this.interaction.onStructureChange = () => {
            this.outline.update();
            this.requestRender(); // 结构变化也触发渲染
        };

        // 监听选中/悬停变化，更新大纲视图高亮
        this.interaction.onSelectionChange = () => {
            this.outline.updateHighlight();
            this.requestRender();
        };
        this.interaction.onHoverChange = () => {
            this.outline.updateHighlight();
            this.requestRender();
        };

        // 自动处理窗口大小调整
        const resize = () => {
            this.renderer.resize(container.clientWidth, container.clientHeight);
            this.requestRender(); // 尺寸变化触发渲染
        };
        window.addEventListener('resize', resize);
        // 初始调用一次以设置正确尺寸
        resize();

        // 初始渲染
        this.requestRender();

       let  perfMonitor = new PerfMonitor();
       perfMonitor.start(container);
    }

    /**
     * 请求全屏重绘
     */
    public invalidateFull() {
        this.fullInvalidate = true;
        this.requestRender();
    }

    /**
     * 请求局部重绘
     * @param rect 变脏的区域 (屏幕坐标)
     */
    public invalidateArea(rect: Rect) {
        if (this.fullInvalidate) return; // 已经全屏脏了，无需处理

        // 加上一点 Padding，防止边缘残留
        const padding = 2;
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
        } else {
            this.dirtyRect = paddedRect;
        }
        this.requestRender();
    }

    /**
     * 请求执行一次渲染
     * 使用 requestAnimationFrame 进行防抖，确保每帧只渲染一次
     */
    public requestRender() {
        if (this._rafId === null) {
            this._rafId = requestAnimationFrame(() => {
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
        // 确定渲染区域
        const renderRect = this.fullInvalidate ? undefined : (this.dirtyRect || undefined);

        // 1. 清除 2D Canvas (包括 Text 和 AuxLayer 共用的 Canvas)
        // 必须在绘制 Text 之前清除，否则会覆盖 Text
        this.renderer.clearCanvas2D(renderRect);

        // 2. 渲染 WebGL 场景 (包括 WebGL 内容和 Canvas Text 内容)
        // Renderer.render 内部负责 WebGL 的 clear
        this.renderer.render(this.scene, renderRect);
        
        // 3. 绘制辅助内容 (传入 renderRect 以进行剔除优化)
        this.auxLayer.render(this.renderer.ctx, this.scene, renderRect);
        
        // 4. 恢复 2D 状态 (clip)
        this.renderer.restoreCanvas2D(renderRect);

        // 重置脏状态
        this.fullInvalidate = false;
        this.dirtyRect = null;
    }
}
