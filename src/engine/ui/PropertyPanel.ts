import { Node } from '../scene/Node';
import { PropertyCommand } from '../history/Command';
import type { Engine } from '../system/Engine';
import { HighlightPicker } from './HighlightPicker';
import { Text } from '../scene/Text';
import { FontManager } from '../system/FontManager';

/**
 * 属性面板 (Property Panel)
 * 
 * 模仿 Figma 的属性栏，用于显示和编辑选中节点的属性。
 */
export class PropertyPanel {
    private engine: Engine;
    private container: HTMLElement;

    private selectedNodes: Set<Node> = new Set();

    // UI 元素引用
    private fields: { [key: string]: HTMLInputElement } = {};

    public onPropertyChange: (() => void) | null = null;

    constructor(engine: Engine) {
        this.engine = engine;
        this.container = document.createElement('div');
        this.initStyles();
        this.initLayout();
        document.body.appendChild(this.container);

        // 初始隐藏
        this.container.style.display = 'none';
    }

    private initStyles() {
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '0',
            right: '0',
            width: 'var(--figma-panel-width)',
            height: '100vh',
            backgroundColor: 'var(--figma-bg-panel)',
            color: 'var(--figma-text-primary)',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 'var(--figma-font-size-small)',
            zIndex: '1001',
            boxSizing: 'border-box',
            borderLeft: '1px solid var(--figma-border)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            userSelect: 'none'
        });
    }

    private createAlignmentBar(): HTMLElement {
        const bar = document.createElement('div');
        Object.assign(bar.style, {
            display: 'flex',
            padding: '12px 16px',
            gap: '2px',
            borderBottom: '1px solid var(--figma-border)',
            justifyContent: 'space-between',
            alignItems: 'center'
        });

        const tools = [
            { id: 'left', icon: '<path d="M1.5 1.5v9M4.5 3.5h5v5h-5v-5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Align Left' },
            { id: 'center-h', icon: '<path d="M6 1.5v9M2.5 3.5h7v5h-7v-5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Align Horizontal Centers' },
            { id: 'right', icon: '<path d="M10.5 1.5v9M2.5 3.5h5v5h-5v-5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Align Right' },
            { id: 'top', icon: '<path d="M1.5 1.5h9M3.5 4.5v5h5v-5h-5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Align Top' },
            { id: 'center-v', icon: '<path d="M1.5 6h9M3.5 2.5v7h5v-7h-5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Align Vertical Centers' },
            { id: 'bottom', icon: '<path d="M1.5 10.5h9M3.5 2.5v5h5v-5h-5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Align Bottom' },
            { id: 'dist-h', icon: '<path d="M2 1.5v9M10 1.5v9M4.5 4h3v4h-3V4z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Distribute Horizontal Spacing' },
            { id: 'dist-v', icon: '<path d="M1.5 2h9M1.5 10h9M4 4.5h4v3H4v-3z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', label: 'Distribute Vertical Spacing' }
        ];

        tools.forEach(tool => {
            const btn = document.createElement('div');
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">${tool.icon}</svg>`;
            Object.assign(btn.style, {
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: '2px',
                color: 'var(--figma-text-secondary)',
                transition: 'background-color 0.15s, color 0.15s'
            });
            btn.title = tool.label;

            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--figma-hover-bg)';
                btn.style.color = 'var(--figma-text-primary)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = 'var(--figma-text-secondary)';
            });
            btn.addEventListener('mousedown', () => {
                btn.style.backgroundColor = 'var(--figma-active-bg)';
            });
            btn.addEventListener('mouseup', () => {
                btn.style.backgroundColor = 'var(--figma-hover-bg)';
            });
            btn.addEventListener('click', () => this.alignNodes(tool.id as any));

            bar.appendChild(btn);
        });

        return bar;
    }

    private alignNodes(type: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'dist-h' | 'dist-v') {
        if (this.selectedNodes.size === 0) return;
        const nodes = Array.from(this.selectedNodes).filter(n => !n.locked);
        if (nodes.length === 0) return;

        // Record initial states for X and Y
        const startXStates = new Map<Node, number>();
        const startYStates = new Map<Node, number>();
        nodes.forEach(node => {
            startXStates.set(node, node.x);
            startYStates.set(node, node.y);
        });

        if (nodes.length === 1) {
            // Align to parent if only one node selected
            const node = nodes[0];
            const parent = node.parent;
            if (!parent) return;

            const pw = parent.width;
            const ph = parent.height;

            switch (type) {
                case 'left': node.setPosition(0, node.y); break;
                case 'center-h': node.setPosition((pw - node.width) / 2, node.y); break;
                case 'right': node.setPosition(pw - node.width, node.y); break;
                case 'top': node.setPosition(node.x, 0); break;
                case 'center-v': node.setPosition(node.x, (ph - node.height) / 2); break;
                case 'bottom': node.setPosition(node.x, ph - node.height); break;
            }
        } else {
            if (type === 'dist-h' || type === 'dist-v') {
                if (nodes.length < 3) return; // Need at least 3 nodes to distribute
                
                if (type === 'dist-h') {
                    const sorted = nodes.sort((a, b) => a.x - b.x);
                    const minX = sorted[0].x;
                    const maxX = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
                    const totalWidth = nodes.reduce((sum, n) => sum + n.width, 0);
                    const spacing = (maxX - minX - totalWidth) / (nodes.length - 1);
                    
                    let currentX = minX;
                    sorted.forEach((node) => {
                        node.setPosition(currentX, node.y);
                        currentX += node.width + spacing;
                    });
                } else {
                    const sorted = nodes.sort((a, b) => a.y - b.y);
                    const minY = sorted[0].y;
                    const maxY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
                    const totalHeight = nodes.reduce((sum, n) => sum + n.height, 0);
                    const spacing = (maxY - minY - totalHeight) / (nodes.length - 1);
                    
                    let currentY = minY;
                    sorted.forEach((node) => {
                        node.setPosition(node.x, currentY);
                        currentY += node.height + spacing;
                    });
                }
            } else {
                // Multi-select alignment: find the bounding box of all selected nodes
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                nodes.forEach(n => {
                    minX = Math.min(minX, n.x);
                    minY = Math.min(minY, n.y);
                    maxX = Math.max(maxX, n.x + n.width);
                    maxY = Math.max(maxY, n.y + n.height);
                });

                nodes.forEach(node => {
                    switch (type) {
                        case 'left': node.setPosition(minX, node.y); break;
                        case 'center-h': node.setPosition(minX + (maxX - minX) / 2 - node.width / 2, node.y); break;
                        case 'right': node.setPosition(maxX - node.width, node.y); break;
                        case 'top': node.setPosition(node.x, minY); break;
                        case 'center-v': node.setPosition(node.x, minY + (maxY - minY) / 2 - node.height / 2); break;
                        case 'bottom': node.setPosition(node.x, maxY - node.height); break;
                    }
                });
            }
        }

        // Record end states and push to history
        const endXStates = new Map<Node, number>();
        const endYStates = new Map<Node, number>();
        let xChanged = false;
        let yChanged = false;

        nodes.forEach(node => {
            endXStates.set(node, node.x);
            endYStates.set(node, node.y);
            if (node.x !== startXStates.get(node)) xChanged = true;
            if (node.y !== startYStates.get(node)) yChanged = true;
        });

        if (xChanged) {
            const command = new PropertyCommand(nodes, 'x', startXStates, endXStates, (node, val) => node.setPosition(val, node.y));
            this.engine.history.push(command);
        }
        if (yChanged) {
            const command = new PropertyCommand(nodes, 'y', startYStates, endYStates, (node, val) => node.setPosition(node.x, val));
            this.engine.history.push(command);
        }

        if (this.onPropertyChange) this.onPropertyChange();
        this.syncFromNodes();
    }

    private addConstraintsUI(parent: HTMLElement) {
        const grid = (parent as any).grid;
        if (!grid) return;

        // Visual Box for Constraints
        const visualBox = document.createElement('div');
        visualBox.className = 'constraints-visual-box';
        Object.assign(visualBox.style, {
            gridColumn: '1 / 2',
            width: '60px',
            height: '60px',
            border: '1px solid var(--figma-border)',
            borderRadius: '2px',
            position: 'relative',
            backgroundColor: 'rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });

        // Child representation in visual box
        const innerRect = document.createElement('div');
        Object.assign(innerRect.style, {
            width: '24px',
            height: '24px',
            border: '1px solid var(--figma-text-tertiary)',
            borderRadius: '2px',
            position: 'relative',
            zIndex: '2'
        });
        visualBox.appendChild(innerRect);

        // Constraint lines
        const createLine = (id: string, style: Partial<CSSStyleDeclaration>) => {
            const line = document.createElement('div');
            line.dataset.lineId = id;
            Object.assign(line.style, {
                position: 'absolute',
                backgroundColor: 'var(--figma-blue)',
                display: 'none',
                zIndex: '1',
                ...style
            });
            return line;
        };

        const lineConfigs = [
            { id: 'h_min', style: { left: '0', top: '50%', width: '18px', height: '1px', transform: 'translateY(-50%)' } },
            { id: 'h_max', style: { right: '0', top: '50%', width: '18px', height: '1px', transform: 'translateY(-50%)' } },
            { id: 'v_min', style: { top: '0', left: '50%', width: '1px', height: '18px', transform: 'translateX(-50%)' } },
            { id: 'v_max', style: { bottom: '0', left: '50%', width: '1px', height: '18px', transform: 'translateX(-50%)' } }
        ];

        lineConfigs.forEach(config => visualBox.appendChild(createLine(config.id, config.style)));
        grid.appendChild(visualBox);

        // Controls container
        const controls = document.createElement('div');
        Object.assign(controls.style, {
            gridColumn: '2 / 3',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        });

        const hSelect = this.createConstraintSelect('Horizontal', 'constraints.horizontal', ['min', 'max', 'center', 'scale', 'both']);
        const vSelect = this.createConstraintSelect('Vertical', 'constraints.vertical', ['min', 'max', 'center', 'scale', 'both']);

        controls.appendChild(hSelect);
        controls.appendChild(vSelect);
        grid.appendChild(controls);
    }

    private createConstraintSelect(label: string, key: string, options: string[]): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '4px';

        const labelEl = document.createElement('span');
        labelEl.innerText = label;
        labelEl.style.color = 'var(--figma-text-tertiary)';
        labelEl.style.fontSize = '10px';
        labelEl.style.fontWeight = '500';
        container.appendChild(labelEl);

        const selectWrapper = document.createElement('div');
        selectWrapper.style.position = 'relative';
        selectWrapper.style.width = '100%';
        container.appendChild(selectWrapper);

        const select = document.createElement('select');
        Object.assign(select.style, {
            width: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '4px 20px 4px 4px',
            outline: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            appearance: 'none',
            transition: 'background-color 0.15s, border-color 0.15s'
        });

        const arrow = document.createElement('div');
        arrow.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        Object.assign(arrow.style, {
            position: 'absolute',
            right: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--figma-text-tertiary)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        selectWrapper.appendChild(arrow);

        select.addEventListener('mouseenter', () => {
            if (document.activeElement !== select) {
                select.style.backgroundColor = 'var(--figma-hover-bg)';
                arrow.style.color = 'var(--figma-text-secondary)';
            }
        });
        select.addEventListener('mouseleave', () => {
            if (document.activeElement !== select) {
                select.style.backgroundColor = 'transparent';
                arrow.style.color = 'var(--figma-text-tertiary)';
            }
        });
        select.addEventListener('focus', () => {
            select.style.backgroundColor = 'var(--figma-active-bg)';
            select.style.border = '1px solid var(--figma-blue)';
            arrow.style.color = 'var(--figma-blue)';
        });
        select.addEventListener('blur', () => {
            select.style.backgroundColor = 'transparent';
            select.style.border = '1px solid transparent';
            arrow.style.color = 'var(--figma-text-tertiary)';
        });

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = opt === 'min' ? (label === 'Horizontal' ? 'Left' : 'Top') : 
                             opt === 'max' ? (label === 'Horizontal' ? 'Right' : 'Bottom') : 
                             opt.charAt(0).toUpperCase() + opt.slice(1);
            option.style.backgroundColor = 'var(--figma-bg-panel)';
            option.style.color = 'var(--figma-text-primary)';
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            this.applyChange(key, select.value, 'text');
            this.syncFromNodes();
        });

        selectWrapper.appendChild(select);
        this.fields[key] = select as any;

        return container;
    }

    private refreshConstraintVisuals(box: HTMLElement, h: string, v: string) {
        const lines: { [key: string]: HTMLElement } = {};
        box.querySelectorAll('div[data-line-id]').forEach((line: any) => {
            lines[line.dataset.lineId] = line;
            line.style.display = 'none';
        });

        if (Object.keys(lines).length === 0) return;

        // Horizontal
        if (h === 'min' || h === 'both') lines.h_min.style.display = 'block';
        if (h === 'max' || h === 'both') lines.h_max.style.display = 'block';
        if (h === 'center') {
            lines.h_min.style.display = 'block';
            lines.h_min.style.width = '12px';
            lines.h_max.style.display = 'block';
            lines.h_max.style.width = '12px';
        } else {
            lines.h_min.style.width = '18px';
            lines.h_max.style.width = '18px';
        }

        // Vertical
        if (v === 'min' || v === 'both') lines.v_min.style.display = 'block';
        if (v === 'max' || v === 'both') lines.v_max.style.display = 'block';
        if (v === 'center') {
            lines.v_min.style.display = 'block';
            lines.v_min.style.height = '12px';
            lines.v_max.style.display = 'block';
            lines.v_max.style.height = '12px';
        } else {
            lines.v_min.style.height = '18px';
            lines.v_max.style.height = '18px';
        }
    }

    private initLayout() {
        const title = this.createSectionTitle('PROPERTIES');
        this.container.appendChild(title);

        // Alignment Section
        const alignmentSection = this.createAlignmentBar();
        this.container.appendChild(alignmentSection);

        // Selection Section
        const nameSection = this.createSection('Selection');
        const selectionGrid = (nameSection as any).grid;
        
        // Name field
        const nameFieldContainer = this.addPropertyField(nameSection, 'Name', 'name', 'text');
        if (nameFieldContainer) {
            nameFieldContainer.style.gridColumn = '1 / -1';
        }

        // Lock and Visibility toggles
        const statesContainer = document.createElement('div');
        Object.assign(statesContainer.style, {
            gridColumn: '1 / -1',
            display: 'flex',
            gap: '8px',
            marginTop: '4px'
        });

        this.addToggleButton(statesContainer, 'Locked', 'locked', 
            '<path d="M3.5 5V4C3.5 2.61929 4.61929 1.5 6 1.5C7.38071 1.5 8.5 2.61929 8.5 4V5M3.5 5H2.5V9.5H9.5V5H8.5M3.5 5H8.5V7.5H3.5V5Z" fill="currentColor"/>',
            '<path d="M3.5 5V4C3.5 2.61929 4.61929 1.5 6 1.5C7.38071 1.5 8.5 2.61929 8.5 4V5M3.5 5H2.5V9.5H9.5V5H8.5M3.5 5H8.5V7.5H3.5V5Z" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>'
        );
        
        this.addToggleButton(statesContainer, 'Visible', 'visible',
            '<path d="M1.5 6C1.5 6 3.5 2.5 6 2.5C8.5 2.5 10.5 6 10.5 6C10.5 6 8.5 9.5 6 9.5C3.5 9.5 1.5 6 1.5 6Z" stroke="currentColor" stroke-width="1"/><circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1"/>',
            '<path d="M10 2L2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M1.5 6C1.5 6 3.5 2.5 6 2.5C8.5 2.5 10.5 6 10.5 6C10.5 6 8.5 9.5 6 9.5C3.5 9.5 1.5 6 1.5 6Z" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/><circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>'
        );

        selectionGrid.appendChild(statesContainer);
        
        // Text Content Section (hidden by default)
        const textContentContainer = document.createElement('div');
        textContentContainer.id = 'text-content-container';
        textContentContainer.style.gridColumn = '1 / -1';
        textContentContainer.style.display = 'none';
        this.addPropertyField(textContentContainer, 'Content', 'textContent', 'text');
        (nameSection as any).grid.appendChild(textContentContainer);
        
        this.container.appendChild(nameSection);

        // Transform Section
        const transformSection = this.createSection('Layout');
        
        // Use compact fields for X, Y, W, H
        this.addCompactFields(transformSection, [
            { label: 'X', key: 'x' },
            { label: 'Y', key: 'y' },
            { label: 'W', key: 'width' },
            { label: 'H', key: 'height' }
        ]);
        
        // Rotation and Radius in one row
        this.addCompactFields(transformSection, [
            { label: 'R', key: 'rotation' },
            { label: 'Radius', key: 'borderRadius' }
        ]);
        
        // Scale in one row
        this.addCompactFields(transformSection, [
            { label: 'SX', key: 'scaleX' },
            { label: 'SY', key: 'scaleY' }
        ]);
        this.container.appendChild(transformSection);

        // Text Section (hidden by default)
        const textSection = this.createSection('Text');
        textSection.id = 'text-section';
        textSection.style.display = 'none';
        
        // Content
        const contentField = this.addPropertyField(textSection, 'Content', 'textContent', 'text');
        if (contentField) contentField.style.gridColumn = '1 / -1';
        
        // Font Family & Size
        this.addFontFamilyField(textSection, 'Font', 'fontFamily');
        this.addPropertyFieldWithSlider(textSection, 'Size', 'fontSize', 8, 200);
        
        // Weight & Style
        this.addSelectField(textSection, 'Weight', 'fontWeight', ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']);
        this.addSelectField(textSection, 'Style', 'fontStyle', ['normal', 'italic', 'oblique']);
        
        // Fill & Letter Spacing
        this.addPropertyField(textSection, 'Fill', 'textFillStyle', 'color');
        this.addPropertyField(textSection, 'Space', 'letterSpacing', 'number');

        // Alignment
        const alignHeader = this.createSubHeader('Alignment');
        (textSection as any).grid.appendChild(alignHeader);
        this.addSelectField(textSection, 'H Align', 'textAlign', ['left', 'center', 'right']);
        this.addSelectField(textSection, 'V Align', 'textBaseline', ['top', 'middle', 'bottom']);
        
        // Stroke
        const textStrokeHeader = this.createSubHeader('Text Stroke');
        (textSection as any).grid.appendChild(textStrokeHeader);
        this.addPropertyField(textSection, 'Color', 'textStrokeStyle', 'color');
        this.addPropertyField(textSection, 'Width', 'textStrokeWidth', 'number');

        // Highlight
        const highlightHeader = this.createSubHeader('Highlight');
        (textSection as any).grid.appendChild(highlightHeader);
        this.addHighlightPickerField(textSection, 'Style', 'highlight');

        this.container.appendChild(textSection);

        // Constraints Section
        const constraintsSection = this.createSection('Constraints');
        constraintsSection.id = 'constraints-section';
        this.addConstraintsUI(constraintsSection);
        this.container.appendChild(constraintsSection);

        // Appearance Section
        const appearanceSection = this.createSection('Appearance');
        this.addPropertyField(appearanceSection, 'Fill', 'backgroundColor', 'color');
        
        // Image Section (hidden by default)
        const imageSectionContainer = document.createElement('div');
        imageSectionContainer.id = 'image-section-container';
        imageSectionContainer.style.gridColumn = '1 / -1';
        imageSectionContainer.style.display = 'none';
        
        // Add image URL field with an upload button
        this.addImagePropertyField(imageSectionContainer, 'Image', 'textureUrl');
        
        (appearanceSection as any).grid.appendChild(imageSectionContainer);
        
        // Radius field with expand button
        this.addPropertyFieldWithAction(appearanceSection, 'Radius', 'borderRadius', 'number', 'corner-radius');
        
        // Individual corners (hidden by default)
        const individualRadiusContainer = document.createElement('div');
        individualRadiusContainer.id = 'individual-radius-container';
        individualRadiusContainer.style.gridColumn = '1 / -1';
        individualRadiusContainer.style.display = 'none';
        this.addCompactFieldsToContainer(individualRadiusContainer, [
            { label: 'TL', key: 'borderRadiusTL' },
            { label: 'TR', key: 'borderRadiusTR' },
            { label: 'BR', key: 'borderRadiusBR' },
            { label: 'BL', key: 'borderRadiusBL' }
        ]);
        (appearanceSection as any).grid.appendChild(individualRadiusContainer);
        
        this.container.appendChild(appearanceSection);

        // Border Section
        const borderSection = this.createSection('Stroke');
        this.addPropertyField(borderSection, 'Color', 'borderColor', 'color');
        this.addPropertyField(borderSection, 'Weight', 'borderWidth', 'number');
        this.addSelectField(borderSection, 'Align', 'strokeType', ['inner', 'center', 'outer']);
        this.addSelectField(borderSection, 'Style', 'strokeStyle', ['solid', 'dashed']);
        
        // Dash settings (hidden by default)
        const dashContainer = document.createElement('div');
        dashContainer.id = 'dash-settings-container';
        dashContainer.style.gridColumn = '1 / -1';
        dashContainer.style.display = 'none';
        this.addCompactFieldsToContainer(dashContainer, [
            { label: 'Dash', key: 'strokeDash' },
            { label: 'Gap', key: 'strokeGap' }
        ]);
        (borderSection as any).grid.appendChild(dashContainer);
        
        this.container.appendChild(borderSection);

        // Effects Section
        const effectsSection = this.createSection('Effects');
        
        // Layer Blur Group
        const layerBlurHeader = this.createSubHeader('Layer Blur');
        (effectsSection as any).grid.appendChild(layerBlurHeader);
        this.addPropertyField(effectsSection, 'Value', 'layerBlur', 'number');

        // Background Blur Group
        const bgBlurHeader = this.createSubHeader('Background Blur');
        (effectsSection as any).grid.appendChild(bgBlurHeader);
        this.addPropertyField(effectsSection, 'Value', 'backgroundBlur', 'number');
        
        // Outer Shadow Group
        const outerShadowHeader = this.createSubHeader('Drop Shadow');
        (effectsSection as any).grid.appendChild(outerShadowHeader);
        this.addPropertyField(effectsSection, 'Color', 'outerShadowColor', 'color');
        this.addCompactFields(effectsSection, [
            { label: 'X', key: 'outerShadowX' },
            { label: 'Y', key: 'outerShadowY' },
            { label: 'Blur', key: 'outerShadowBlur' },
            { label: 'Spread', key: 'outerShadowSpread' }
        ]);

        // Inner Shadow Group
        const innerShadowHeader = this.createSubHeader('Inner Shadow');
        (effectsSection as any).grid.appendChild(innerShadowHeader);
        this.addPropertyField(effectsSection, 'Color', 'innerShadowColor', 'color');
        this.addCompactFields(effectsSection, [
            { label: 'X', key: 'innerShadowX' },
            { label: 'Y', key: 'innerShadowY' },
            { label: 'Blur', key: 'innerShadowBlur' },
            { label: 'Spread', key: 'innerShadowSpread' }
        ]);
        
        this.container.appendChild(effectsSection);
    }

    private addImagePropertyField(parent: HTMLElement, label: string, key: string): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '6px';
        container.style.marginTop = '4px';
        container.style.padding = '8px';
        container.style.backgroundColor = 'var(--figma-hover-bg)';
        container.style.borderRadius = '4px';
        container.style.border = '1px solid var(--figma-border-light)';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        
        const labelEl = document.createElement('span');
        labelEl.innerText = label;
        labelEl.style.color = 'var(--figma-text-secondary)';
        labelEl.style.fontSize = '10px';
        labelEl.style.fontWeight = '600';
        header.appendChild(labelEl);

        const uploadBtn = document.createElement('div');
        uploadBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 9.5V10.5C2.5 11.6046 3.39543 12.5 4.5 12.5H9.5C10.6046 12.5 11.5 11.6046 11.5 10.5V9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M7 1.5V9.5M7 1.5L4 4.5M7 1.5L10 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        uploadBtn.style.color = 'var(--figma-text-tertiary)';
        uploadBtn.style.cursor = 'pointer';
        uploadBtn.style.display = 'flex';
        uploadBtn.style.alignItems = 'center';
        uploadBtn.style.justifyContent = 'center';
        uploadBtn.style.width = '20px';
        uploadBtn.style.height = '20px';
        uploadBtn.style.borderRadius = '2px';
        uploadBtn.style.transition = 'color 0.15s, background-color 0.15s';
        uploadBtn.title = 'Upload Image';
        uploadBtn.addEventListener('mouseenter', () => {
            uploadBtn.style.color = 'var(--figma-text-primary)';
            uploadBtn.style.backgroundColor = 'var(--figma-active-bg)';
        });
        uploadBtn.addEventListener('mouseleave', () => {
            uploadBtn.style.color = 'var(--figma-text-tertiary)';
            uploadBtn.style.backgroundColor = 'transparent';
        });
        uploadBtn.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = (e: any) => {
                const file = e.target.files[0];
                if (file) {
                    const url = URL.createObjectURL(file);
                    this.applyChange(key, url, 'text');
                    this.syncFromNodes();
                }
            };
            fileInput.click();
        });
        header.appendChild(uploadBtn);
        container.appendChild(header);

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Image URL...';
        Object.assign(input.style, {
            width: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '5px 8px',
            outline: 'none',
            borderRadius: '2px',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s, background-color 0.15s'
        });

        input.addEventListener('focus', () => {
            input.style.border = '1px solid var(--figma-blue)';
            input.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        });

        input.addEventListener('blur', () => {
            input.style.border = '1px solid transparent';
            input.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
            this.applyChange(key, input.value, 'text');
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });

        container.appendChild(input);
        this.fields[key] = input;

        parent.appendChild(container);
        return container;
    }

    private addPropertyFieldWithAction(parent: HTMLElement, label: string, key: string, type: 'number', action: string): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.height = '28px';
        container.style.position = 'relative';

        const labelEl = document.createElement('div');
        Object.assign(labelEl.style, {
            width: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-tertiary)',
            fontSize: '10px',
            fontWeight: '500',
            flexShrink: '0',
            cursor: 'ew-resize',
            userSelect: 'none',
            transition: 'color 0.15s'
        });

        // Use SVG icons for common properties
        const icons: { [key: string]: string } = {
            'Radius': '<path d="M2 2v2a4 4 0 0 0 4 4h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 2v8M2 10h8" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>'
        };

        if (icons[label]) {
            labelEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">${icons[label]}</svg>`;
            labelEl.title = label;
        } else {
            labelEl.innerText = label;
        }
        container.appendChild(labelEl);

        const inputWrapper = document.createElement('div');
        inputWrapper.style.flex = '1';
        inputWrapper.style.display = 'flex';
        inputWrapper.style.alignItems = 'center';
        inputWrapper.style.position = 'relative';
        inputWrapper.style.height = '100%';
        container.appendChild(inputWrapper);

        const input = document.createElement('input');
        input.type = 'number';
        Object.assign(input.style, {
            flex: '1',
            width: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '4px 4px',
            outline: 'none',
            borderRadius: '2px', // Figma standard
            boxSizing: 'border-box',
            transition: 'background-color 0.15s, border-color 0.15s'
        });

        input.addEventListener('mouseenter', () => {
            if (document.activeElement !== input) {
                input.style.backgroundColor = 'var(--figma-hover-bg)';
                labelEl.style.color = 'var(--figma-text-secondary)';
            }
        });
        input.addEventListener('mouseleave', () => {
            if (document.activeElement !== input) {
                input.style.backgroundColor = 'transparent';
                labelEl.style.color = 'var(--figma-text-tertiary)';
            }
        });

        input.addEventListener('focus', () => {
            input.style.backgroundColor = 'var(--figma-active-bg)';
            input.style.border = '1px solid var(--figma-blue)';
            labelEl.style.color = 'var(--figma-blue)';
        });

        input.addEventListener('blur', () => {
            input.style.backgroundColor = 'transparent';
            input.style.border = '1px solid transparent';
            labelEl.style.color = 'var(--figma-text-tertiary)';
            this.applyChange(key, input.value, type);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });

        inputWrapper.appendChild(input);
        this.fields[key] = input;

        // Action Button (Square with 4 corners icon)
        if (action === 'corner-radius') {
            const btn = document.createElement('div');
            btn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 4C2 2.89543 2.89543 2 4 2H8C9.10457 2 10 2.89543 10 4V8C10 9.10457 9.10457 10 8 10H4C2.89543 10 2 9.10457 2 8V4Z" stroke="currentColor" stroke-width="1"/>
                    <path d="M4 2V4M2 4H4" stroke="currentColor" stroke-width="1"/>
                    <path d="M8 2V4M10 4H8" stroke="currentColor" stroke-width="1"/>
                    <path d="M8 10V8M10 8H8" stroke="currentColor" stroke-width="1"/>
                    <path d="M4 10V8M2 8H4" stroke="currentColor" stroke-width="1"/>
                </svg>
            `;
            btn.style.width = '24px';
            btn.style.height = '24px';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.cursor = 'pointer';
            btn.style.borderRadius = '2px';
            btn.style.color = 'var(--figma-text-tertiary)';
            btn.style.transition = 'background-color 0.15s, color 0.15s';
            btn.style.position = 'absolute';
            btn.style.right = '2px';
            
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--figma-hover-bg)';
                btn.style.color = 'var(--figma-text-primary)';
            });
            btn.addEventListener('mouseleave', () => {
                const individual = document.getElementById('individual-radius-container');
                const isActive = individual && individual.style.display !== 'none';
                btn.style.backgroundColor = isActive ? 'rgba(24, 160, 251, 0.15)' : 'transparent';
                btn.style.color = isActive ? 'var(--figma-blue)' : 'var(--figma-text-tertiary)';
            });
            
            btn.addEventListener('click', () => {
                const individual = document.getElementById('individual-radius-container');
                if (individual) {
                    const isHidden = individual.style.display === 'none';
                    individual.style.display = isHidden ? 'grid' : 'none';
                    btn.style.backgroundColor = isHidden ? 'rgba(24, 160, 251, 0.15)' : 'transparent';
                    btn.style.color = isHidden ? 'var(--figma-blue)' : 'var(--figma-text-tertiary)';
                }
            });
            inputWrapper.appendChild(btn);
            
            // Adjust input padding to make room for the button
            input.style.paddingRight = '26px';
        }

        // Label Dragging for numbers (Enhanced with Shift/Alt support)
        let isDragging = false;
        let startX = 0;
        let startVal = 0;
        let dragStartStates = new Map<Node, any>();

        labelEl.addEventListener('mousedown', (e) => {
            const nodesToApply = Array.from(this.selectedNodes).filter(n => !n.locked);
            if (nodesToApply.length === 0) return;

            isDragging = true;
            startX = e.clientX;
            startVal = parseFloat(input.value) || 0;
            document.body.style.cursor = 'ew-resize';
            
            // 记录初始状态
            dragStartStates.clear();
            nodesToApply.forEach(node => {
                dragStartStates.set(node, this.getNodePropertyValue(node, key));
            });

            const onMouseMove = (moveEvent: MouseEvent) => {
                if (!isDragging) return;
                let delta = moveEvent.clientX - startX;
                
                // Support Shift for 10x, Alt for 0.1x
                if (moveEvent.shiftKey) delta *= 10;
                if (moveEvent.altKey) delta *= 0.1;

                const newVal = startVal + delta;
                input.value = (moveEvent.altKey ? newVal.toFixed(1) : Math.round(newVal).toString());
                this.applyChange(key, input.value, 'number', false); // false 表示不记录历史
            };

            const onMouseUp = () => {
                if (isDragging) {
                    // 记录最终状态并存入历史
                    const dragEndStates = new Map<Node, any>();
                    nodesToApply.forEach(node => {
                        dragEndStates.set(node, this.getNodePropertyValue(node, key));
                    });

                    // 检查是否真的发生了变化
                    let changed = false;
                    for (const [node, oldVal] of dragStartStates) {
                        if (oldVal !== dragEndStates.get(node)) {
                            changed = true;
                            break;
                        }
                    }

                    if (changed) {
                        const command = new PropertyCommand(
                            nodesToApply,
                            key,
                            dragStartStates,
                            dragEndStates,
                            (node, val) => this.setNodePropertyValue(node, key, val)
                        );
                        this.engine.history.push(command);
                    }
                }

                isDragging = false;
                document.body.style.cursor = 'default';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        const grid = (parent as any).grid;
        if (grid) grid.appendChild(container);
        else parent.appendChild(container);

        return container;
    }

    private addCompactFieldsToContainer(container: HTMLElement, configs: { label: string, key: string }[]) {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(2, 1fr)'; // 2 columns for X/Y and W/H
        container.style.gap = '4px 8px'; // Tighter gap for compact fields
        container.style.marginTop = '4px';
        container.style.padding = '4px 0';

        configs.forEach(config => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.height = '24px';
            item.style.position = 'relative';

            const label = document.createElement('div');
            Object.assign(label.style, {
                width: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--figma-text-tertiary)',
                fontSize: '10px',
                fontWeight: '500',
                flexShrink: '0',
                cursor: 'ew-resize',
                userSelect: 'none',
                transition: 'color 0.15s'
            });

            // Icons for compact fields
            const icons: { [key: string]: string } = {
                'X': '<path d="M2 5h8M4 3l-2 2 2 2M8 3l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'Y': '<path d="M5 2v8M3 4l2-2 2 2M3 8l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'W': '<path d="M1 5h10M3 3L1 5l2 2M9 3l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'H': '<path d="M5 1v10M3 3l2-2 2 2M3 9l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'R': '<path d="M10 6a4 4 0 1 1-4-4v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 2l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'Radius': '<path d="M2 2v2a4 4 0 0 0 4 4h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 2v8M2 10h8" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>',
                'SX': '<path d="M1 6h10M3 4L1 6l2 2M9 4l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 1v10" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>',
                'SY': '<path d="M6 1v10M4 3l2-2 2 2M4 9l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 6h10" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>',
                'TL': '<path d="M2 10V4C2 2.89543 2.89543 2 4 2H10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'TR': '<path d="M2 2H8C9.10457 2 10 2.89543 10 4V10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'BR': '<path d="M2 10H8C9.10457 10 10 9.10457 10 8V2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
                'BL': '<path d="M10 10H4C2.89543 10 2 9.10457 2 8V2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
            };

            if (icons[config.label]) {
                label.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none">${icons[config.label]}</svg>`;
                label.title = config.label;
            } else {
                label.innerText = config.label;
            }
            item.appendChild(label);

            const input = document.createElement('input');
            input.type = 'number';
            Object.assign(input.style, {
                flex: '1',
                width: '100%',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                color: 'var(--figma-text-primary)',
                fontSize: '11px',
                padding: '2px 4px',
                outline: 'none',
                borderRadius: '2px', // Figma standard
                boxSizing: 'border-box',
                transition: 'background-color 0.15s, border-color 0.15s'
            });

            input.addEventListener('mouseenter', () => {
                if (document.activeElement !== input) {
                    input.style.backgroundColor = 'var(--figma-hover-bg)';
                    label.style.color = 'var(--figma-text-secondary)';
                }
            });
            input.addEventListener('mouseleave', () => {
                if (document.activeElement !== input) {
                    input.style.backgroundColor = 'transparent';
                    label.style.color = 'var(--figma-text-tertiary)';
                }
            });

            input.addEventListener('focus', () => {
                input.style.backgroundColor = 'var(--figma-active-bg)';
                input.style.border = '1px solid var(--figma-blue)';
                label.style.color = 'var(--figma-blue)';
            });

            input.addEventListener('blur', () => {
                input.style.backgroundColor = 'transparent';
                input.style.border = '1px solid transparent';
                label.style.color = 'var(--figma-text-tertiary)';
                this.applyChange(config.key, input.value, 'number');
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
            });

            // Label Dragging for compact fields (Enhanced with Shift/Alt support)
            let isDragging = false;
            let startX = 0;
            let startVal = 0;
            let dragStartStates = new Map<Node, any>();

            label.addEventListener('mousedown', (e) => {
                if (input.disabled) return;
                const nodesToApply = Array.from(this.selectedNodes).filter(n => !n.locked);
                if (nodesToApply.length === 0) return;

                isDragging = true;
                startX = e.clientX;
                startVal = parseFloat(input.value) || 0;
                document.body.style.cursor = 'ew-resize';
                
                // 记录初始状态
                dragStartStates.clear();
                nodesToApply.forEach(node => {
                    dragStartStates.set(node, this.getNodePropertyValue(node, config.key));
                });

                const onMouseMove = (moveEvent: MouseEvent) => {
                    if (!isDragging) return;
                    let delta = moveEvent.clientX - startX;
                    
                    // Support Shift for 10x, Alt for 0.1x
                    if (moveEvent.shiftKey) delta *= 10;
                    if (moveEvent.altKey) delta *= 0.1;

                    const newVal = startVal + delta;
                    input.value = (moveEvent.altKey ? newVal.toFixed(1) : Math.round(newVal).toString());
                    this.applyChange(config.key, input.value, 'number', false); // false 表示不记录历史
                };

                const onMouseUp = () => {
                    if (isDragging) {
                        // 记录最终状态并存入历史
                        const dragEndStates = new Map<Node, any>();
                        nodesToApply.forEach(node => {
                            dragEndStates.set(node, this.getNodePropertyValue(node, config.key));
                        });

                        // 检查是否真的发生了变化
                        let changed = false;
                        for (const [node, oldVal] of dragStartStates) {
                            if (oldVal !== dragEndStates.get(node)) {
                                changed = true;
                                break;
                            }
                        }

                        if (changed) {
                            const command = new PropertyCommand(
                                nodesToApply,
                                config.key,
                                dragStartStates,
                                dragEndStates,
                                (node, val) => this.setNodePropertyValue(node, config.key, val)
                            );
                            this.engine.history.push(command);
                        }
                    }

                    isDragging = false;
                    document.body.style.cursor = 'default';
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            item.appendChild(input);
            this.fields[config.key] = input;
            container.appendChild(item);
        });
    }

    private addCompactFields(parent: HTMLElement, configs: { label: string, key: string }[]) {
        const grid = (parent as any).grid;
        if (!grid) return;

        const container = document.createElement('div');
        container.style.gridColumn = '1 / -1';
        this.addCompactFieldsToContainer(container, configs);
        grid.appendChild(container);
    }

    private createSubHeader(text: string): HTMLElement {
        const subHeader = document.createElement('div');
        subHeader.innerText = text;
        Object.assign(subHeader.style, {
            gridColumn: '1 / -1',
            color: 'var(--figma-text-tertiary)',
            fontSize: '10px',
            marginTop: '12px',
            marginBottom: '4px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.02em'
        });
        return subHeader;
    }

    private createSection(title: string): HTMLElement {
        const section = document.createElement('div');
        section.style.borderBottom = '1px solid var(--figma-border)';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.padding = '8px 12px 8px 4px';
        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';
        header.style.height = '32px';
        header.style.boxSizing = 'border-box';
        header.style.transition = 'background-color 0.1s';
        
        const arrow = document.createElement('div');
        arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        Object.assign(arrow.style, {
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-secondary)',
            transition: 'transform 0.2s'
        });
        arrow.style.transform = 'rotate(90deg)'; // Default expanded
        header.appendChild(arrow);

        const titleEl = document.createElement('span');
        titleEl.innerText = title;
        titleEl.style.fontWeight = '600';
        titleEl.style.color = 'var(--figma-text-primary)';
        titleEl.style.fontSize = '11px';
        titleEl.style.flex = '1';
        header.appendChild(titleEl);

        const addBtn = document.createElement('div');
        addBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1V9M1 5H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        addBtn.style.color = 'var(--figma-text-tertiary)';
        addBtn.style.cursor = 'pointer';
        addBtn.style.display = 'flex';
        addBtn.style.alignItems = 'center';
        addBtn.style.justifyContent = 'center';
        addBtn.style.width = '24px';
        addBtn.style.height = '24px';
        addBtn.style.borderRadius = '2px';
        addBtn.style.transition = 'color 0.15s, background-color 0.15s';
        
        addBtn.addEventListener('mouseenter', (e) => {
            e.stopPropagation();
            addBtn.style.color = 'var(--figma-text-primary)';
            addBtn.style.backgroundColor = 'var(--figma-hover-bg)';
        });
        addBtn.addEventListener('mouseleave', () => {
            addBtn.style.color = 'var(--figma-text-tertiary)';
            addBtn.style.backgroundColor = 'transparent';
        });
        header.appendChild(addBtn);

        section.appendChild(header);

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '8px 12px';
        grid.style.padding = '4px 16px 12px 16px';
        section.appendChild(grid);

        header.addEventListener('mouseenter', () => {
            header.style.backgroundColor = 'var(--figma-hover-bg)';
        });
        header.addEventListener('mouseleave', () => {
            header.style.backgroundColor = 'transparent';
        });

        header.addEventListener('click', () => {
            const isCollapsed = grid.style.display === 'none';
            grid.style.display = isCollapsed ? 'grid' : 'none';
            arrow.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
        });

        (section as any).grid = grid;
        return section;
    }

    private createSectionTitle(titleStr: string): HTMLElement {
        const title = document.createElement('div');
        title.innerText = titleStr;
        Object.assign(title.style, {
            padding: '12px 16px',
            fontSize: '11px',
            fontWeight: '600',
            letterSpacing: '0.01em',
            color: 'var(--figma-text-primary)',
            borderBottom: '1px solid var(--figma-border)',
            textTransform: 'uppercase'
        });
        return title;
    }

    private addToggleButton(parent: HTMLElement, label: string, key: string, activeIcon: string, inactiveIcon: string) {
        const btn = document.createElement('div');
        Object.assign(btn.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '2px',
            border: '1px solid var(--figma-border)',
            cursor: 'pointer',
            fontSize: '11px',
            color: 'var(--figma-text-secondary)',
            transition: 'background-color 0.1s, color 0.1s, border-color 0.1s'
        });

        const iconEl = document.createElement('div');
        iconEl.style.display = 'flex';
        iconEl.style.alignItems = 'center';
        iconEl.style.justifyContent = 'center';
        iconEl.style.width = '12px';
        iconEl.style.height = '12px';
        btn.appendChild(iconEl);

        const labelEl = document.createElement('span');
        labelEl.innerText = label;
        btn.appendChild(labelEl);

        const updateUI = (active: boolean) => {
            iconEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">${active ? activeIcon : inactiveIcon}</svg>`;
            if (active) {
                btn.style.backgroundColor = 'var(--figma-active-bg)';
                btn.style.color = 'var(--figma-text-primary)';
                btn.style.borderColor = 'var(--figma-blue)';
            } else {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = 'var(--figma-text-secondary)';
                btn.style.borderColor = 'var(--figma-border)';
            }
        };

        btn.onclick = () => {
            const currentVal = this.getNodePropertyValue(Array.from(this.selectedNodes)[0], key);
            const newVal = !currentVal;
            this.applyChange(key, newVal, 'boolean'); 
            updateUI(newVal);
            this.syncFromNodes();
        };

        btn.addEventListener('mouseenter', () => {
            if (btn.style.backgroundColor === 'transparent') {
                btn.style.backgroundColor = 'var(--figma-hover-bg)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            const currentVal = this.getNodePropertyValue(Array.from(this.selectedNodes)[0], key);
            updateUI(currentVal);
        });

        parent.appendChild(btn);
        (this.fields as any)[key] = btn; // Store the button itself to update it in syncFromNodes
        (btn as any).updateUI = updateUI;
    }

    private addHighlightPickerField(parent: HTMLElement, label: string, key: string): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.height = '28px';
        container.style.position = 'relative';

        const labelEl = document.createElement('div');
        Object.assign(labelEl.style, {
            width: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-tertiary)',
            fontSize: '10px',
            fontWeight: '500',
            flexShrink: '0',
            cursor: 'default',
            userSelect: 'none'
        });
        labelEl.innerText = label;
        container.appendChild(labelEl);

        const trigger = document.createElement('div');
        Object.assign(trigger.style, {
            flex: '1',
            height: '22px',
            backgroundColor: 'var(--figma-hover-bg)',
            borderRadius: '2px',
            border: '1px solid transparent',
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px',
            cursor: 'pointer',
            marginLeft: '4px',
            transition: 'background-color 0.15s, border-color 0.15s'
        });

        const previewText = document.createElement('span');
        previewText.innerText = 'None';
        Object.assign(previewText.style, {
            fontSize: '11px',
            color: 'var(--figma-text-primary)',
            flex: '1'
        });
        trigger.appendChild(previewText);

        const arrow = document.createElement('div');
        arrow.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 4l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        arrow.style.color = 'var(--figma-text-tertiary)';
        trigger.appendChild(arrow);

        trigger.addEventListener('mouseenter', () => {
            trigger.style.backgroundColor = 'var(--figma-active-bg)';
            trigger.style.borderColor = 'var(--figma-border-light)';
        });
        trigger.addEventListener('mouseleave', () => {
            trigger.style.backgroundColor = 'var(--figma-hover-bg)';
            trigger.style.borderColor = 'transparent';
        });

        trigger.addEventListener('click', (e) => {
            const rect = trigger.getBoundingClientRect();
            const picker = new HighlightPicker(
                this.engine,
                this.selectedNodes,
                (type, color) => {
                    this.applyChange('highlightType', type, 'text');
                    this.applyChange('highlightColor', color, 'text');
                    this.syncFromNodes();
                }
            );
            picker.show(rect.left, rect.top);
        });

        container.appendChild(trigger);
        
        // Use a hidden input for syncing if needed, or handle in syncFromNodes
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        this.fields[key] = hiddenInput as any;
        (hiddenInput as any).updateUI = (nodes: Node[]) => {
            const firstNode = nodes[0] as Text;
            const type = firstNode.highlightType || 'none';
            const color = firstNode.highlightColor || 'transparent';
            
            if (type === 'none') {
                previewText.innerText = 'None';
            } else {
                previewText.innerText = `${type.charAt(0).toUpperCase() + type.slice(1)}`;
                previewText.style.color = color;
            }
        };

        const grid = (parent as any).grid;
        if (grid) grid.appendChild(container);
        else parent.appendChild(container);

        return container;
    }

    private addFontFamilyField(parent: HTMLElement, label: string, key: string): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.height = '28px';
        container.style.position = 'relative';

        const labelEl = document.createElement('div');
        Object.assign(labelEl.style, {
            width: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-tertiary)',
            fontSize: '10px',
            fontWeight: '500',
            flexShrink: '0',
            userSelect: 'none'
        });
        labelEl.innerText = label;
        container.appendChild(labelEl);

        const selectWrapper = document.createElement('div');
        selectWrapper.style.flex = '1';
        selectWrapper.style.display = 'flex';
        selectWrapper.style.alignItems = 'center';
        selectWrapper.style.position = 'relative';
        selectWrapper.style.height = '22px';
        selectWrapper.style.marginLeft = '4px';
        container.appendChild(selectWrapper);

        const select = document.createElement('select');
        Object.assign(select.style, {
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '0 20px 0 6px',
            outline: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            appearance: 'none',
            transition: 'background-color 0.15s, border-color 0.15s'
        });

        const arrow = document.createElement('div');
        arrow.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        Object.assign(arrow.style, {
            position: 'absolute',
            right: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--figma-text-tertiary)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        selectWrapper.appendChild(arrow);

        // Hover effects
        select.addEventListener('mouseenter', () => {
            if (document.activeElement !== select) {
                select.style.backgroundColor = 'var(--figma-hover-bg)';
                labelEl.style.color = 'var(--figma-text-secondary)';
                arrow.style.color = 'var(--figma-text-secondary)';
            }
        });
        select.addEventListener('mouseleave', () => {
            if (document.activeElement !== select) {
                select.style.backgroundColor = 'transparent';
                labelEl.style.color = 'var(--figma-text-tertiary)';
                arrow.style.color = 'var(--figma-text-tertiary)';
            }
        });

        const fontManager = FontManager.getInstance();
        
        const updateOptions = () => {
            select.innerHTML = '';
            
            // Standard fonts
            const standardGroup = document.createElement('optgroup');
            standardGroup.label = 'Standard Fonts';
            fontManager.standardFonts.forEach((font: any) => {
                const option = document.createElement('option');
                option.value = font.family;
                option.innerText = font.name;
                option.style.fontFamily = font.family;
                standardGroup.appendChild(option);
            });
            select.appendChild(standardGroup);

            // Custom fonts
            const customFonts = fontManager.getCustomFonts();
            if (customFonts.length > 0) {
                const customGroup = document.createElement('optgroup');
                customGroup.label = 'Custom Fonts';
                customFonts.forEach((font: any) => {
                    const option = document.createElement('option');
                    option.value = font.family;
                    option.innerText = font.name;
                    option.style.fontFamily = font.family;
                    customGroup.appendChild(option);
                });
                select.appendChild(customGroup);
            }
        };

        updateOptions();
        select.value = fontManager.getPreference();

        select.addEventListener('change', () => {
            const family = select.value;
            this.applyChange(key, family, 'text');
            fontManager.savePreference(family);
        });

        selectWrapper.appendChild(select);
        this.fields[key] = select as any;

        // Upload Button
        const uploadBtn = document.createElement('div');
        uploadBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 9.5V10.5C2.5 11.6046 3.39543 12.5 4.5 12.5H9.5C10.6046 12.5 11.5 11.6046 11.5 10.5V9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M7 1.5V9.5M7 1.5L4 4.5M7 1.5L10 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        Object.assign(uploadBtn.style, {
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            borderRadius: '2px',
            color: 'var(--figma-text-tertiary)',
            transition: 'background-color 0.15s, color 0.15s',
            marginLeft: '4px'
        });
        uploadBtn.title = 'Upload Custom Font (TTF, OTF, WOFF)';

        uploadBtn.addEventListener('mouseenter', () => {
            uploadBtn.style.backgroundColor = 'var(--figma-hover-bg)';
            uploadBtn.style.color = 'var(--figma-text-primary)';
        });
        uploadBtn.addEventListener('mouseleave', () => {
            uploadBtn.style.backgroundColor = 'transparent';
            uploadBtn.style.color = 'var(--figma-text-tertiary)';
        });

        uploadBtn.addEventListener('click', () => {
            const name = prompt('请输入字体名称:');
            if (!name) return;

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.ttf,.otf,.woff,.woff2';
            fileInput.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        await fontManager.addCustomFont(name, file);
                        updateOptions();
                        // Automatically select the newly uploaded font
                        const customFonts = fontManager.getCustomFonts();
                        const newFont = customFonts.find((f: any) => f.name === name);
                        if (newFont) {
                            select.value = newFont.family;
                            this.applyChange(key, newFont.family, 'text');
                            fontManager.savePreference(newFont.family);
                        }
                    } catch (error: any) {
                        alert(error.message);
                    }
                }
            };
            fileInput.click();
        });
        container.appendChild(uploadBtn);

        const grid = (parent as any).grid;
        if (grid) grid.appendChild(container);
        else parent.appendChild(container);

        return container;
    }

    private addSelectField(parent: HTMLElement, label: string, key: string, options: string[]): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.height = '28px';
        container.style.position = 'relative';

        const labelEl = document.createElement('div');
        Object.assign(labelEl.style, {
            width: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-tertiary)',
            fontSize: '10px',
            fontWeight: '500',
            flexShrink: '0',
            userSelect: 'none',
            transition: 'color 0.15s'
        });

        const icons: { [key: string]: string } = {
            'Align': '<path d="M2 2v8M10 2v8M4 4h4M4 8h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
            'Style': '<path d="M2 6h2M5 6h2M8 6h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'
        };

        if (icons[label]) {
            labelEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">${icons[label]}</svg>`;
            labelEl.title = label;
        } else {
            labelEl.innerText = label;
        }
        container.appendChild(labelEl);

        const selectWrapper = document.createElement('div');
        selectWrapper.style.flex = '1';
        selectWrapper.style.position = 'relative';
        selectWrapper.style.height = '100%';
        container.appendChild(selectWrapper);

        const select = document.createElement('select');
        Object.assign(select.style, {
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '0 4px',
            outline: 'none',
            borderRadius: '2px',
            boxSizing: 'border-box',
            cursor: 'pointer',
            appearance: 'none',
            transition: 'background-color 0.15s'
        });

        // Custom arrow for select
        const arrow = document.createElement('div');
        arrow.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 3l2 2 2-2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        Object.assign(arrow.style, {
            position: 'absolute',
            right: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--figma-text-tertiary)',
            pointerEvents: 'none'
        });
        selectWrapper.appendChild(arrow);

        select.addEventListener('mouseenter', () => {
            if (document.activeElement !== select) {
                select.style.backgroundColor = 'var(--figma-hover-bg)';
                labelEl.style.color = 'var(--figma-text-secondary)';
                arrow.style.color = 'var(--figma-text-secondary)';
            }
        });
        select.addEventListener('mouseleave', () => {
            if (document.activeElement !== select) {
                select.style.backgroundColor = 'transparent';
                labelEl.style.color = 'var(--figma-text-tertiary)';
                arrow.style.color = 'var(--figma-text-tertiary)';
            }
        });

        select.addEventListener('focus', () => {
            select.style.backgroundColor = 'var(--figma-active-bg)';
            select.style.border = '1px solid var(--figma-blue)';
            labelEl.style.color = 'var(--figma-blue)';
            arrow.style.color = 'var(--figma-blue)';
        });

        select.addEventListener('blur', () => {
            select.style.backgroundColor = 'transparent';
            select.style.border = '1px solid transparent';
            labelEl.style.color = 'var(--figma-text-tertiary)';
            arrow.style.color = 'var(--figma-text-tertiary)';
        });

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = opt.charAt(0).toUpperCase() + opt.slice(1);
            option.style.backgroundColor = 'var(--figma-bg-panel)';
            option.style.color = 'var(--figma-text-primary)';
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            this.applyChange(key, select.value, 'text');
        });

        selectWrapper.appendChild(select);
        this.fields[key] = select as any;

        const grid = (parent as any).grid;
        if (grid) grid.appendChild(container);
        else parent.appendChild(container);

        return container;
    }

    private addPropertyFieldWithSlider(parent: HTMLElement, label: string, key: string, min: number, max: number): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.height = '32px';
        container.style.position = 'relative';

        const labelEl = document.createElement('div');
        Object.assign(labelEl.style, {
            width: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-tertiary)',
            fontSize: '10px',
            fontWeight: '500',
            flexShrink: '0',
            cursor: 'ew-resize',
            userSelect: 'none',
            transition: 'color 0.15s'
        });
        labelEl.innerText = label;
        container.appendChild(labelEl);

        const input = document.createElement('input');
        input.type = 'number';
        Object.assign(input.style, {
            width: '45px',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '4px',
            outline: 'none',
            borderRadius: '2px',
            boxSizing: 'border-box',
            transition: 'background-color 0.15s, border-color 0.15s'
        });

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min.toString();
        slider.max = max.toString();
        Object.assign(slider.style, {
            flex: '1',
            margin: '0 8px',
            height: '2px',
            cursor: 'pointer',
            accentColor: 'var(--figma-blue)'
        });

        input.addEventListener('focus', () => {
            input.style.backgroundColor = 'var(--figma-active-bg)';
            input.style.border = '1px solid var(--figma-blue)';
        });

        input.addEventListener('blur', () => {
            input.style.backgroundColor = 'transparent';
            input.style.border = '1px solid transparent';
            this.applyChange(key, parseFloat(input.value), 'number');
            slider.value = input.value;
        });

        slider.addEventListener('input', () => {
            input.value = slider.value;
            this.applyChange(key, parseFloat(slider.value), 'number', false); // No history for continuous dragging
        });

        slider.addEventListener('change', () => {
            this.applyChange(key, parseFloat(slider.value), 'number', true); // Record history on release
        });

        container.appendChild(slider);
        container.appendChild(input);
        this.fields[key] = input;

        const grid = (parent as any).grid;
        if (grid) grid.appendChild(container);
        else parent.appendChild(container);

        return container;
    }

    private addPropertyField(parent: HTMLElement, label: string, key: string, type: 'number' | 'color' | 'text'): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.height = '32px';
        container.style.position = 'relative';

        // Icon or Label
        const labelEl = document.createElement('div');
        Object.assign(labelEl.style, {
            width: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--figma-text-tertiary)',
            fontSize: '10px',
            fontWeight: '500',
            flexShrink: '0',
            cursor: type === 'number' ? 'ew-resize' : 'default',
            userSelect: 'none',
            transition: 'color 0.15s'
        });

        // Use SVG icons for common properties
        const icons: { [key: string]: string } = {
            'X': '<path d="M2 5h8M4 3l-2 2 2 2M8 3l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
            'Y': '<path d="M5 2v8M3 4l2-2 2 2M3 8l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
            'W': '<path d="M1 5h10M3 3L1 5l2 2M9 3l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
            'H': '<path d="M5 1v10M3 3l2-2 2 2M3 9l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
            'R': '<path d="M10 6a4 4 0 1 1-4-4v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 2l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
            'SX': '<path d="M1 6h10M3 4L1 6l2 2M9 4l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 1v10" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>',
            'SY': '<path d="M6 1v10M4 3l2-2 2 2M4 9l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 6h10" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>',
            'Radius': '<path d="M2 2v2a4 4 0 0 0 4 4h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 2v8M2 10h8" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>',
            'Color': '<rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>',
            'Fill': '<rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>',
            'Weight': '<path d="M2 6h8M2 3h8M2 9h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'
        };

        if (icons[label]) {
            labelEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">${icons[label]}</svg>`;
            labelEl.title = label;
        } else {
            labelEl.innerText = label;
        }
        
        container.appendChild(labelEl);

        const inputWrapper = document.createElement('div');
        inputWrapper.style.flex = '1';
        inputWrapper.style.display = 'flex';
        inputWrapper.style.alignItems = 'center';
        inputWrapper.style.position = 'relative';
        inputWrapper.style.height = '24px'; // Standard Figma input height
        container.appendChild(inputWrapper);

        const input = document.createElement('input');
        input.type = (type === 'color' || type === 'text') ? 'text' : 'number';
        if (type === 'number') {
            input.step = '1';
        }
        
        Object.assign(input.style, {
            flex: '1',
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '0 4px',
            outline: 'none',
            borderRadius: '2px',
            boxSizing: 'border-box',
            transition: 'background-color 0.15s, border-color 0.15s'
        });

        // Add input to wrapper first so insertBefore works
        inputWrapper.appendChild(input);

        // Color Picker specific refinements
        if (type === 'color') {
            const colorPreview = document.createElement('div');
            Object.assign(colorPreview.style, {
                width: '16px',
                height: '16px',
                borderRadius: '2px',
                border: '1px solid var(--figma-border)',
                marginRight: '8px',
                cursor: 'pointer',
                flexShrink: '0',
                position: 'relative',
                backgroundColor: '#ffffff'
            });

            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            Object.assign(colorPicker.style, {
                opacity: '0',
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                padding: '0',
                border: 'none'
            });

            colorPicker.addEventListener('input', () => {
                const val = colorPicker.value.toUpperCase();
                input.value = val;
                colorPreview.style.backgroundColor = val;
                this.applyChange(key, val, 'color');
            });
            
            colorPreview.appendChild(colorPicker);
            inputWrapper.insertBefore(colorPreview, input);
            (input as any).colorPicker = colorPicker;
            (input as any).colorPreview = colorPreview;

            // Opacity Input
            const opacityInput = document.createElement('input');
            opacityInput.type = 'text';
            opacityInput.value = '100%';
            Object.assign(opacityInput.style, {
                width: '36px',
                height: '100%',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                color: 'var(--figma-text-secondary)',
                fontSize: '11px',
                textAlign: 'right',
                outline: 'none',
                marginLeft: '4px',
                padding: '0 4px',
                borderRadius: '2px',
                transition: 'color 0.15s, background-color 0.15s'
            });

            opacityInput.addEventListener('mouseenter', () => {
                if (document.activeElement !== opacityInput) {
                    opacityInput.style.backgroundColor = 'var(--figma-hover-bg)';
                }
            });
            opacityInput.addEventListener('mouseleave', () => {
                if (document.activeElement !== opacityInput) {
                    opacityInput.style.backgroundColor = 'transparent';
                }
            });
            opacityInput.addEventListener('focus', () => {
                opacityInput.style.backgroundColor = 'var(--figma-active-bg)';
                opacityInput.style.border = '1px solid var(--figma-blue)';
            });
            opacityInput.addEventListener('blur', () => {
                opacityInput.style.backgroundColor = 'transparent';
                opacityInput.style.border = '1px solid transparent';
                
                let val = parseInt(opacityInput.value);
                if (isNaN(val)) val = 100;
                val = Math.max(0, Math.min(100, val));
                opacityInput.value = val + '%';
                
                this.applyChange(key + 'Opacity', (val / 100).toString(), 'number');
            });
            opacityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') opacityInput.blur();
            });

            inputWrapper.appendChild(opacityInput);
            (input as any).opacityInput = opacityInput;

            input.style.textTransform = 'uppercase';
        }

        input.addEventListener('mouseenter', () => {
            if (document.activeElement !== input) {
                input.style.backgroundColor = 'var(--figma-hover-bg)';
                labelEl.style.color = 'var(--figma-text-secondary)';
            }
        });
        input.addEventListener('mouseleave', () => {
            if (document.activeElement !== input) {
                input.style.backgroundColor = 'transparent';
                labelEl.style.color = 'var(--figma-text-tertiary)';
            }
        });

        input.addEventListener('focus', () => {
            input.style.backgroundColor = 'var(--figma-active-bg)';
            input.style.border = '1px solid var(--figma-blue)';
            labelEl.style.color = 'var(--figma-blue)';
        });

        input.addEventListener('blur', () => {
            input.style.backgroundColor = 'transparent';
            input.style.border = '1px solid transparent';
            labelEl.style.color = 'var(--figma-text-tertiary)';
            this.applyChange(key, input.value, type);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
        });

        this.fields[key] = input;

        // Label Dragging for numbers (Enhanced with Shift/Alt support)
        if (type === 'number') {
            let isDragging = false;
            let startX = 0;
            let startVal = 0;
            let dragStartStates = new Map<Node, any>();

            labelEl.addEventListener('mousedown', (e) => {
                if (input.disabled) return;
                isDragging = true;
                startX = e.clientX;
                startVal = parseFloat(input.value) || 0;
                document.body.style.cursor = 'ew-resize';
                
                // 记录初始状态
                dragStartStates.clear();
                this.selectedNodes.forEach(node => {
                    dragStartStates.set(node, this.getNodePropertyValue(node, key));
                });

                const onMouseMove = (moveEvent: MouseEvent) => {
                    if (!isDragging) return;
                    let delta = moveEvent.clientX - startX;
                    
                    // Support Shift for 10x, Alt for 0.1x
                    if (moveEvent.shiftKey) delta *= 10;
                    if (moveEvent.altKey) delta *= 0.1;

                    const newVal = startVal + delta;
                    input.value = (moveEvent.altKey ? newVal.toFixed(1) : Math.round(newVal).toString());
                    this.applyChange(key, input.value, 'number', false); // false 表示不记录历史
                };

                const onMouseUp = () => {
                    if (isDragging) {
                        // 记录最终状态并存入历史
                        const dragEndStates = new Map<Node, any>();
                        this.selectedNodes.forEach(node => {
                            dragEndStates.set(node, this.getNodePropertyValue(node, key));
                        });

                        // 检查是否真的发生了变化
                        let changed = false;
                        for (const [node, oldVal] of dragStartStates) {
                            if (oldVal !== dragEndStates.get(node)) {
                                changed = true;
                                break;
                            }
                        }

                        if (changed) {
                            const command = new PropertyCommand(
                                Array.from(this.selectedNodes),
                                key,
                                dragStartStates,
                                dragEndStates,
                                (node, val) => this.setNodePropertyValue(node, key, val)
                            );
                            this.engine.history.push(command);
                        }
                    }

                    isDragging = false;
                    document.body.style.cursor = 'default';
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });
        }
        
        const grid = (parent as any).grid;
        if (grid) {
            grid.appendChild(container);
        } else {
            parent.appendChild(container);
        }

        return container;
    }

    public updateNode(node: Node | null) {
        const nodes = new Set<Node>();
        if (node) nodes.add(node);
        this.updateNodes(nodes);
    }

    public updateNodes(nodes: Set<Node>) {
        this.selectedNodes = nodes;
        if (nodes.size === 0) {
            this.container.style.display = 'none';
            return;
        }

        this.container.style.display = 'flex';
        this.syncFromNodes();
    }

    private getNodePropertyValue(node: Node, key: string): any {
        switch (key) {
            case 'name': return node.name;
            case 'locked': return node.locked;
            case 'visible': return node.visible;
            case 'textContent': return (node as any).text !== undefined ? (node as any).text : ((node as any).content || '');
            case 'textureUrl': return (node as any).textureUrl || '';
            case 'fontFamily': return (node as any).fontFamily || 'Arial';
            case 'fontSize': return (node as any).fontSize || 12;
            case 'fontWeight': return (node as any).fontWeight || 'normal';
            case 'fontStyle': return (node as any).fontStyle || 'normal';
            case 'textFillStyle': return (node as any).fillStyle || '#000000';
            case 'letterSpacing': return (node as any).letterSpacing || 0;
            case 'textStrokeStyle': return (node as any).strokeStyle || '#000000';
            case 'textStrokeWidth': return (node as any).strokeWidth || 0;
            case 'highlightType': return (node as any).highlightType || 'none';
            case 'highlightColor': return (node as any).highlightColor || '#FFD700';
            case 'x': return Math.round(node.x);
            case 'y': return Math.round(node.y);
            case 'width': return Math.round(node.width);
            case 'height': return Math.round(node.height);
            case 'rotation': return Math.round(node.transform.rotation * 180 / Math.PI);
            case 'scaleX': return parseFloat(node.scaleX.toFixed(2));
            case 'scaleY': return parseFloat(node.scaleY.toFixed(2));
            case 'borderRadius': return Array.isArray(node.style.borderRadius) ? node.style.borderRadius[0] : (node.style.borderRadius || 0);
            case 'borderRadiusTL': return Array.isArray(node.style.borderRadius) ? node.style.borderRadius[0] : (node.style.borderRadius || 0);
            case 'borderRadiusTR': return Array.isArray(node.style.borderRadius) ? node.style.borderRadius[1] : (node.style.borderRadius || 0);
            case 'borderRadiusBR': return Array.isArray(node.style.borderRadius) ? node.style.borderRadius[2] : (node.style.borderRadius || 0);
            case 'borderRadiusBL': return Array.isArray(node.style.borderRadius) ? node.style.borderRadius[3] : (node.style.borderRadius || 0);
            case 'backgroundColor': {
                if ((node as any).color instanceof Float32Array) {
                    const c = (node as any).color;
                    return this.rgbaToHex([c[0], c[1], c[2], c[3]]);
                }
                if ((node as any).fillStyle !== undefined) return (node as any).fillStyle;
                return this.rgbaToHex(node.style.backgroundColor || [1, 1, 1, 1]);
            }
            case 'backgroundColorOpacity': {
                if ((node as any).color instanceof Float32Array) return (node as any).color[3];
                return node.style.backgroundColor?.[3] ?? 1;
            }
            case 'borderWidth': return node.style.borderWidth || 0;
            case 'borderColor': return this.rgbaToHex(node.style.borderColor || [0, 0, 0, 0]);
            case 'strokeType': return node.style.strokeType || 'inner';
            case 'strokeStyle': return node.style.strokeStyle || 'solid';
            case 'strokeDash': return node.style.strokeDashArray?.[0] || 0;
            case 'strokeGap': return node.style.strokeDashArray?.[1] || 0;
            case 'layerBlur': return node.effects.layerBlur || 0;
            case 'backgroundBlur': return node.effects.backgroundBlur || 0;
            case 'outerShadowColor': return this.rgbaToHex(node.effects.outerShadow?.color || [0, 0, 0, 0]);
            case 'outerShadowX': return node.effects.outerShadow?.offsetX || 0;
            case 'outerShadowY': return node.effects.outerShadow?.offsetY || 0;
            case 'outerShadowBlur': return node.effects.outerShadow?.blur || 0;
            case 'outerShadowSpread': return node.effects.outerShadow?.spread || 0;
            case 'innerShadowColor': return this.rgbaToHex(node.effects.innerShadow?.color || [0, 0, 0, 0]);
            case 'innerShadowX': return node.effects.innerShadow?.offsetX || 0;
            case 'innerShadowY': return node.effects.innerShadow?.offsetY || 0;
            case 'innerShadowBlur': return node.effects.innerShadow?.blur || 0;
            case 'innerShadowSpread': return node.effects.innerShadow?.spread || 0;
            case 'constraints.horizontal': return node.style.constraints?.horizontal || 'min';
            case 'constraints.vertical': return node.style.constraints?.vertical || 'min';
            default: return 0;
        }
    }

    private setNodePropertyValue(node: Node, key: string, value: any) {
        if (key.startsWith('constraints.')) {
            const [, propKey] = key.split('.');
            if (!node.style.constraints) {
                node.style.constraints = { horizontal: 'min', vertical: 'min' };
            }
            (node.style.constraints as any)[propKey] = value;
            node.invalidate();
            return;
        }

        // Handle boolean values for locked and visible
        if (key === 'locked' || key === 'visible') {
            (node as any)[key] = !!value;
            return;
        }

        // Handle types (value is usually a string from input)
        const num = parseFloat(value);
        
        switch (key) {
            case 'name': node.name = value; break;
            case 'textContent':
                if ((node as any).text !== undefined) {
                    (node as any).text = value;
                } else if ((node as any).content !== undefined) {
                    (node as any).content = value;
                }
                break;
            case 'fontFamily':
                if ((node as any).fontFamily !== undefined) (node as any).fontFamily = value;
                break;
            case 'fontSize':
                if ((node as any).fontSize !== undefined) (node as any).fontSize = num;
                break;
            case 'fontWeight':
                if ((node as any).fontWeight !== undefined) (node as any).fontWeight = value;
                break;
            case 'fontStyle':
                if ((node as any).fontStyle !== undefined) (node as any).fontStyle = value;
                break;
            case 'textFillStyle':
                if ((node as any).fillStyle !== undefined) (node as any).fillStyle = value;
                break;
            case 'letterSpacing':
                if ((node as any).letterSpacing !== undefined) (node as any).letterSpacing = num;
                break;
            case 'textStrokeStyle':
                if ((node as any).strokeStyle !== undefined) (node as any).strokeStyle = value;
                break;
            case 'textStrokeWidth':
                if ((node as any).strokeWidth !== undefined) (node as any).strokeWidth = num;
                break;
            case 'highlightType':
                if ((node as any).highlightType !== undefined) (node as any).highlightType = value;
                break;
            case 'highlightColor':
                if ((node as any).highlightColor !== undefined) (node as any).highlightColor = value;
                break;
            case 'textureUrl':
                if ((node as any).textureUrl !== undefined) {
                    (node as any).textureUrl = value;
                }
                break;
            case 'x': node.setPosition(num, node.y); break;
            case 'y': node.setPosition(node.x, num); break;
            case 'width': node.width = num; break;
            case 'height': node.height = num; break;
            case 'rotation': node.transform.rotation = num * Math.PI / 180; break;
            case 'scaleX': node.setScale(num, node.scaleY); break;
            case 'scaleY': node.setScale(node.scaleX, num); break;
            case 'borderRadius': node.style = { borderRadius: num }; break;
            case 'borderRadiusTL': {
                const br = Array.isArray(node.style.borderRadius) ? [...node.style.borderRadius] : [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                br[0] = num;
                node.style = { borderRadius: br as [number, number, number, number] };
                break;
            }
            case 'borderRadiusTR': {
                const br = Array.isArray(node.style.borderRadius) ? [...node.style.borderRadius] : [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                br[1] = num;
                node.style = { borderRadius: br as [number, number, number, number] };
                break;
            }
            case 'borderRadiusBR': {
                const br = Array.isArray(node.style.borderRadius) ? [...node.style.borderRadius] : [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                br[2] = num;
                node.style = { borderRadius: br as [number, number, number, number] };
                break;
            }
            case 'borderRadiusBL': {
                const br = Array.isArray(node.style.borderRadius) ? [...node.style.borderRadius] : [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                br[3] = num;
                node.style = { borderRadius: br as [number, number, number, number] };
                break;
            }
            case 'backgroundColor': {
                const rgba = this.hexToRgba(value) || [1, 1, 1, 1];
                // Preserve current opacity
                const currentOpacity = this.getNodePropertyValue(node, 'backgroundColorOpacity');
                rgba[3] = currentOpacity;
                node.style = { backgroundColor: rgba };
                if ((node as any).color instanceof Float32Array) (node as any).color = new Float32Array(rgba);
                if ((node as any).fillStyle !== undefined) {
                    (node as any).fillStyle = value;
                    (node as any)._contentDirty = true;
                }
                break;
            }
            case 'backgroundColorOpacity': {
                const rgba = [...(node.style.backgroundColor || [1, 1, 1, 1])] as [number, number, number, number];
                rgba[3] = num;
                node.style = { backgroundColor: rgba };
                if ((node as any).color instanceof Float32Array) (node as any).color = new Float32Array(rgba);
                break;
            }
            case 'borderWidth': node.style = { borderWidth: num }; break;
            case 'borderColor': {
                const rgba = this.hexToRgba(value) || [0, 0, 0, 1];
                node.style = { borderColor: rgba };
                break;
            }
            case 'strokeType': node.style.strokeType = value as any; break;
            case 'strokeStyle': node.style.strokeStyle = value as any; break;
            case 'strokeDash': {
                const dash = node.style.strokeDashArray ? [...node.style.strokeDashArray] : [0, 0];
                dash[0] = num;
                node.style = { strokeDashArray: dash as [number, number] };
                break;
            }
            case 'strokeGap': {
                const dash = node.style.strokeDashArray ? [...node.style.strokeDashArray] : [0, 0];
                dash[1] = num;
                node.style = { strokeDashArray: dash as [number, number] };
                break;
            }
            case 'layerBlur': node.effects = { layerBlur: num }; break;
            case 'backgroundBlur': node.effects = { backgroundBlur: num }; break;
            case 'outerShadowColor': {
                const rgba = this.hexToRgba(value) || [0, 0, 0, 0.5];
                const os = node.effects.outerShadow ? { ...node.effects.outerShadow } : { color: rgba, blur: 5, offsetX: 0, offsetY: 0 };
                os.color = rgba;
                node.effects = { outerShadow: os };
                break;
            }
            case 'outerShadowX': {
                const os = node.effects.outerShadow ? { ...node.effects.outerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                os.offsetX = num;
                node.effects = { outerShadow: os };
                break;
            }
            case 'outerShadowY': {
                const os = node.effects.outerShadow ? { ...node.effects.outerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                os.offsetY = num;
                node.effects = { outerShadow: os };
                break;
            }
            case 'outerShadowBlur': {
                const os = node.effects.outerShadow ? { ...node.effects.outerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                os.blur = num;
                node.effects = { outerShadow: os };
                break;
            }
            case 'outerShadowSpread': {
                const os = node.effects.outerShadow ? { ...node.effects.outerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                os.spread = num;
                node.effects = { outerShadow: os };
                break;
            }
            case 'innerShadowColor': {
                const rgba = this.hexToRgba(value) || [0, 0, 0, 0.5];
                const is = node.effects.innerShadow ? { ...node.effects.innerShadow } : { color: rgba, blur: 5, offsetX: 0, offsetY: 0 };
                is.color = rgba;
                node.effects = { innerShadow: is };
                break;
            }
            case 'innerShadowX': {
                const is = node.effects.innerShadow ? { ...node.effects.innerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                is.offsetX = num;
                node.effects = { innerShadow: is };
                break;
            }
            case 'innerShadowY': {
                const is = node.effects.innerShadow ? { ...node.effects.innerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                is.offsetY = num;
                node.effects = { innerShadow: is };
                break;
            }
            case 'innerShadowBlur': {
                const is = node.effects.innerShadow ? { ...node.effects.innerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                is.blur = num;
                node.effects = { innerShadow: is };
                break;
            }
            case 'innerShadowSpread': {
                const is = node.effects.innerShadow ? { ...node.effects.innerShadow } : { color: [0, 0, 0, 0.5] as [number, number, number, number], blur: 5, offsetX: 0, offsetY: 0 };
                is.spread = num;
                node.effects = { innerShadow: is };
                break;
            }
        }
        node.invalidate();
    }

    private syncFromNodes() {
        try {
            if (this.selectedNodes.size === 0) return;
            
            const nodes = Array.from(this.selectedNodes);
            console.log('[PropertyPanel] syncFromNodes', nodes.length, nodes.map(n => n.name));
            const firstNode = nodes[0];

            // 1. 获取共同值或 Mixed 状态
            const getMixedValueByKey = (key: string) => {
                const firstValue = this.getNodePropertyValue(firstNode, key);
                const isMixed = nodes.some(n => this.getNodePropertyValue(n, key) !== firstValue);
                return { value: firstValue, isMixed };
            };

            // 2. 更新基础属性 (Name)
            if (this.fields['name']) {
                const { value, isMixed } = getMixedValueByKey('name');
                this.fields['name'].value = isMixed ? 'Mixed' : (value || '');
                this.fields['name'].placeholder = isMixed ? 'Mixed' : '';
            }

            // 2.1 更新 Locked / Visible 状态
            ['locked', 'visible'].forEach(key => {
                const btn = (this.fields as any)[key];
                if (btn && btn.updateUI) {
                    const { value, isMixed } = getMixedValueByKey(key);
                    btn.updateUI(isMixed ? false : !!value);
                    // If mixed, we might want to show a mixed state, but for now just false
                    if (isMixed) {
                        btn.style.opacity = '0.5';
                    } else {
                        btn.style.opacity = '1';
                    }
                }
            });

            // 3. 更新 Text 内容 (如果是 Text 节点)
            const textContentContainer = document.getElementById('text-content-container');
            const textSection = document.getElementById('text-section');
            
            if (textContentContainer || textSection) {
                const allTextNodes = nodes.every(n => (n as any).text !== undefined || (n as any).content !== undefined);
                
                if (textContentContainer) textContentContainer.style.display = allTextNodes ? 'block' : 'none';
                if (textSection) textSection.style.display = allTextNodes ? 'block' : 'none';
                
                if (allTextNodes) {
                    const textFields = [
                        'textContent', 'fontFamily', 'fontSize', 'fontWeight', 
                        'fontStyle', 'textFillStyle', 'letterSpacing', 
                        'textStrokeStyle', 'textStrokeWidth',
                        'highlight'
                    ];
                    
                    textFields.forEach(key => {
                        if (this.fields[key]) {
                            const field = this.fields[key] as any;
                            if (field.updateUI) {
                                field.updateUI(nodes);
                                return;
                            }

                            const { value, isMixed } = getMixedValueByKey(key);
                            
                            if (key === 'textFillStyle' || key === 'textStrokeStyle') {
                                field.value = isMixed ? 'Mixed' : value;
                                if (field.colorPicker) field.colorPicker.value = isMixed ? '#ffffff' : value;
                                if (field.colorPreview) field.colorPreview.style.backgroundColor = isMixed ? 'transparent' : value;
                            } else {
                                field.value = isMixed ? '' : (value !== undefined ? value.toString() : '');
                                field.placeholder = isMixed ? 'Mixed' : '';
                            }
                        }
                    });
                }
            }

            // 3.1 更新 Image 内容 (如果是 Sprite 节点)
            const imageSectionContainer = document.getElementById('image-section-container');
            if (imageSectionContainer) {
                const allSpriteNodes = nodes.every(n => (n as any).textureUrl !== undefined);
                imageSectionContainer.style.display = allSpriteNodes ? 'block' : 'none';
                if (allSpriteNodes && this.fields['textureUrl']) {
                    const { value, isMixed } = getMixedValueByKey('textureUrl');
                    this.fields['textureUrl'].value = isMixed ? 'Mixed' : (value || '');
                }
            }

            // 4. 更新布局 (Layout)
            const allTextNodes = nodes.every(n => (n as any).text !== undefined || (n as any).content !== undefined);
            const layoutFields = ['x', 'y', 'width', 'height', 'rotation', 'scaleX', 'scaleY'];
            layoutFields.forEach(key => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValueByKey(key);
                    const field = this.fields[key] as HTMLInputElement;
                    field.value = isMixed ? '' : value.toString();
                    field.placeholder = isMixed ? 'Mixed' : '';

                    // 文字节点恢复宽高修改，但仍然根据对齐方式渲染
                    if (key === 'width' || key === 'height') {
                        field.disabled = allTextNodes;
                        field.style.opacity = allTextNodes ? '0.5' : '1';
                        field.style.cursor = allTextNodes ? 'default' : 'text';
                    }
                }
            });

            // 5. 更新外观 (Appearance)
            if (this.fields['backgroundColor']) {
                const { value, isMixed } = getMixedValueByKey('backgroundColor');
                this.fields['backgroundColor'].value = isMixed ? 'Mixed' : value;
                const field = this.fields['backgroundColor'] as any;
                if (field.colorPicker) {
                    field.colorPicker.value = isMixed ? '#ffffff' : value;
                }
                if (field.colorPreview) {
                    field.colorPreview.style.backgroundColor = isMixed ? 'transparent' : value;
                }
                
                const { value: opacity, isMixed: opacityMixed } = getMixedValueByKey('backgroundColorOpacity');
                if (field.opacityInput) {
                    field.opacityInput.value = opacityMixed ? 'Mixed' : Math.round(opacity * 100) + '%';
                }
            }

            // 5.1 更新圆角 (Radius)
            if (this.fields['borderRadius']) {
                const { value, isMixed } = getMixedValueByKey('borderRadius');
                this.fields['borderRadius'].value = isMixed ? '' : value.toString();
                this.fields['borderRadius'].placeholder = isMixed ? 'Mixed' : '';
            }
            
            // 更新分项圆角
            ['borderRadiusTL', 'borderRadiusTR', 'borderRadiusBR', 'borderRadiusBL'].forEach((key) => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValueByKey(key);
                    this.fields[key].value = isMixed ? '' : value.toString();
                    this.fields[key].placeholder = isMixed ? 'Mixed' : '';
                }
            });

            // 6. 更新边框 (Stroke)
            if (this.fields['borderWidth']) {
                const { value, isMixed } = getMixedValueByKey('borderWidth');
                this.fields['borderWidth'].value = isMixed ? '' : value.toString();
                this.fields['borderWidth'].placeholder = isMixed ? 'Mixed' : '';
            }

            if (this.fields['borderColor']) {
                const { value, isMixed } = getMixedValueByKey('borderColor');
                this.fields['borderColor'].value = isMixed ? 'Mixed' : value;
                const field = this.fields['borderColor'] as any;
                if (field.colorPicker) {
                    field.colorPicker.value = isMixed ? '#ffffff' : value;
                }
                if (field.colorPreview) {
                    field.colorPreview.style.backgroundColor = isMixed ? 'transparent' : value;
                }
            }

            if (this.fields['strokeType']) {
                const { value, isMixed } = getMixedValueByKey('strokeType');
                this.fields['strokeType'].value = isMixed ? '' : value;
            }

            if (this.fields['strokeStyle']) {
                const { value, isMixed } = getMixedValueByKey('strokeStyle');
                this.fields['strokeStyle'].value = isMixed ? '' : value;
            }

            if (this.fields['strokeDash']) {
                const { value, isMixed } = getMixedValueByKey('strokeDash');
                this.fields['strokeDash'].value = isMixed ? '' : value.toString();
                this.fields['strokeDash'].placeholder = isMixed ? 'Mixed' : '';
            }

            if (this.fields['strokeGap']) {
                const { value, isMixed } = getMixedValueByKey('strokeGap');
                this.fields['strokeGap'].value = isMixed ? '' : value.toString();
                this.fields['strokeGap'].placeholder = isMixed ? 'Mixed' : '';
            }

            // 6.1 更新特效 (Effects)
            if (this.fields['layerBlur']) {
                const { value, isMixed } = getMixedValueByKey('layerBlur');
                this.fields['layerBlur'].value = isMixed ? '' : value.toString();
                this.fields['layerBlur'].placeholder = isMixed ? 'Mixed' : '';
            }

            if (this.fields['backgroundBlur']) {
                const { value, isMixed } = getMixedValueByKey('backgroundBlur');
                this.fields['backgroundBlur'].value = isMixed ? '' : value.toString();
                this.fields['backgroundBlur'].placeholder = isMixed ? 'Mixed' : '';
            }

            // Outer Shadow
            if (this.fields['outerShadowColor']) {
                const { value, isMixed } = getMixedValueByKey('outerShadowColor');
                this.fields['outerShadowColor'].value = isMixed ? 'Mixed' : value;
            }
            ['outerShadowX', 'outerShadowY', 'outerShadowBlur', 'outerShadowSpread'].forEach(key => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValueByKey(key);
                    this.fields[key].value = isMixed ? '' : value.toString();
                    this.fields[key].placeholder = isMixed ? 'Mixed' : '';
                }
            });

            // Inner Shadow
            if (this.fields['innerShadowColor']) {
                const { value, isMixed } = getMixedValueByKey('innerShadowColor');
                this.fields['innerShadowColor'].value = isMixed ? 'Mixed' : value;
            }
            ['innerShadowX', 'innerShadowY', 'innerShadowBlur', 'innerShadowSpread'].forEach(key => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValueByKey(key);
                    this.fields[key].value = isMixed ? '' : value.toString();
                    this.fields[key].placeholder = isMixed ? 'Mixed' : '';
                }
            });

            // 7. 更新约束 (Constraints)
            const hConstraintField = this.fields['constraints.horizontal'] as unknown as HTMLSelectElement;
            const vConstraintField = this.fields['constraints.vertical'] as unknown as HTMLSelectElement;
            if (hConstraintField && vConstraintField) {
                const { value: hVal, isMixed: hMixed } = getMixedValueByKey('constraints.horizontal');
                const { value: vVal, isMixed: vMixed } = getMixedValueByKey('constraints.vertical');
                
                hConstraintField.value = hMixed ? '' : hVal;
                vConstraintField.value = vMixed ? '' : vVal;

                const visualBox = this.container.querySelector('.constraints-visual-box');
                if (visualBox) {
                    this.refreshConstraintVisuals(visualBox as HTMLElement, hVal, vVal);
                }
            }
        } catch (e) {
            console.error('[PropertyPanel] syncFromNodes error:', e);
        }
    }

    private applyChange(key: string, value: any, type: 'number' | 'color' | 'text' | 'boolean', recordHistory: boolean = true) {
        if (this.selectedNodes.size === 0) return;
        if (value === 'Mixed' || value === '') return;

        const nodesToApply = Array.from(this.selectedNodes).filter(node => 
            !node.locked || key === 'locked' || key === 'visible'
        );
        if (nodesToApply.length === 0) return;

        // 如果需要记录历史，先记录初始状态
        let startStates: Map<Node, any> | null = null;
        if (recordHistory) {
            startStates = new Map();
            nodesToApply.forEach(node => {
                startStates!.set(node, this.getNodePropertyValue(node, key));
            });
        }

        nodesToApply.forEach(node => {
            this.setNodePropertyValue(node, key, value);
        });

        // 如果需要记录历史，记录最终状态并存入历史管理器
        if (recordHistory && startStates) {
            const endStates = new Map();
            let changed = false;
            nodesToApply.forEach(node => {
                const endVal = this.getNodePropertyValue(node, key);
                endStates.set(node, endVal);
                if (endVal !== startStates!.get(node)) {
                    changed = true;
                }
            });

            if (changed) {
                const command = new PropertyCommand(
                    nodesToApply,
                    key,
                    startStates,
                    endStates,
                    (node, val) => this.setNodePropertyValue(node, key, val)
                );
                this.engine.history.push(command);
            }
        }

        if (this.onPropertyChange) {
            this.onPropertyChange();
        }
    }

    private rgbaToHex(rgba: [number, number, number, number] | Float32Array | number[]): string {
        const r = Math.round(rgba[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgba[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgba[2] * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    private hexToRgba(hex: string): [number, number, number, number] | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255,
            1
        ] : null;
    }
}
