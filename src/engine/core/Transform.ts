import { mat3, vec2 } from 'gl-matrix';

export class Transform {
    public position: vec2 = vec2.fromValues(0, 0);
    public scale: vec2 = vec2.fromValues(1, 1);
    public rotation: number = 0;

    public localMatrix: mat3 = mat3.create();
    public worldMatrix: mat3 = mat3.create();

    public dirty: boolean = true;

    updateLocalTransform() {
        mat3.identity(this.localMatrix);
        mat3.translate(this.localMatrix, this.localMatrix, this.position);
        mat3.rotate(this.localMatrix, this.localMatrix, this.rotation);
        mat3.scale(this.localMatrix, this.localMatrix, this.scale);
    }

    updateWorldTransform(parentWorldMatrix: mat3 | null) {
        if (parentWorldMatrix) {
            mat3.multiply(this.worldMatrix, parentWorldMatrix, this.localMatrix);
        } else {
            mat3.copy(this.worldMatrix, this.localMatrix);
        }
    }
}
