import { loadYoga, type Yoga } from 'yoga-layout/load';

/**
 * LayoutManager 负责初始化 Yoga 布局引擎
 */
export class LayoutManager {
    private static _instance: LayoutManager;
    private _yoga: Yoga | null = null;
    private _isInitialized = false;

    private constructor() {}

    public static getInstance(): LayoutManager {
        if (!LayoutManager._instance) {
            LayoutManager._instance = new LayoutManager();
        }
        return LayoutManager._instance;
    }

    /**
     * 初始化 Yoga 引擎
     */
    public async init(): Promise<void> {
        if (this._isInitialized) return;
        
        console.log('[LayoutManager] Starting Yoga initialization...');
        try {
            this._yoga = await loadYoga();
            this._isInitialized = true;
            console.log('[LayoutManager] Yoga layout engine initialized successfully.');
        } catch (error) {
            console.error('[LayoutManager] Failed to initialize Yoga WASM:', error);
            throw error;
        }
    }

    public get yoga(): Yoga | null {
        return this._yoga;
    }

    public get isInitialized(): boolean {
        return this._isInitialized;
    }
}
