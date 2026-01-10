import { Node } from '../display/Node';

/**
 * 属性面板 (Property Panel)
 * 
 * 模仿 Figma 的属性栏，用于显示和编辑选中节点的属性。
 */
export class PropertyPanel {
    private container: HTMLElement;

    private selectedNodes: Set<Node> = new Set();

    // UI 元素引用
    private fields: { [key: string]: HTMLInputElement } = {};

    public onPropertyChange: (() => void) | null = null;

    constructor() {
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
            width: '240px',
            height: '100vh',
            backgroundColor: 'var(--figma-bg-panel)',
            color: 'var(--figma-text-primary)',
            fontFamily: 'inherit',
            fontSize: '11px',
            zIndex: '1001',
            boxSizing: 'border-box',
            borderLeft: '1px solid var(--figma-border)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
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
                borderRadius: '4px',
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
        const nodes = Array.from(this.selectedNodes);

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
            borderRadius: '4px',
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
            borderRadius: '4px',
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
            this.applyConstraintChange(key, select.value);
            this.syncFromNodes();
        });

        selectWrapper.appendChild(select);
        this.fields[key] = select as any;

        return container;
    }

    private applyConstraintChange(keyPath: string, value: string) {
        if (this.selectedNodes.size === 0) return;
        const [, propKey] = keyPath.split('.');
        
        this.selectedNodes.forEach(node => {
            if (!node.style.constraints) {
                node.style.constraints = { horizontal: 'min', vertical: 'min' };
            }
            (node.style.constraints as any)[propKey] = value;
            node.invalidate();
        });

        if (this.onPropertyChange) this.onPropertyChange();
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
        const nameFieldContainer = this.addPropertyField(nameSection, 'Name', 'name', 'text');
        if (nameFieldContainer) {
            nameFieldContainer.style.gridColumn = '1 / -1';
        }
        
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
            borderRadius: '4px',
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
            input.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
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

        // Label Dragging
        let isDragging = false;
        let startX = 0;
        let startVal = 0;
        labelEl.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startVal = parseFloat(input.value) || 0;
            document.body.style.cursor = 'ew-resize';
            const onMouseMove = (me: MouseEvent) => {
                if (!isDragging) return;
                const delta = me.clientX - startX;
                input.value = Math.round(startVal + delta).toString();
                this.applyChange(key, input.value, 'number');
            };
            const onMouseUp = () => {
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
        container.style.gap = '8px 12px';
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
                'SY': '<path d="M6 1v10M4 3l2-2 2 2M4 9l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 6h10" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>'
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
                borderRadius: '4px',
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

            // Label Dragging
            let isDragging = false;
            let startX = 0;
            let startVal = 0;
            label.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startVal = parseFloat(input.value) || 0;
                document.body.style.cursor = 'ew-resize';
                const onMouseMove = (me: MouseEvent) => {
                    if (!isDragging) return;
                    const delta = me.clientX - startX;
                    input.value = Math.round(startVal + delta).toString();
                    this.applyChange(config.key, input.value, 'number');
                };
                const onMouseUp = () => {
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
        header.style.transition = 'background-color 0.1s';
        
        const arrow = document.createElement('div');
        arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        Object.assign(arrow.style, {
            width: '20px',
            height: '20px',
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
        titleEl.style.fontWeight = '700';
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
        addBtn.style.width = '20px';
        addBtn.style.height = '20px';
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
        grid.style.padding = '0 16px 12px 16px';
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
            padding: '8px 16px',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.02em',
            color: 'var(--figma-text-secondary)',
            borderBottom: '1px solid var(--figma-border)',
            textTransform: 'uppercase'
        });
        return title;
    }

    private addSelectField(parent: HTMLElement, label: string, key: string, options: string[]) {
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
            borderRadius: '4px',
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
            select.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
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
    }

    private addPropertyField(parent: HTMLElement, label: string, key: string, type: 'number' | 'color' | 'text'): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.height = '28px';
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
        input.type = (type === 'color' || type === 'text') ? 'text' : 'number';
        if (type === 'number') {
            input.step = '1';
        }
        
        Object.assign(input.style, {
            flex: '1',
            width: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--figma-text-primary)',
            fontSize: '11px',
            padding: '4px 4px',
            outline: 'none',
            borderRadius: '4px',
            boxSizing: 'border-box',
            transition: 'background-color 0.15s, border-color 0.15s'
        });

        // Add input to wrapper first so insertBefore works
        inputWrapper.appendChild(input);

        // Color Picker specific refinements
        if (type === 'color') {
            labelEl.style.width = '32px';
            labelEl.style.justifyContent = 'center';
            
            const colorPreview = document.createElement('div');
            Object.assign(colorPreview.style, {
                width: '16px',
                height: '16px',
                borderRadius: '2px',
                border: '1px solid var(--figma-border-medium)',
                marginRight: '8px',
                cursor: 'pointer',
                flexShrink: '0',
                position: 'relative',
                boxShadow: 'var(--figma-shadow-sm)',
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
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                color: 'var(--figma-text-tertiary)',
                fontSize: '10px',
                textAlign: 'right',
                outline: 'none',
                marginLeft: '4px',
                padding: '2px 4px',
                borderRadius: '4px',
                transition: 'color 0.15s, background-color 0.15s'
            });

            opacityInput.addEventListener('mouseenter', () => {
                if (document.activeElement !== opacityInput) {
                    opacityInput.style.backgroundColor = 'var(--figma-hover-bg)';
                    opacityInput.style.color = 'var(--figma-text-secondary)';
                }
            });
            opacityInput.addEventListener('mouseleave', () => {
                if (document.activeElement !== opacityInput) {
                    opacityInput.style.backgroundColor = 'transparent';
                    opacityInput.style.color = 'var(--figma-text-tertiary)';
                }
            });
            opacityInput.addEventListener('focus', () => {
                opacityInput.style.backgroundColor = 'var(--figma-active-bg)';
                opacityInput.style.border = '1px solid var(--figma-blue)';
                opacityInput.style.color = 'var(--figma-text-primary)';
            });
            opacityInput.addEventListener('blur', () => {
                opacityInput.style.backgroundColor = 'transparent';
                opacityInput.style.border = '1px solid transparent';
                opacityInput.style.color = 'var(--figma-text-tertiary)';
                
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

        // Label Dragging for numbers
        if (type === 'number') {
            let isDragging = false;
            let startX = 0;
            let startVal = 0;

            labelEl.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startVal = parseFloat(input.value) || 0;
                document.body.style.cursor = 'ew-resize';
                
                const onMouseMove = (moveEvent: MouseEvent) => {
                    if (!isDragging) return;
                    const delta = moveEvent.clientX - startX;
                    const newVal = startVal + delta;
                    input.value = Math.round(newVal).toString();
                    this.applyChange(key, input.value, 'number');
                };

                const onMouseUp = () => {
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

    private syncFromNodes() {
        try {
            if (this.selectedNodes.size === 0) return;
            
            const nodes = Array.from(this.selectedNodes);
            console.log('[PropertyPanel] syncFromNodes', nodes.length, nodes.map(n => n.name));
            const firstNode = nodes[0];

            // 1. 获取共同值或 Mixed 状态
            const getMixedValue = (getter: (n: Node) => any) => {
                const firstValue = getter(firstNode);
                const isMixed = nodes.some(n => getter(n) !== firstValue);
                return { value: firstValue, isMixed };
            };

            // 2. 更新基础属性 (Name)
            if (this.fields['name']) {
                const { value, isMixed } = getMixedValue(n => n.name);
                this.fields['name'].value = isMixed ? 'Mixed' : (value || '');
                this.fields['name'].placeholder = isMixed ? 'Mixed' : '';
            }

            // 3. 更新 Text 内容 (如果是 Text 节点)
            const textContentContainer = document.getElementById('text-content-container');
            if (textContentContainer) {
                const allTextNodes = nodes.every(n => (n as any).text !== undefined || (n as any).content !== undefined);
                textContentContainer.style.display = allTextNodes ? 'block' : 'none';
                if (allTextNodes && this.fields['textContent']) {
                    const { value, isMixed } = getMixedValue(n => (n as any).text || (n as any).content || '');
                    this.fields['textContent'].value = isMixed ? 'Mixed' : (value || '');
                }
            }

            // 3.1 更新 Image 内容 (如果是 Sprite 节点)
            const imageSectionContainer = document.getElementById('image-section-container');
            if (imageSectionContainer) {
                const allSpriteNodes = nodes.every(n => (n as any).textureUrl !== undefined);
                imageSectionContainer.style.display = allSpriteNodes ? 'block' : 'none';
                if (allSpriteNodes && this.fields['textureUrl']) {
                    const { value, isMixed } = getMixedValue(n => (n as any).textureUrl);
                    this.fields['textureUrl'].value = isMixed ? 'Mixed' : (value || '');
                }
            }

            // 4. 更新布局 (Layout)
            const layoutFields = ['x', 'y', 'width', 'height', 'rotation', 'scaleX', 'scaleY'];
            layoutFields.forEach(key => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValue(n => {
                        switch(key) {
                            case 'x': return Math.round(n.x);
                            case 'y': return Math.round(n.y);
                            case 'width': return Math.round(n.width);
                            case 'height': return Math.round(n.height);
                            case 'rotation': return Math.round(n.transform.rotation * 180 / Math.PI);
                            case 'scaleX': return parseFloat(n.scaleX.toFixed(2));
                            case 'scaleY': return parseFloat(n.scaleY.toFixed(2));
                            default: return 0;
                        }
                    });
                    console.log(`[PropertyPanel] sync field ${key}: ${value} (mixed: ${isMixed})`);
                    this.fields[key].value = isMixed ? '' : value.toString();
                    this.fields[key].placeholder = isMixed ? 'Mixed' : '';
                }
            });

            // 5. 更新外观 (Appearance)
            if (this.fields['backgroundColor']) {
                const { value, isMixed } = getMixedValue(n => {
                    if ((n as any).color instanceof Float32Array) {
                        const c = (n as any).color;
                        return this.rgbaToHex([c[0], c[1], c[2], c[3]]);
                    }
                    if ((n as any).fillStyle !== undefined) {
                        return (n as any).fillStyle;
                    }
                    return this.rgbaToHex(n.style.backgroundColor || [1,1,1,1]);
                });
                this.fields['backgroundColor'].value = isMixed ? 'Mixed' : value;
                const field = this.fields['backgroundColor'] as any;
                if (field.colorPicker) {
                    field.colorPicker.value = isMixed ? '#ffffff' : value;
                }
                if (field.colorPreview) {
                    field.colorPreview.style.backgroundColor = isMixed ? 'transparent' : value;
                }
                
                const { value: opacity, isMixed: opacityMixed } = getMixedValue(n => {
                    if ((n as any).color instanceof Float32Array) {
                        return Math.round((n as any).color[3] * 100);
                    }
                    return Math.round((n.style.backgroundColor?.[3] ?? 1) * 100);
                });
                if (field.opacityInput) {
                    field.opacityInput.value = opacityMixed ? 'Mixed' : opacity + '%';
                }
            }

            // 5.1 更新圆角 (Radius)
            if (this.fields['borderRadius']) {
                const { value, isMixed } = getMixedValue(n => {
                    if (Array.isArray(n.style.borderRadius)) return n.style.borderRadius[0];
                    return n.style.borderRadius || 0;
                });
                this.fields['borderRadius'].value = isMixed ? '' : value.toString();
                this.fields['borderRadius'].placeholder = isMixed ? 'Mixed' : '';
            }
            
            // 更新分项圆角
            ['borderRadiusTL', 'borderRadiusTR', 'borderRadiusBR', 'borderRadiusBL'].forEach((key, i) => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValue(n => {
                        if (Array.isArray(n.style.borderRadius)) return n.style.borderRadius[i];
                        return n.style.borderRadius || 0;
                    });
                    this.fields[key].value = isMixed ? '' : value.toString();
                    this.fields[key].placeholder = isMixed ? 'Mixed' : '';
                }
            });

            // 6. 更新边框 (Stroke)
            if (this.fields['borderWidth']) {
                const { value, isMixed } = getMixedValue(n => n.style.borderWidth || 0);
                this.fields['borderWidth'].value = isMixed ? '' : value.toString();
                this.fields['borderWidth'].placeholder = isMixed ? 'Mixed' : '';
            }

            if (this.fields['borderColor']) {
                const { value, isMixed } = getMixedValue(n => this.rgbaToHex(n.style.borderColor || [0,0,0,0]));
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
                const { value, isMixed } = getMixedValue(n => n.style.strokeType || 'inner');
                this.fields['strokeType'].value = isMixed ? '' : value;
            }

            if (this.fields['strokeStyle']) {
                const { value, isMixed } = getMixedValue(n => n.style.strokeStyle || 'solid');
                this.fields['strokeStyle'].value = isMixed ? '' : value;
            }

            if (this.fields['strokeDash']) {
                const { value, isMixed } = getMixedValue(n => n.style.strokeDashArray?.[0] || 0);
                this.fields['strokeDash'].value = isMixed ? '' : value.toString();
                this.fields['strokeDash'].placeholder = isMixed ? 'Mixed' : '';
            }

            if (this.fields['strokeGap']) {
                const { value, isMixed } = getMixedValue(n => n.style.strokeDashArray?.[1] || 0);
                this.fields['strokeGap'].value = isMixed ? '' : value.toString();
                this.fields['strokeGap'].placeholder = isMixed ? 'Mixed' : '';
            }

            // 6.1 更新特效 (Effects)
            if (this.fields['layerBlur']) {
                const { value, isMixed } = getMixedValue(n => n.effects.layerBlur || 0);
                this.fields['layerBlur'].value = isMixed ? '' : value.toString();
                this.fields['layerBlur'].placeholder = isMixed ? 'Mixed' : '';
            }

            if (this.fields['backgroundBlur']) {
                const { value, isMixed } = getMixedValue(n => n.effects.backgroundBlur || 0);
                this.fields['backgroundBlur'].value = isMixed ? '' : value.toString();
                this.fields['backgroundBlur'].placeholder = isMixed ? 'Mixed' : '';
            }

            // Outer Shadow
            if (this.fields['outerShadowColor']) {
                const { value, isMixed } = getMixedValue(n => this.rgbaToHex(n.effects.outerShadow?.color || [0,0,0,0]));
                this.fields['outerShadowColor'].value = isMixed ? 'Mixed' : value;
            }
            ['outerShadowX', 'outerShadowY', 'outerShadowBlur', 'outerShadowSpread'].forEach(key => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValue(n => {
                        const s = n.effects.outerShadow;
                        if (!s) return 0;
                        switch(key) {
                            case 'outerShadowX': return s.offsetX;
                            case 'outerShadowY': return s.offsetY;
                            case 'outerShadowBlur': return s.blur;
                            case 'outerShadowSpread': return s.spread || 0;
                            default: return 0;
                        }
                    });
                    this.fields[key].value = isMixed ? '' : value.toString();
                    this.fields[key].placeholder = isMixed ? 'Mixed' : '';
                }
            });

            // Inner Shadow
            if (this.fields['innerShadowColor']) {
                const { value, isMixed } = getMixedValue(n => this.rgbaToHex(n.effects.innerShadow?.color || [0,0,0,0]));
                this.fields['innerShadowColor'].value = isMixed ? 'Mixed' : value;
            }
            ['innerShadowX', 'innerShadowY', 'innerShadowBlur', 'innerShadowSpread'].forEach(key => {
                if (this.fields[key]) {
                    const { value, isMixed } = getMixedValue(n => {
                        const s = n.effects.innerShadow;
                        if (!s) return 0;
                        switch(key) {
                            case 'innerShadowX': return s.offsetX;
                            case 'innerShadowY': return s.offsetY;
                            case 'innerShadowBlur': return s.blur;
                            case 'innerShadowSpread': return s.spread || 0;
                            default: return 0;
                        }
                    });
                    this.fields[key].value = isMixed ? '' : value.toString();
                    this.fields[key].placeholder = isMixed ? 'Mixed' : '';
                }
            });

            // 7. 更新约束 (Constraints)
            const hConstraintField = this.fields['constraints.horizontal'] as unknown as HTMLSelectElement;
            const vConstraintField = this.fields['constraints.vertical'] as unknown as HTMLSelectElement;
            if (hConstraintField && vConstraintField) {
                const { value: hVal, isMixed: hMixed } = getMixedValue(n => n.style.constraints?.horizontal || 'min');
                const { value: vVal, isMixed: vMixed } = getMixedValue(n => n.style.constraints?.vertical || 'min');
                
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

    private applyChange(key: string, value: string, type: 'number' | 'color' | 'text') {
        if (this.selectedNodes.size === 0) return;
        if (value === 'Mixed' || value === '') return;

        this.selectedNodes.forEach(node => {
            if (type === 'number') {
                const num = parseFloat(value);
                if (isNaN(num)) return;

                switch (key) {
                    case 'x': node.setPosition(num, node.y); break;
                    case 'y': node.setPosition(node.x, num); break;
                    case 'width': node.width = num; break;
                    case 'height': node.height = num; break;
                    case 'rotation': node.rotation = num * Math.PI / 180; break;
                    case 'scaleX': node.setTransform(node.x, node.y, num, node.scaleY); break;
                    case 'scaleY': node.setTransform(node.x, node.y, node.scaleX, num); break;
                    case 'borderRadius': node.style.borderRadius = num; break;
                    case 'borderWidth': node.style.borderWidth = num; break;
                    case 'backgroundBlur': node.effects.backgroundBlur = num; break;
                    case 'layerBlur': node.effects.layerBlur = num; break;
                    case 'borderRadiusTL': 
                        if (!Array.isArray(node.style.borderRadius)) node.style.borderRadius = [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                        (node.style.borderRadius as number[])[0] = num;
                        break;
                    case 'borderRadiusTR': 
                        if (!Array.isArray(node.style.borderRadius)) node.style.borderRadius = [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                        (node.style.borderRadius as number[])[1] = num;
                        break;
                    case 'borderRadiusBR': 
                        if (!Array.isArray(node.style.borderRadius)) node.style.borderRadius = [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                        (node.style.borderRadius as number[])[2] = num;
                        break;
                    case 'borderRadiusBL': 
                        if (!Array.isArray(node.style.borderRadius)) node.style.borderRadius = [node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0, node.style.borderRadius || 0];
                        (node.style.borderRadius as number[])[3] = num;
                        break;
                    case 'outerShadowX': if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.outerShadow.offsetX = num; break;
                    case 'outerShadowY': if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.outerShadow.offsetY = num; break;
                    case 'outerShadowBlur': if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.outerShadow.blur = num; break;
                    case 'outerShadowSpread': if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.outerShadow.spread = num; break;
                    case 'innerShadowX': if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.innerShadow.offsetX = num; break;
                    case 'innerShadowY': if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.innerShadow.offsetY = num; break;
                    case 'innerShadowBlur': if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.innerShadow.blur = num; break;
                    case 'innerShadowSpread': if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0,0,0,0.5], blur: 5, offsetX: 0, offsetY: 0 }; node.effects.innerShadow.spread = num; break;
                    case 'strokeDash':
                        if (!node.style.strokeDashArray) node.style.strokeDashArray = [num, 0];
                        else node.style.strokeDashArray[0] = num;
                        break;
                    case 'strokeGap':
                        if (!node.style.strokeDashArray) node.style.strokeDashArray = [0, num];
                        else node.style.strokeDashArray[1] = num;
                        break;
                    // ... 其他 number 属性
                }
            } else if (type === 'color') {
                const rgba = this.hexToRgba(value);
                if (!rgba) return;
                const opacityInput = (this.fields[key] as any).opacityInput;
                if (opacityInput && opacityInput.value !== 'Mixed') {
                    let opacity = parseInt(opacityInput.value) / 100;
                    if (!isNaN(opacity)) rgba[3] = Math.max(0, Math.min(1, opacity));
                }

                switch (key) {
                    case 'backgroundColor':
                        node.style.backgroundColor = rgba;
                        if ((node as any).color instanceof Float32Array) {
                            (node as any).color = new Float32Array(rgba);
                            node.invalidate();
                        }
                        if ((node as any).fillStyle !== undefined) {
                            (node as any).fillStyle = value;
                            (node as any)._contentDirty = true;
                            node.invalidate();
                        }
                        break;
                    case 'borderColor': node.style.borderColor = rgba; break;
                    case 'outerShadowColor':
                        if (!node.effects.outerShadow) node.effects.outerShadow = { color: rgba, blur: 5, offsetX: 0, offsetY: 0 };
                        else node.effects.outerShadow.color = rgba;
                        break;
                    case 'innerShadowColor':
                        if (!node.effects.innerShadow) node.effects.innerShadow = { color: rgba, blur: 5, offsetX: 0, offsetY: 0 };
                        else node.effects.innerShadow.color = rgba;
                        break;
                    // ... 其他 color 属性
                }
            } else if (type === 'text') {
                switch (key) {
                    case 'name': node.name = value; break;
                    case 'textContent':
                        if ((node as any).text !== undefined) {
                            (node as any).text = value;
                            (node as any)._contentDirty = true;
                        } else if ((node as any).content !== undefined) {
                            (node as any).content = value;
                            (node as any)._contentDirty = true;
                        }
                        break;
                    case 'textureUrl':
                        if ((node as any).textureUrl !== undefined) {
                            (node as any).textureUrl = value;
                        }
                        break;
                    case 'strokeType': node.style.strokeType = value as any; break;
                    case 'strokeStyle': node.style.strokeStyle = value as any; break;
                }
            }
            node.invalidate();
        });

        if (this.onPropertyChange) {
            this.onPropertyChange();
        }
    }

    private rgbaToHex(rgba: [number, number, number, number]): string {
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
