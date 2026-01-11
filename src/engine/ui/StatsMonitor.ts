import { Engine } from '../system/Engine';
import { MemoryTracker } from '../utils/MemoryProfiler';

/**
 * Performance Stats & Debug Tools
 * 
 * Provides a real-time performance monitor overlay.
 */
export class StatsMonitor {
    private engine: Engine;
    private container: HTMLDivElement;
    private lastUpdateTime: number = 0;
    private totalNodes: number = 0;
    private rafId: number | null = null;

    /**
     * Creates an instance of StatsMonitor.
     * @param engine The engine instance to monitor.
     */
    constructor(engine: Engine) {
        this.engine = engine;
        this.container = this.createContainer();
        document.body.appendChild(this.container);
        this.start();
    }

    /**
     * Creates the UI container for the stats monitor.
     * @returns The HTMLDivElement container.
     */
    private createContainer(): HTMLDivElement {
        const statsContainer = document.createElement('div');
        statsContainer.style.position = 'absolute';
        statsContainer.style.bottom = '10px';
        statsContainer.style.left = '10px';
        statsContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        statsContainer.style.color = '#00ff00';
        statsContainer.style.padding = '10px';
        statsContainer.style.fontFamily = 'monospace';
        statsContainer.style.fontSize = '12px';
        statsContainer.style.pointerEvents = 'none';
        statsContainer.style.zIndex = '1000';
        return statsContainer;
    }

    /**
     * Starts the update loop.
     */
    private start() {
        const update = (time: number) => {
            this.update(time);
            this.rafId = requestAnimationFrame(update);
        };
        this.rafId = requestAnimationFrame(update);
    }

    /**
     * Stops the update loop.
     */
    public stop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * Updates the performance stats UI.
     * @param time The current timestamp.
     */
    private update(time: number) {
        // Update UI every 300ms instead of every frame
        if (time - this.lastUpdateTime < 300) {
            return;
        }
        this.lastUpdateTime = time;

        const glStats = this.engine.renderer.stats;
        const smooth = glStats.smoothTimes;
        const scene = this.engine.scene;
        const memTracker = MemoryTracker.getInstance();
        const memStats = memTracker.getStats();

        // Recount nodes occasionally or if it's the first time
        if (this.totalNodes === 0 || Math.random() < 0.05) {
            this.totalNodes = 0;
            scene.traverse(() => this.totalNodes++);
        }

        this.container.innerHTML = `
            <div style="font-weight: bold; color: #fff; margin-bottom: 5px;">Performance Monitor</div>
            FPS: ${glStats.lastFPS}<br>
            Total Nodes: ${this.totalNodes}<br>
            Draw Calls: ${glStats.drawCalls}<br>
            Quads: ${glStats.quadCount}<br>
            <hr style="border: 0; border-top: 1px solid #444; margin: 5px 0;">
            <div style="font-weight: bold; color: #fff; margin-bottom: 2px;">Memory Usage</div>
            <div style="color: #00ffff;">Total: ${MemoryTracker.formatBytes(memStats.totalBytes)}</div>
            GPU Tex: ${MemoryTracker.formatBytes(memStats.totalByGroup['GPU Texture'] || 0)}<br>
            GPU Buf: ${MemoryTracker.formatBytes(memStats.totalByGroup['GPU Buffer'] || 0)}<br>
            CPU Canvas: ${MemoryTracker.formatBytes(memStats.totalByGroup['CPU Canvas'] || 0)}<br>
            CPU Array: ${MemoryTracker.formatBytes(memStats.totalByGroup['CPU TypedArray'] || 0)}<br>
            <hr style="border: 0; border-top: 1px solid #444; margin: 5px 0;">
            <div style="font-weight: bold; color: #fff; margin-bottom: 2px;">Timing (ms)</div>
            WebGL Render: ${smooth.renderWebGL.toFixed(2)}<br>
            Flush (GPU): ${smooth.flush.toFixed(2)}<br>
            Canvas 2D: ${smooth.canvas2D.toFixed(2)}<br>
            Logic: ${smooth.logic.toFixed(2)}<br>
            Interaction to Render: ${smooth.interactionToRender.toFixed(2)}<br>
            <div style="color: #ffff00; margin-top: 2px;">Total: ${smooth.total.toFixed(2)}</div>
        `;
    }

    /**
     * Disposes of the stats monitor and removes its UI.
     */
    public dispose() {
        this.stop();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
