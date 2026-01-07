import { Texture } from './Texture';
import { TextureManager } from '../utils/TextureManager';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

export class TextureAtlas {
    public textures: { [key: string]: Texture } = {};
    public baseTexture: Texture | null = null;

    constructor() {}

    static async load(gl: WebGL2RenderingContext, jsonUrl: string, imageUrl: string): Promise<TextureAtlas> {
        const atlas = new TextureAtlas();
        
        // Load Base Texture
        const baseTex = await TextureManager.loadTexture(gl, imageUrl);
        atlas.baseTexture = baseTex;

        // Load JSON
        const response = await fetch(jsonUrl);
        const data = await response.json();
        
        // Support both TexturePacker formats (Hash and Array)
        // We assume Hash for now or check
        let frames = data.frames;
        if (Array.isArray(frames)) {
            // Convert Array to Hash map for easier lookup
            const frameHash: any = {};
            for (const f of frames) {
                frameHash[f.filename] = f;
            }
            frames = frameHash;
        }
        
        const width = baseTex.width;
        const height = baseTex.height;

        // Parse frames
        for (const key in frames) {
            const frameData = frames[key];
            const rect = frameData.frame; // {x, y, w, h}
            
            // Calculate UVs
            // WebGL UVs are 0..1
            // TL, TR, BR, BL
            
            const u0 = rect.x / width;
            const v0 = rect.y / height;
            const u1 = (rect.x + rect.w) / width;
            const v1 = (rect.y + rect.h) / height;
            
            const uvs = new Float32Array([
                u0, v0, // TL
                u1, v0, // TR
                u1, v1, // BR
                u0, v1  // BL
            ]);
            
            MemoryTracker.getInstance().track(
                MemoryCategory.CPU_TYPED_ARRAY,
                `TextureAtlas_UV_${imageUrl}_${key}`,
                uvs.byteLength,
                `Atlas UV: ${key}`
            );
            
            const subTexture = new Texture(baseTex.baseTexture, rect.w, rect.h, uvs);
            atlas.textures[key] = subTexture;
        }
        
        return atlas;
    }
}
