import { Engine } from '../system/Engine';

export class Toolbar {
    private container: HTMLElement;
    private engine: Engine;
    private buttons: Map<string, HTMLElement> = new Map();

    constructor(engine: Engine) {
        this.engine = engine;
        this.container = document.createElement('div');
        this.init();
    }

    private init() {
        Object.assign(this.container.style, {
            position: 'absolute',
            bottom: '24px',
            left: 'calc(250px + (100% - 250px) / 2)',
            transform: 'translateX(-50%)',
            height: '40px',
            backgroundColor: 'var(--figma-bg-panel)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 4px',
            gap: '2px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px var(--figma-border)',
            zIndex: '1000',
            userSelect: 'none',
            transition: 'left 0.3s ease, background-color 0.15s'
        });
        document.body.appendChild(this.container);

        // Selection Tool (Hand/Pointer - default)
        this.createButton('Move (V)', `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 2l8 4.5-3.5 1 2.5 4.5-1.5 1-2.5-4.5-3 3V2z" fill="currentColor"/></svg>`, null);

        // Separator
        const separator = document.createElement('div');
        separator.style.width = '1px';
        separator.style.height = '16px';
        separator.style.backgroundColor = 'var(--figma-border)';
        separator.style.margin = '0 2px';
        this.container.appendChild(separator);

        // Creation Tools
        this.createButton('Frame (F)', `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 1.5v11M10 1.5v11M1.5 4h11M1.5 10h11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`, 'frame');
        this.createButton('Image (I)', `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="1.5" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/><circle cx="4.5" cy="4.5" r="1.2" fill="currentColor"/><path d="M1.5 11L5 7L8.5 11M7.5 10L10 7.5L12.5 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`, 'image');
        this.createButton('Text (T)', `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.5V2.5H12V3.5M7 2.5V11.5M4.5 11.5H9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`, 'text');

        // Listen for selection changes to adjust position
        const originalOnSelectionChange = this.engine.interaction.onSelectionChange;
        this.engine.interaction.onSelectionChange = () => {
            if (originalOnSelectionChange) originalOnSelectionChange();
            this.updatePosition();
            this.engine.propertyPanel.updateNodes(this.engine.auxLayer.selectedNodes);
        };
    }

    private createButton(label: string, icon: string, type: 'frame' | 'image' | 'text' | null) {
        const btn = document.createElement('div');
        if (type) btn.draggable = true;

        Object.assign(btn.style, {
            height: '32px',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            color: 'var(--figma-text-secondary)',
            fontSize: '11px',
            fontWeight: '500',
            cursor: 'pointer',
            borderRadius: '4px',
            transition: 'background-color 0.15s, color 0.15s',
            whiteSpace: 'nowrap'
        });

        btn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;">${icon}</span> <span>${label}</span>`;
        btn.title = label;

        const updateStyle = () => {
            const isActive = (this.engine.activeTool === type);
            if (isActive) {
                btn.style.backgroundColor = 'var(--figma-blue)';
                btn.style.color = '#ffffff';
            } else {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = 'var(--figma-text-secondary)';
            }
        };

        btn.addEventListener('mouseenter', () => {
            if (this.engine.activeTool !== type) {
                btn.style.backgroundColor = 'var(--figma-hover-bg)';
                btn.style.color = 'var(--figma-text-primary)';
            }
        });

        btn.addEventListener('mouseleave', () => {
            updateStyle();
        });

        btn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (this.engine.activeTool === type) {
                this.engine.activeTool = null;
            } else {
                this.engine.activeTool = type;
            }
            this.updateAllButtons();
        });

        if (type) {
            btn.addEventListener('dragstart', (e) => {
                const img = new Image();
                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                e.dataTransfer?.setDragImage(img, 0, 0);
                this.engine.interaction.startDragCreation(type, [e.clientX, e.clientY]);
            });

            btn.addEventListener('drag', (e) => {
                if (e.clientX === 0 && e.clientY === 0) return;
                this.engine.interaction.updateDragCreation([e.clientX, e.clientY]);
            });

            btn.addEventListener('dragend', (e) => {
                this.engine.interaction.endDragCreation([e.clientX, e.clientY]);
            });
        }

        (btn as any).updateStyle = updateStyle;
        this.container.appendChild(btn);
        this.buttons.set(label, btn);
        updateStyle();
    }

    public updateAllButtons() {
        this.buttons.forEach((btn) => {
            (btn as any).updateStyle();
        });
    }

    public updatePosition() {
        if (this.engine.auxLayer.selectedNodes.size > 0) {
            this.container.style.left = 'calc(250px + (100% - 250px - 240px) / 2)';
        } else {
            this.container.style.left = 'calc(250px + (100% - 250px) / 2)';
        }
    }
}
