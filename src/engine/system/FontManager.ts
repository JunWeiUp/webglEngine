
export interface FontConfig {
    name: string;
    family: string;
    isCustom?: boolean;
}

export class FontManager {
    private static instance: FontManager;
    private customFonts: FontConfig[] = [];
    private readonly STORAGE_KEY = 'webgl_engine_font_preference';
    private readonly CUSTOM_FONTS_KEY = 'webgl_engine_custom_fonts';
    private listeners: ((family: string) => void)[] = [];

    public readonly standardFonts: FontConfig[] = [
        { name: '微软雅黑', family: '"Microsoft YaHei", sans-serif' },
        { name: '黑体', family: 'SimHei, sans-serif' },
        { name: '宋体', family: 'SimSun, serif' },
        { name: '楷体', family: 'KaiTi, serif' },
        { name: 'Arial', family: 'Arial, sans-serif' },
        { name: 'Inter', family: 'Inter, sans-serif' }
    ];

    private constructor() {
        this.loadCustomFontsFromStorage();
    }

    public static getInstance(): FontManager {
        if (!FontManager.instance) {
            FontManager.instance = new FontManager();
        }
        return FontManager.instance;
    }

    public addChangeListener(listener: (family: string) => void) {
        this.listeners.push(listener);
    }

    public removeChangeListener(listener: (family: string) => void) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    private notifyListeners(family: string) {
        this.listeners.forEach(l => l(family));
    }

    public getAllFonts(): FontConfig[] {
        return [...this.standardFonts, ...this.customFonts];
    }

    public getCustomFonts(): FontConfig[] {
        return this.customFonts;
    }

    public async addCustomFont(name: string, file: File): Promise<void> {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!['ttf', 'otf', 'woff', 'woff2'].includes(extension || '')) {
            throw new Error('不支持的字体格式。请上传 TTF, OTF 或 WOFF 文件。');
        }

        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    const fontFace = new FontFace(name, arrayBuffer);
                    await fontFace.load();
                    (document.fonts as any).add(fontFace);

                    const fontConfig: FontConfig = { name, family: name, isCustom: true };
                    this.customFonts.push(fontConfig);
                    this.saveCustomFontsToStorage(name, arrayBuffer);
                    
                    // 自动切换到新上传的字体
                    this.savePreference(name);
                    
                    resolve();
                } catch (err) {
                    reject(new Error('字体加载失败: ' + err));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    public savePreference(family: string) {
        localStorage.setItem(this.STORAGE_KEY, family);
        this.notifyListeners(family);
    }

    public getPreference(): string {
        return localStorage.getItem(this.STORAGE_KEY) || this.standardFonts[0].family;
    }

    private loadCustomFontsFromStorage() {
        const stored = localStorage.getItem(this.CUSTOM_FONTS_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                // Note: Storing binary font data in LocalStorage is limited (5MB).
                // For a production app, IndexedDB would be better.
                // Here we just load the names and expect them to be available or re-uploaded.
                data.forEach((f: any) => {
                    this.customFonts.push({ name: f.name, family: f.name, isCustom: true });
                });
            } catch (e) {
                console.error('Failed to load custom fonts', e);
            }
        }
    }

    private saveCustomFontsToStorage(name: string, data: ArrayBuffer) {
        // Simple metadata storage for now
        const stored = JSON.parse(localStorage.getItem(this.CUSTOM_FONTS_KEY) || '[]');
        stored.push({ name });
        localStorage.setItem(this.CUSTOM_FONTS_KEY, JSON.stringify(stored));
    }
}
