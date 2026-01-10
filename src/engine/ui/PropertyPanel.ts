import { Node } from '../display/Node';
import { InteractionManager } from '../events/InteractionManager';
import { AuxiliaryLayer } from '../display/AuxiliaryLayer';
import { Renderer } from '../core/Renderer';

/**
 * 属性面板 (Property Panel)
 * 
 * 模仿 Figma 的属性栏，用于显示和编辑选中节点的属性。
 */
export class PropertyPanel {
    private container: HTMLElement;

    private currentNode: Node | null = null;

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
            backgroundColor: '#2c2c2c',
            color: '#e0e0e0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            fontSize: '11px',
            zIndex: '1001',
            boxSizing: 'border-box',
            borderLeft: '1px solid #444',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            userSelect: 'none'
        });
    }

    private initLayout() {
        const title = this.createSectionTitle('PROPERTIES');
        this.container.appendChild(title);

        // Selection Section
        const nameSection = this.createSection('Selection');
        this.addPropertyField(nameSection, 'Name', 'name', 'text');
        
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
        this.addPropertyField(transformSection, 'X', 'x', 'number');
        this.addPropertyField(transformSection, 'Y', 'y', 'number');
        this.addPropertyField(transformSection, 'W', 'width', 'number');
        this.addPropertyField(transformSection, 'H', 'height', 'number');
        this.addPropertyField(transformSection, 'R', 'rotation', 'number');
        this.addPropertyField(transformSection, 'SX', 'scaleX', 'number');
        this.addPropertyField(transformSection, 'SY', 'scaleY', 'number');
        this.container.appendChild(transformSection);

        // Appearance Section
        const appearanceSection = this.createSection('Appearance');
        this.addPropertyField(appearanceSection, 'Fill', 'backgroundColor', 'color');
        
        // Radius field with expand button
        const radiusContainer = this.addPropertyFieldWithAction(appearanceSection, 'Radius', 'borderRadius', 'number', 'corner-radius');
        
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

    private addPropertyFieldWithAction(parent: HTMLElement, label: string, key: string, type: 'number', action: string): HTMLElement {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';

        const labelEl = document.createElement('span');
        labelEl.innerText = label;
        labelEl.style.width = '45px';
        labelEl.style.color = '#888';
        labelEl.style.flexShrink = '0';
        labelEl.style.cursor = 'ew-resize';
        container.appendChild(labelEl);

        const inputWrapper = document.createElement('div');
        inputWrapper.style.flex = '1';
        inputWrapper.style.display = 'flex';
        inputWrapper.style.alignItems = 'center';
        inputWrapper.style.position = 'relative';
        container.appendChild(inputWrapper);

        const input = document.createElement('input');
        input.type = 'number';
        Object.assign(input.style, {
            flex: '1',
            width: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: '#fff',
            fontSize: '11px',
            padding: '4px 4px',
            outline: 'none',
            borderRadius: '2px',
            boxSizing: 'border-box'
        });

        input.addEventListener('focus', () => {
            input.style.backgroundColor = '#444';
            input.style.border = '1px solid #18a0fb';
        });

        input.addEventListener('blur', () => {
            input.style.backgroundColor = 'transparent';
            input.style.border = '1px solid transparent';
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
                    <path d="M2 4C2 2.89543 2.89543 2 4 2H8C9.10457 2 10 2.89543 10 4V8C10 9.10457 9.10457 10 8 10H4C2.89543 10 2 9.10457 2 8V4Z" stroke="#888" stroke-width="1"/>
                    <path d="M4 2V4M2 4H4" stroke="#888" stroke-width="1"/>
                    <path d="M8 2V4M10 4H8" stroke="#888" stroke-width="1"/>
                    <path d="M8 10V8M10 8H8" stroke="#888" stroke-width="1"/>
                    <path d="M4 10V8M2 8H4" stroke="#888" stroke-width="1"/>
                </svg>
            `;
            btn.style.width = '24px';
            btn.style.height = '24px';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.cursor = 'pointer';
            btn.style.marginLeft = '4px';
            btn.style.borderRadius = '2px';
            btn.addEventListener('mouseenter', () => btn.style.backgroundColor = '#444');
            btn.addEventListener('mouseleave', () => btn.style.backgroundColor = 'transparent');
            
            btn.addEventListener('click', () => {
                const individual = document.getElementById('individual-radius-container');
                if (individual) {
                    const isHidden = individual.style.display === 'none';
                    individual.style.display = isHidden ? 'grid' : 'none';
                    btn.style.backgroundColor = isHidden ? '#18a0fb33' : 'transparent';
                    const svgPath = btn.querySelectorAll('path');
                    svgPath.forEach(p => p.setAttribute('stroke', isHidden ? '#18a0fb' : '#888'));
                }
            });
            inputWrapper.appendChild(btn);
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
        container.style.gridTemplateColumns = 'repeat(4, 1fr)';
        container.style.gap = '8px';
        container.style.marginTop = '4px';

        configs.forEach(config => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.gap = '2px';

            const label = document.createElement('span');
            label.innerText = config.label;
            label.style.color = '#666';
            label.style.fontSize = '9px';
            label.style.cursor = 'ew-resize';
            item.appendChild(label);

            const input = document.createElement('input');
            input.type = 'number';
            Object.assign(input.style, {
                width: '100%',
                backgroundColor: '#383838',
                border: '1px solid transparent',
                color: '#fff',
                fontSize: '10px',
                padding: '2px 4px',
                outline: 'none',
                borderRadius: '2px',
                boxSizing: 'border-box'
            });

            input.addEventListener('focus', () => {
                input.style.border = '1px solid #18a0fb';
            });

            input.addEventListener('blur', () => {
                input.style.border = '1px solid transparent';
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
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(4, 1fr)';
        container.style.gap = '8px';
        container.style.marginTop = '4px';

        configs.forEach(config => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.gap = '2px';

            const label = document.createElement('span');
            label.innerText = config.label;
            label.style.color = '#666';
            label.style.fontSize = '9px';
            label.style.cursor = 'ew-resize';
            item.appendChild(label);

            const input = document.createElement('input');
            input.type = 'number';
            Object.assign(input.style, {
                width: '100%',
                backgroundColor: '#383838',
                border: '1px solid transparent',
                color: '#fff',
                fontSize: '10px',
                padding: '2px 4px',
                outline: 'none',
                borderRadius: '2px',
                boxSizing: 'border-box'
            });

            input.addEventListener('focus', () => {
                input.style.border = '1px solid #18a0fb';
            });

            input.addEventListener('blur', () => {
                input.style.border = '1px solid transparent';
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

        grid.appendChild(container);
    }

    private createSubHeader(text: string): HTMLElement {
        const subHeader = document.createElement('div');
        subHeader.innerText = text;
        subHeader.style.gridColumn = '1 / -1';
        subHeader.style.color = '#aaa';
        subHeader.style.fontSize = '10px';
        subHeader.style.marginTop = '8px';
        subHeader.style.marginBottom = '4px';
        subHeader.style.fontWeight = '500';
        return subHeader;
    }

    private createSection(title: string): HTMLElement {
        const section = document.createElement('div');
        section.style.padding = '12px 16px';
        section.style.borderBottom = '1px solid #444';

        const header = document.createElement('div');
        header.innerText = title;
        header.style.fontWeight = '600';
        header.style.marginBottom = '12px';
        header.style.color = '#888';
        header.style.textTransform = 'uppercase';
        header.style.letterSpacing = '0.05em';
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '8px 12px';
        section.appendChild(grid);

        (section as any).grid = grid;
        return section;
    }

    private createSectionTitle(text: string): HTMLElement {
        const title = document.createElement('div');
        title.innerText = text;
        title.style.padding = '12px 16px';
        title.style.fontWeight = 'bold';
        title.style.borderBottom = '1px solid #444';
        title.style.backgroundColor = '#333';
        title.style.color = '#fff';
        return title;
    }

    private addSelectField(parent: HTMLElement, label: string, key: string, options: string[]) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';

        const labelEl = document.createElement('span');
        labelEl.innerText = label;
        labelEl.style.width = '45px';
        labelEl.style.color = '#888';
        labelEl.style.flexShrink = '0';
        container.appendChild(labelEl);

        const select = document.createElement('select');
        Object.assign(select.style, {
            flex: '1',
            width: '100%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: '#fff',
            fontSize: '11px',
            padding: '3px 0px',
            outline: 'none',
            borderRadius: '2px',
            boxSizing: 'border-box',
            cursor: 'pointer'
        });

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = opt.charAt(0).toUpperCase() + opt.slice(1);
            option.style.backgroundColor = '#333';
            option.style.color = '#fff';
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            this.applyChange(key, select.value, 'text');
        });

        select.addEventListener('focus', () => {
            select.style.backgroundColor = '#444';
            select.style.border = '1px solid #18a0fb';
        });

        select.addEventListener('blur', () => {
            select.style.backgroundColor = 'transparent';
            select.style.border = '1px solid transparent';
        });

        container.appendChild(select);
        this.fields[key] = select as any;

        const grid = (parent as any).grid;
        if (grid) {
            grid.appendChild(container);
        } else {
            parent.appendChild(container);
        }
    }

    private addPropertyField(parent: HTMLElement, label: string, key: string, type: 'number' | 'color' | 'text') {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';

        const labelEl = document.createElement('span');
        labelEl.innerText = label;
        labelEl.style.width = '45px';
        labelEl.style.color = '#888';
        labelEl.style.flexShrink = '0';
        labelEl.style.cursor = type === 'number' ? 'ew-resize' : 'default';
        container.appendChild(labelEl);

        const inputWrapper = document.createElement('div');
        inputWrapper.style.flex = '1';
        inputWrapper.style.display = 'flex';
        inputWrapper.style.alignItems = 'center';
        inputWrapper.style.position = 'relative';
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
            color: '#fff',
            fontSize: '11px',
            padding: '4px 4px',
            outline: 'none',
            borderRadius: '2px',
            boxSizing: 'border-box'
        });

        input.addEventListener('focus', () => {
            input.style.backgroundColor = '#444';
            input.style.border = '1px solid #18a0fb';
        });

        input.addEventListener('blur', () => {
            input.style.backgroundColor = 'transparent';
            input.style.border = '1px solid transparent';
            this.applyChange(key, input.value, type);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
        });

        inputWrapper.appendChild(input);
        this.fields[key] = input;

        // Color Picker
        if (type === 'color') {
            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.style.width = '16px';
            colorPicker.style.height = '16px';
            colorPicker.style.padding = '0';
            colorPicker.style.border = 'none';
            colorPicker.style.backgroundColor = 'transparent';
            colorPicker.style.cursor = 'pointer';
            colorPicker.style.marginLeft = '4px';

            colorPicker.addEventListener('input', () => {
                input.value = colorPicker.value.toUpperCase();
                this.applyChange(key, input.value, 'color');
            });
            inputWrapper.appendChild(colorPicker);
            (input as any).colorPicker = colorPicker;

            // Opacity Input (Percentage)
            const opacityInput = document.createElement('input');
            opacityInput.type = 'text';
            opacityInput.placeholder = '100%';
            Object.assign(opacityInput.style, {
                width: '35px',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                color: '#888',
                fontSize: '10px',
                textAlign: 'right',
                outline: 'none',
                marginLeft: '4px',
                padding: '2px'
            });

            opacityInput.addEventListener('focus', () => {
                opacityInput.style.backgroundColor = '#444';
                opacityInput.style.color = '#fff';
            });

            opacityInput.addEventListener('blur', () => {
                opacityInput.style.backgroundColor = 'transparent';
                opacityInput.style.color = '#888';
                let val = parseInt(opacityInput.value);
                if (isNaN(val)) val = 100;
                val = Math.max(0, Math.min(100, val));
                opacityInput.value = val + '%';
                this.applyChange(key, input.value, 'color');
            });

            opacityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') opacityInput.blur();
            });

            inputWrapper.appendChild(opacityInput);
            (input as any).opacityInput = opacityInput;
        }

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
    }

    public updateNode(node: Node | null) {
        this.currentNode = node;
        if (!node) {
            this.container.style.display = 'none';
            return;
        }

        this.container.style.display = 'flex';
        this.syncFromNode();
    }

    private syncFromNode() {
        if (!this.currentNode) return;
        const node = this.currentNode;

        // Sync visibility of text content field
        const textContentContainer = document.getElementById('text-content-container');
        if (textContentContainer) {
            const isTextNode = (node as any).text !== undefined;
            textContentContainer.style.display = isTextNode ? 'block' : 'none';
            if (isTextNode && this.fields['textContent']) {
                this.fields['textContent'].value = (node as any).text || '';
            }
        }
        
        // Name
        if (this.fields['name']) this.fields['name'].value = node.name || '';

        // Transform
        if (this.fields['x']) this.fields['x'].value = Math.round(node.x).toString();
        if (this.fields['y']) this.fields['y'].value = Math.round(node.y).toString();
        if (this.fields['width']) this.fields['width'].value = Math.round(node.width).toString();
        if (this.fields['height']) this.fields['height'].value = Math.round(node.height).toString();
        if (this.fields['rotation']) this.fields['rotation'].value = Math.round(node.transform.rotation * 180 / Math.PI).toString();
        if (this.fields['scaleX']) this.fields['scaleX'].value = node.scaleX.toFixed(2);
        if (this.fields['scaleY']) this.fields['scaleY'].value = node.scaleY.toFixed(2);

        // Style
        if (this.fields['backgroundColor']) {
            const color = node.style.backgroundColor || [1, 1, 1, 1];
            const hex = this.rgbaToHex(color);
            this.fields['backgroundColor'].value = hex;
            if ((this.fields['backgroundColor'] as any).colorPicker) {
                (this.fields['backgroundColor'] as any).colorPicker.value = hex;
            }
            if ((this.fields['backgroundColor'] as any).opacityInput) {
                (this.fields['backgroundColor'] as any).opacityInput.value = Math.round(color[3] * 100) + '%';
            }
        }
        if (this.fields['borderRadius']) {
            const radius = node.style.borderRadius || 0;
            if (Array.isArray(radius)) {
                this.fields['borderRadius'].value = ''; // Mixed or custom
                if (this.fields['borderRadiusTL']) this.fields['borderRadiusTL'].value = radius[0].toString();
                if (this.fields['borderRadiusTR']) this.fields['borderRadiusTR'].value = radius[1].toString();
                if (this.fields['borderRadiusBR']) this.fields['borderRadiusBR'].value = radius[2].toString();
                if (this.fields['borderRadiusBL']) this.fields['borderRadiusBL'].value = radius[3].toString();
            } else {
                this.fields['borderRadius'].value = radius.toString();
                if (this.fields['borderRadiusTL']) this.fields['borderRadiusTL'].value = radius.toString();
                if (this.fields['borderRadiusTR']) this.fields['borderRadiusTR'].value = radius.toString();
                if (this.fields['borderRadiusBR']) this.fields['borderRadiusBR'].value = radius.toString();
                if (this.fields['borderRadiusBL']) this.fields['borderRadiusBL'].value = radius.toString();
            }
        }
        if (this.fields['borderColor']) {
            const color = node.style.borderColor || [0, 0, 0, 0];
            const hex = this.rgbaToHex(color);
            this.fields['borderColor'].value = hex;
            if ((this.fields['borderColor'] as any).colorPicker) {
                (this.fields['borderColor'] as any).colorPicker.value = hex;
            }
            if ((this.fields['borderColor'] as any).opacityInput) {
                (this.fields['borderColor'] as any).opacityInput.value = Math.round(color[3] * 100) + '%';
            }
        }
        if (this.fields['borderWidth']) {
            this.fields['borderWidth'].value = (node.style.borderWidth || 0).toString();
        }
        if (this.fields['strokeType']) {
            (this.fields['strokeType'] as any).value = node.style.strokeType || 'inner';
        }
        if (this.fields['strokeStyle']) {
            const style = node.style.strokeStyle || 'solid';
            (this.fields['strokeStyle'] as any).value = style;
            const dashContainer = document.getElementById('dash-settings-container');
            if (dashContainer) dashContainer.style.display = style === 'dashed' ? 'grid' : 'none';
        }
        if (this.fields['strokeDash']) {
            this.fields['strokeDash'].value = (node.style.strokeDashArray?.[0] ?? 10).toString();
        }
        if (this.fields['strokeGap']) {
            this.fields['strokeGap'].value = (node.style.strokeDashArray?.[1] ?? 5).toString();
        }

        // Effects
        if (this.fields['layerBlur']) {
            this.fields['layerBlur'].value = (node.effects.layerBlur || 0).toString();
        }
        if (this.fields['backgroundBlur']) {
            this.fields['backgroundBlur'].value = (node.effects.backgroundBlur || 0).toString();
        }

        // Outer Shadow sync
        if (this.fields['outerShadowColor']) {
            const color = node.effects.outerShadow?.color || [0, 0, 0, 0.25];
            const hex = this.rgbaToHex(color);
            this.fields['outerShadowColor'].value = hex;
            if ((this.fields['outerShadowColor'] as any).colorPicker) {
                (this.fields['outerShadowColor'] as any).colorPicker.value = hex;
            }
            if ((this.fields['outerShadowColor'] as any).opacityInput) {
                (this.fields['outerShadowColor'] as any).opacityInput.value = Math.round(color[3] * 100) + '%';
            }
        }
        if (this.fields['outerShadowX']) this.fields['outerShadowX'].value = (node.effects.outerShadow?.offsetX || 0).toString();
        if (this.fields['outerShadowY']) this.fields['outerShadowY'].value = (node.effects.outerShadow?.offsetY || 0).toString();
        if (this.fields['outerShadowBlur']) this.fields['outerShadowBlur'].value = (node.effects.outerShadow?.blur || 0).toString();
        if (this.fields['outerShadowSpread']) this.fields['outerShadowSpread'].value = (node.effects.outerShadow?.spread || 0).toString();

        // Inner Shadow sync
        if (this.fields['innerShadowColor']) {
            const color = node.effects.innerShadow?.color || [0, 0, 0, 0.25];
            const hex = this.rgbaToHex(color);
            this.fields['innerShadowColor'].value = hex;
            if ((this.fields['innerShadowColor'] as any).colorPicker) {
                (this.fields['innerShadowColor'] as any).colorPicker.value = hex;
            }
            if ((this.fields['innerShadowColor'] as any).opacityInput) {
                (this.fields['innerShadowColor'] as any).opacityInput.value = Math.round(color[3] * 100) + '%';
            }
        }
        if (this.fields['innerShadowX']) this.fields['innerShadowX'].value = (node.effects.innerShadow?.offsetX || 0).toString();
        if (this.fields['innerShadowY']) this.fields['innerShadowY'].value = (node.effects.innerShadow?.offsetY || 0).toString();
        if (this.fields['innerShadowBlur']) this.fields['innerShadowBlur'].value = (node.effects.innerShadow?.blur || 0).toString();
        if (this.fields['innerShadowSpread']) this.fields['innerShadowSpread'].value = (node.effects.innerShadow?.spread || 0).toString();
    }

    private applyChange(key: string, value: string, type: 'number' | 'color' | 'text') {
        if (!this.currentNode) return;
        const node = this.currentNode;

        if (type === 'number') {
            const num = parseFloat(value);
            if (isNaN(num)) return;

            switch (key) {
                case 'x': node.transform.setPosition(num, node.y); break;
                case 'y': node.transform.setPosition(node.x, num); break;
                case 'width': node.width = num; break;
                case 'height': node.height = num; break;
                case 'rotation': node.transform.setRotation(num * Math.PI / 180); break;
                case 'scaleX': node.transform.setScale(num, node.scaleY); break;
                case 'scaleY': node.transform.setScale(node.scaleX, num); break;
                case 'borderRadius': node.style.borderRadius = num; break;
                case 'borderRadiusTL':
                case 'borderRadiusTR':
                case 'borderRadiusBR':
                case 'borderRadiusBL':
                    if (!Array.isArray(node.style.borderRadius)) {
                        const r = node.style.borderRadius || 0;
                        node.style.borderRadius = [r, r, r, r];
                    }
                    if (key === 'borderRadiusTL') (node.style.borderRadius as any)[0] = num;
                    if (key === 'borderRadiusTR') (node.style.borderRadius as any)[1] = num;
                    if (key === 'borderRadiusBR') (node.style.borderRadius as any)[2] = num;
                    if (key === 'borderRadiusBL') (node.style.borderRadius as any)[3] = num;
                    break;
                case 'borderWidth': node.style.borderWidth = num; break;
                case 'strokeDash':
                case 'strokeGap':
                    if (!node.style.strokeDashArray) node.style.strokeDashArray = [10, 5];
                    if (key === 'strokeDash') node.style.strokeDashArray[0] = num;
                    if (key === 'strokeGap') node.style.strokeDashArray[1] = num;
                    break;
                case 'backgroundBlur': node.effects.backgroundBlur = num; break;
                case 'layerBlur': node.effects.layerBlur = num; break;
                
                // Outer Shadow
                case 'outerShadowX': 
                    if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.outerShadow.offsetX = num; 
                    break;
                case 'outerShadowY': 
                    if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.outerShadow.offsetY = num; 
                    break;
                case 'outerShadowBlur': 
                    if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.outerShadow.blur = num; 
                    break;
                case 'outerShadowSpread': 
                    if (!node.effects.outerShadow) node.effects.outerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.outerShadow.spread = num; 
                    break;

                // Inner Shadow
                case 'innerShadowX': 
                    if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.innerShadow.offsetX = num; 
                    break;
                case 'innerShadowY': 
                    if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.innerShadow.offsetY = num; 
                    break;
                case 'innerShadowBlur': 
                    if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.innerShadow.blur = num; 
                    break;
                case 'innerShadowSpread': 
                    if (!node.effects.innerShadow) node.effects.innerShadow = { color: [0, 0, 0, 0.5], blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.innerShadow.spread = num; 
                    break;
            }
        } else if (type === 'color') {
            const rgba = this.hexToRgba(value);
            if (!rgba) return;

            // Apply opacity from input if available
            const opacityInput = (this.fields[key] as any).opacityInput;
            if (opacityInput) {
                let opacity = parseInt(opacityInput.value) / 100;
                if (isNaN(opacity)) opacity = 1.0;
                rgba[3] = Math.max(0, Math.min(1, opacity));
            }

            switch (key) {
                case 'backgroundColor': node.style.backgroundColor = rgba; break;
                case 'borderColor': node.style.borderColor = rgba; break;
                case 'outerShadowColor':
                    if (!node.effects.outerShadow) node.effects.outerShadow = { color: rgba, blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.outerShadow.color = rgba;
                    break;
                case 'innerShadowColor':
                    if (!node.effects.innerShadow) node.effects.innerShadow = { color: rgba, blur: 5, offsetX: 0, offsetY: 0 };
                    node.effects.innerShadow.color = rgba;
                    break;
            }

            // Sync color picker
            if ((this.fields[key] as any).colorPicker) {
                (this.fields[key] as any).colorPicker.value = value;
            }
        } else if (type === 'text') {
            switch (key) {
                case 'name': node.name = value; break;
                case 'textContent':
                    if ((node as any).text !== undefined) {
                        (node as any).text = value;
                        if (typeof (node as any).updateTexture === 'function') {
                            // Text 节点通常有 updateTexture 或设置脏标记
                            (node as any)._contentDirty = true;
                        }
                    }
                    break;
                case 'strokeType': node.style.strokeType = value as any; break;
                case 'strokeStyle': 
                    node.style.strokeStyle = value as any;
                    const dashContainer = document.getElementById('dash-settings-container');
                    if (dashContainer) dashContainer.style.display = value === 'dashed' ? 'grid' : 'none';
                    break;
            }
        }

        node.invalidate();
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
