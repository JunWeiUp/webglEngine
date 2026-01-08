import { Renderer } from '../core/Renderer';

/**
 * PerfHUD - 性能监控辅助层
 * 实时显示渲染各项耗时统计
 */
export class PerfHUD {
    private container: HTMLDivElement;
    private statsContent: HTMLDivElement;
    private renderer: Renderer;

    constructor(parent: HTMLElement, renderer: Renderer) {
        this.renderer = renderer;

        // 创建容器
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #0f0;
            padding: 8px;
            font-family: monospace;
            font-size: 12px;
            pointer-events: none;
            border-radius: 4px;
            border: 1px solid #333;
            z-index: 1000;
            min-width: 180px;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        `;

        this.statsContent = document.createElement('div');
        this.container.appendChild(this.statsContent);
        parent.appendChild(this.container);

        // 启动定时更新
        this.update();
    }

    private update = () => {
        const stats = this.renderer.stats;
        const smooth = stats.smoothTimes;

        this.statsContent.innerHTML = `
            <div style="color: #fff; font-weight: bold; margin-bottom: 5px; border-bottom: 1px solid #555;">PERFORMANCE HUD</div>
            <div style="color: ${stats.lastFPS < 50 ? '#f00' : '#0f0'}">FPS: ${stats.lastFPS}</div>
            <div style="margin-top: 5px;">DrawCalls: ${stats.drawCalls}</div>
            <div>Quads: ${stats.quadCount}</div>
            <div style="margin-top: 5px; color: #aaa;">Times (ms):</div>
            <div style="padding-left: 5px;">
                Transform: ${smooth.transform.toFixed(2)}<br/>
                Render: ${smooth.renderWebGL.toFixed(2)}<br/>
                Flush: ${smooth.flush.toFixed(2)}<br/>
                Logic: ${smooth.logic.toFixed(2)}<br/>
                NodeTransform: ${stats.times.nodeTransform.toFixed(2)}<br/>
                HitTest: ${smooth.hitTest.toFixed(2)}<br/>
                BoxSelect: ${smooth.boxSelect.toFixed(2)}<br/>
                <div style="color: #fff; border-top: 1px solid #444; margin-top: 3px;">
                    Total: ${smooth.total.toFixed(2)}
                </div>
            </div>
        `;

        requestAnimationFrame(this.update);
    };

    public setVisible(visible: boolean) {
        this.container.style.display = visible ? 'block' : 'none';
    }
}
