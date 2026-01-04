import { Renderer } from './core/Renderer';
import { Node } from './display/Node';
import { InteractionManager } from './events/InteractionManager';
import { OutlineView } from './ui/OutlineView';
import { AuxiliaryLayer } from './display/AuxiliaryLayer';

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
    
    // 渲染请求 ID (防抖动)
    private _rafId: number | null = null;

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
            this.requestRender();
        };
        
        // 初始化辅助图层
        this.auxLayer = new AuxiliaryLayer();
        
        // 初始化交互管理器 (连接渲染器、场景和辅助图层)
        this.interaction = new InteractionManager(this.renderer, this.scene, this.auxLayer);
        
        // 初始化调试用的大纲视图
        this.outline = new OutlineView(this.scene, this.auxLayer);

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
    }

    /**
     * 请求执行一次渲染
     * 使用 requestAnimationFrame 进行防抖，确保每帧只渲染一次
     */
    public requestRender() {
        if (this._rafId === null) {
            this._rafId = requestAnimationFrame(() => {
                this.loop();
                this._rafId = null;
            });
        }
    }

    /**
     * 单帧渲染逻辑
     */
    private loop() {
        // 渲染 WebGL 场景
        this.renderer.render(this.scene);
        
        // 渲染辅助图层 (Canvas 2D Overlay)
        this.auxLayer.render(this.renderer.ctx, this.scene);
    }
}
