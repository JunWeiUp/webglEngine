/**
 * 内存分析工具
 * 用于追踪 GPU (纹理、缓冲区) 和 CPU (类型化数组、Canvas) 的内存占用情况。
 */
export const MemoryCategory = {
    GPU_TEXTURE: 'GPU Texture',
    GPU_BUFFER: 'GPU Buffer',
    CPU_TYPED_ARRAY: 'CPU TypedArray',
    CPU_CANVAS: 'CPU Canvas'
} as const;

export type MemoryCategory = typeof MemoryCategory[keyof typeof MemoryCategory];

export interface MemoryStats {
    category: MemoryCategory;
    name: string;
    bytes: number;
}

export class MemoryTracker {
    private static instance: MemoryTracker;
    private records: Map<string, MemoryStats> = new Map();
    // 新增：类别总计，用于高性能追踪海量对象
    private totals: Record<string, number> = {};

    private constructor() {}

    public static getInstance(): MemoryTracker {
        if (!MemoryTracker.instance) {
            MemoryTracker.instance = new MemoryTracker();
        }
        return MemoryTracker.instance;
    }

    /**
     * 记录或更新内存占用
     * @param category 类别
     * @param id 唯一标识符
     * @param bytes 字节数
     * @param name 可读名称
     */
    public track(category: MemoryCategory, id: string, bytes: number, name?: string) {
        this.records.set(id, {
            category,
            name: name || id,
            bytes
        });
    }

    /**
     * 移除内存记录
     * @param id 唯一标识符
     */
    public untrack(id: string) {
        this.records.delete(id);
    }

    /**
     * 高性能内存追踪（仅累加，不存储 ID）
     * 适用于数万个小对象的场景
     */
    public trackCount(category: MemoryCategory, bytes: number) {
        this.totals[category] = (this.totals[category] || 0) + bytes;
    }

    /**
     * 获取所有统计信息
     */
    public getStats() {
        const totalByGroup: Record<string, number> = { ...this.totals };
        let totalBytes = 0;

        // 加上 totals 的部分
        Object.values(this.totals).forEach(b => totalBytes += b);

        const details: MemoryStats[] = [];

        this.records.forEach((stat) => {
            totalByGroup[stat.category] = (totalByGroup[stat.category] || 0) + stat.bytes;
            totalBytes += stat.bytes;
            details.push(stat);
        });

        return {
            totalByGroup,
            totalBytes,
            details
        };
    }

    /**
     * 格式化字节数为可读字符串
     */
    public static formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 打印当前内存摘要到控制台
     */
    public printSummary() {
        const stats = this.getStats();
        console.log('--- Memory Usage Summary ---');
        Object.entries(stats.totalByGroup).forEach(([category, bytes]) => {
            console.log(`${category}: ${MemoryTracker.formatBytes(bytes)}`);
        });
        console.log(`Total: ${MemoryTracker.formatBytes(stats.totalBytes)}`);
        console.log('----------------------------');
    }
}
