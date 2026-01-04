import { mat3, vec2 } from 'gl-matrix';

export class Transform {
    public position: vec2 = vec2.fromValues(0, 0);
    public scale: vec2 = vec2.fromValues(1, 1);
    public rotation: number = 0;

    public localMatrix: mat3 = mat3.create();
    public worldMatrix: mat3 = mat3.create();

    public dirty: boolean = true;
    
    // 缓存父矩阵版本号，避免不必要的更新
    public parentVersion: number = -1;
    public version: number = 0;

    constructor() {
        // Init
    }

    // Setters that trigger dirty flag
    setPosition(x: number, y: number) {
        if (this.position[0] !== x || this.position[1] !== y) {
            this.position[0] = x;
            this.position[1] = y;
            this.dirty = true;
        }
    }

    setScale(x: number, y: number) {
        if (this.scale[0] !== x || this.scale[1] !== y) {
            this.scale[0] = x;
            this.scale[1] = y;
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
            mat3.identity(this.localMatrix);
            mat3.translate(this.localMatrix, this.localMatrix, this.position);
            mat3.rotate(this.localMatrix, this.localMatrix, this.rotation);
            mat3.scale(this.localMatrix, this.localMatrix, this.scale);
            this.version++;
            this.dirty = false;
        }
    }

    updateWorldTransform(parentWorldMatrix: mat3 | null) {
        // 如果是根节点，或者父节点矩阵已更新，或者自身已更新，则重新计算世界矩阵
        // 这里简化处理：始终计算。更严格的优化需要传递父节点的版本号。
        // 为了配合 Node 层的递归优化，这里只负责数学计算。
        if (parentWorldMatrix) {
            mat3.multiply(this.worldMatrix, parentWorldMatrix, this.localMatrix);
        } else {
            mat3.copy(this.worldMatrix, this.localMatrix);
        }
    }
}
