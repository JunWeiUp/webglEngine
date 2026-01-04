import { Renderer } from './core/Renderer';
import { Node } from './display/Node';
import { InteractionManager } from './events/InteractionManager';
import { OutlineView } from './ui/OutlineView';
import { AuxiliaryLayer } from './display/AuxiliaryLayer';

export class Engine {
    public renderer: Renderer;
    public scene: Node;
    public interaction: InteractionManager;
    public outline: OutlineView;
    public auxLayer: AuxiliaryLayer;

    constructor(container: HTMLElement) {
        this.renderer = new Renderer(container);
        this.scene = new Node();
        this.scene.name = "Scene";
        
        // Ensure scene has some size for hit testing background?
        // No, interaction manager hits scene logic handles background.
        
        this.auxLayer = new AuxiliaryLayer();
        this.interaction = new InteractionManager(this.renderer, this.scene, this.auxLayer);
        this.outline = new OutlineView(this.scene);

        // Link interaction updates to outline view
        this.interaction.onStructureChange = () => {
            this.outline.update();
        };

        // Auto-resize
        const resize = () => {
            this.renderer.resize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', resize);
        // Initial resize
        resize();

        this.loop();
    }

    private loop() {
        requestAnimationFrame(() => this.loop());
        this.renderer.render(this.scene);
        
        // Render Auxiliary Layer (Overlay)
        this.auxLayer.render(this.renderer.ctx, this.scene);
    }
}
