import { Text } from '../scene/Text';
import { Engine } from '../system/Engine';
import { PropertyCommand } from '../history/Command';
import { Node } from '../scene/Node';

export class HighlightPicker {
    private engine: Engine;
    private container: HTMLDivElement | null = null;
    private overlay: HTMLDivElement | null = null;
    private selectedNodes: Set<Node>;
    private onApply: (type: string, color: string) => void;

    private readonly categories = [
        { id: 'mark', label: '荧光高亮' },
        { id: 'rect', label: '矩形框' },
        { id: 'wave', label: '波浪下划线' },
        { id: 'line', label: '直线下划线' },
        { id: 'border', label: '圆角边框' },
        { id: 'dot', label: '点状下划线' },
        { id: 'circle', label: '椭圆背景' }
    ];

    private readonly colors = [
        ['#FF2D55', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6'], // iOS/Trendy colors
        ['#FF9500', '#FF3B30', '#AF52DE', '#FF2D70', '#1D1D1F', '#8E8E93'],
        ['#FFBDC3', '#FFF176', '#A5D6A7', '#B3E5FC', '#E1BEE7', '#FFFFFF']  // Pastel colors
    ];

    constructor(engine: Engine, selectedNodes: Set<Node>, onApply: (type: string, color: string) => void) {
        this.engine = engine;
        this.selectedNodes = selectedNodes;
        this.onApply = onApply;
    }

    public show(x: number, y: number) {
        this.createOverlay();
        this.createContainer(x, y);
    }

    public hide() {
        if (this.overlay) {
            document.body.removeChild(this.overlay);
            this.overlay = null;
        }
        if (this.container) {
            document.body.removeChild(this.container);
            this.container = null;
        }
    }

    private createOverlay() {
        this.overlay = document.createElement('div');
        Object.assign(this.overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            zIndex: '10000',
            backgroundColor: 'transparent'
        });
        this.overlay.addEventListener('click', () => this.hide());
        document.body.appendChild(this.overlay);
    }

    private createContainer(x: number, y: number) {
        this.container = document.createElement('div');
        this.container.id = 'highlight-picker-panel';
        Object.assign(this.container.style, {
            position: 'fixed',
            top: `${y}px`,
            right: '250px', // Offset from property panel
            width: '320px',
            maxHeight: '80vh',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04)',
            zIndex: '10001',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            animation: 'highlight-panel-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        });

        // Add animation keyframes if not exists
        if (!document.getElementById('highlight-picker-styles')) {
            const style = document.createElement('style');
            style.id = 'highlight-picker-styles';
            style.innerHTML = `
                @keyframes highlight-panel-in {
                    from { opacity: 0; transform: scale(0.95) translateX(10px); }
                    to { opacity: 1; transform: scale(1) translateX(0); }
                }
                .highlight-option:hover {
                    background-color: #f5f5f5;
                    border-radius: 8px;
                }
                .highlight-option.active {
                    background-color: #e8f4ff;
                    border-radius: 8px;
                }
                .highlight-scroll-container::-webkit-scrollbar {
                    width: 4px;
                }
                .highlight-scroll-container::-webkit-scrollbar-thumb {
                    background: #ddd;
                    border-radius: 2px;
                }
            `;
            document.head.appendChild(style);
        }

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0'
        });

        const title = document.createElement('span');
        title.innerText = '高亮';
        Object.assign(title.style, {
            fontSize: '16px',
            fontWeight: '600',
            color: '#333'
        });
        header.appendChild(title);

        const closeBtn = document.createElement('div');
        closeBtn.innerHTML = '✕';
        Object.assign(closeBtn.style, {
            cursor: 'pointer',
            color: '#999',
            fontSize: '14px',
            padding: '4px'
        });
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.container.appendChild(header);

        // Scrollable Content
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'highlight-scroll-container';
        Object.assign(scrollContainer.style, {
            flex: '1',
            overflowY: 'auto',
            padding: '12px 0'
        });

        this.categories.forEach(category => {
            const section = this.createSection(category.id, category.label);
            scrollContainer.appendChild(section);
        });

        this.container.appendChild(scrollContainer);

        // Footer
        const footer = document.createElement('div');
        Object.assign(footer.style, {
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #f0f0f0',
            backgroundColor: '#fafafa'
        });

        const colorPickerContainer = document.createElement('div');
        Object.assign(colorPickerContainer.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
        });

        const colorCircle = document.createElement('div');
        Object.assign(colorCircle.style, {
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: '#ff4d4f',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px #eee'
        });
        colorPickerContainer.appendChild(colorCircle);

        const colorLabel = document.createElement('span');
        colorLabel.innerText = '颜色';
        Object.assign(colorLabel.style, {
            fontSize: '14px',
            color: '#666'
        });
        colorPickerContainer.appendChild(colorLabel);

        // Custom color input (hidden)
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.style.display = 'none';
        colorInput.addEventListener('input', (e) => {
            const color = (e.target as HTMLInputElement).value;
            colorCircle.style.backgroundColor = color;
            // Apply current type with new color
            const firstNode = Array.from(this.selectedNodes)[0] as Text;
            const currentType = firstNode.highlightType || 'mark';
            this.onApply(currentType, color);
        });
        colorPickerContainer.addEventListener('click', () => colorInput.click());
        footer.appendChild(colorPickerContainer);
        footer.appendChild(colorInput);

        const clearBtn = document.createElement('button');
        clearBtn.innerText = '清空效果';
        Object.assign(clearBtn.style, {
            padding: '6px 16px',
            borderRadius: '20px',
            border: '1px solid #eee',
            backgroundColor: '#fff',
            fontSize: '13px',
            color: '#333',
            cursor: 'pointer',
            transition: 'all 0.2s'
        });
        clearBtn.addEventListener('mouseenter', () => {
            clearBtn.style.backgroundColor = '#f5f5f5';
        });
        clearBtn.addEventListener('mouseleave', () => {
            clearBtn.style.backgroundColor = '#fff';
        });
        clearBtn.addEventListener('click', () => {
            this.onApply('none', 'transparent');
            this.hide();
        });
        footer.appendChild(clearBtn);

        this.container.appendChild(footer);
        document.body.appendChild(this.container);

        const rect = this.container.getBoundingClientRect();
        
        // Horizontal positioning: try to stay at right: 250px, but don't go off left
        if (window.innerWidth < 600) {
            this.container.style.right = '10px';
            this.container.style.width = 'calc(100vw - 20px)';
        } else {
            this.container.style.right = '250px';
            this.container.style.width = '320px';
        }

        // Vertical positioning: try to stay at y, but don't go off bottom
        if (rect.bottom > window.innerHeight) {
            this.container.style.top = `${window.innerHeight - rect.height - 20}px`;
        }
    }

    private createSection(type: string, label: string): HTMLElement {
        const container = document.createElement('div');
        Object.assign(container.style, {
            padding: '8px 20px'
        });

        const title = document.createElement('div');
        title.innerText = label;
        Object.assign(title.style, {
            fontSize: '11px',
            color: '#999',
            marginBottom: '12px',
            textTransform: 'capitalize'
        });
        container.appendChild(title);

        const grid = document.createElement('div');
        Object.assign(grid.style, {
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '8px'
        });

        this.colors.forEach(row => {
            row.forEach(color => {
                const option = this.createHighlightOption(type, color);
                grid.appendChild(option);
            });
        });

        container.appendChild(grid);
        return container;
    }

    private createHighlightOption(type: string, color: string): HTMLElement {
        const option = document.createElement('div');
        option.className = 'highlight-option';
        Object.assign(option.style, {
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative'
        });

        // Preview "Aa"
        const preview = document.createElement('div');
        preview.innerText = 'Aa';
        Object.assign(preview.style, {
            fontSize: '18px',
            fontWeight: '500',
            color: '#333',
            position: 'relative',
            zIndex: '1',
            lineHeight: '1'
        });

        // Mock highlight effect using CSS
        const effect = document.createElement('div');
        Object.assign(effect.style, {
            position: 'absolute',
            zIndex: '0',
            pointerEvents: 'none'
        });

        this.applyCSSEffect(effect, type, color);
        
        option.appendChild(effect);
        option.appendChild(preview);

        option.addEventListener('click', () => {
            this.onApply(type, color);
            // Don't hide automatically to allow trying different ones
        });

        return option;
    }

    private applyCSSEffect(el: HTMLElement, type: string, color: string) {
        switch (type) {
            case 'mark':
                Object.assign(el.style, {
                    width: '36px',
                    height: '10px',
                    backgroundColor: color,
                    bottom: '8px',
                    opacity: '0.5',
                    borderRadius: '5px',
                    transform: 'rotate(-2deg)'
                });
                break;
            case 'rect':
                Object.assign(el.style, {
                    width: '34px',
                    height: '22px',
                    border: `1.5px solid ${color}`,
                    top: '9px',
                    borderRadius: '2px',
                    boxShadow: `1px 1px 0 ${color}` // Simulate double line/hand-drawn overlap
                });
                break;
            case 'circle':
                Object.assign(el.style, {
                    width: '38px',
                    height: '24px',
                    backgroundColor: color,
                    borderRadius: '12px',
                    top: '8px',
                    opacity: '0.5',
                    transform: 'rotate(1deg)'
                });
                break;
            case 'border':
                Object.assign(el.style, {
                    width: '38px',
                    height: '24px',
                    border: `2px solid ${color}`,
                    borderRadius: '10px',
                    top: '8px'
                });
                break;
            case 'line':
                Object.assign(el.style, {
                    width: '34px',
                    height: '2.5px',
                    backgroundColor: color,
                    bottom: '6px',
                    borderRadius: '1.2px',
                    transform: 'rotate(-0.5deg)'
                });
                break;
            case 'dot':
                Object.assign(el.style, {
                    width: '32px',
                    height: '5px',
                    backgroundImage: `radial-gradient(circle, ${color} 1.5px, transparent 1.5px)`,
                    backgroundSize: '8px 5px',
                    backgroundRepeat: 'repeat-x',
                    bottom: '5px'
                });
                break;
            case 'wave':
                Object.assign(el.style, {
                    width: '34px',
                    height: '8px',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='8'%3E%3Cpath d='M0 4 Q 4 1, 8 4 T 16 4' fill='none' stroke='${encodeURIComponent(color)}' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundSize: '16px 8px',
                    backgroundRepeat: 'repeat-x',
                    bottom: '4px'
                });
                break;
        }
    }
}
