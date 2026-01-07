import { mat3, vec2 } from 'gl-matrix';
import { MemoryTracker, MemoryCategory } from '../utils/MemoryProfiler';

export class Transform {
    public x: number = 0;
    public y: number = 0;
    public scaleX: number = 1;
    public scaleY: number = 1;
    public rotation: number = 0;

    /** 
     * 本地矩阵。
     * 使用 Float32Array 存储 9 个元素。
     * 初始为 null，按需创建以节省内存。
     */
    private _localMatrix: mat3 | null = null;
    /** 
     * 世界矩阵。
     * 初始为 null，按需创建。
     */
    private _worldMatrix: mat3 | null = null;

    public get localMatrix(): mat3 {
        if (!this._localMatrix) {
            this._localMatrix = mat3.create();
            if (this.ownerId !== -1) {
                MemoryTracker.getInstance().track(
                    MemoryCategory.CPU_TYPED_ARRAY,
                    `Node_${this.ownerId}_localMatrix`,
                    9 * 4,
                    `Node ${this.ownerId} Local Matrix`
                );
            }
        }
        return this._localMatrix;
    }

    public get worldMatrix(): mat3 {
        if (!this._worldMatrix) {
            this._worldMatrix = mat3.create();
            if (this.ownerId !== -1) {
                MemoryTracker.getInstance().track(
                    MemoryCategory.CPU_TYPED_ARRAY,
                    `Node_${this.ownerId}_worldMatrix`,
                    9 * 4,
                    `Node ${this.ownerId} World Matrix`
                );
            }
        }
        return this._worldMatrix;
    }

    public dirty: boolean = true;
    
    // 缓存父矩阵版本号，避免不必要的更新
    public parentVersion: number = -1;
    public version: number = 0;

    private ownerId: number;

    constructor(ownerId: number = -1) {
        this.ownerId = ownerId;
    }

    // Setters that trigger dirty flag
    setPosition(x: number, y: number) {
        if (this.x !== x || this.y !== y) {
            this.x = x;
            this.y = y;
            this.dirty = true;
        }
    }

    setScale(x: number, y: number) {
        if (this.scaleX !== x || this.scaleY !== y) {
            this.scaleX = x;
            this.scaleY = y;
            this.dirty = true;
        }
    }

    setRotation(rad: number) {
        if (this.rotation !== rad) {
            this.rotation = rad;
            this.dirty = true;
        }
    }

    updateLocalTransform() {
        if (this.dirty) {
            const m = this.localMatrix;
            mat3.identity(m);
            // 手动内联矩阵变换以获得最高性能并减少临时向量创建
            const c = Math.cos(this.rotation);
            const s = Math.sin(this.rotation);
            
            m[0] = c * this.scaleX;
            m[1] = s * this.scaleX;
            m[3] = -s * this.scaleY;
            m[4] = c * this.scaleY;
            m[6] = this.x;
            m[7] = this.y;

            this.version++;
            this.dirty = false;
        }
    }

    updateWorldTransform(parentWorldMatrix: mat3 | null) {
        if (parentWorldMatrix) {
            mat3.multiply(this.worldMatrix, parentWorldMatrix, this.localMatrix);
        } else {
            mat3.copy(this.worldMatrix, this.localMatrix);
        }
    }
}
