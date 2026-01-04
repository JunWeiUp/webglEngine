import { Node } from './Node';
import type { IRenderer } from '../core/IRenderer';

export class Text extends Node {
    public text: string = "";
    public fontSize: number = 24;
    public fontFamily: string = "Arial";
    public fillStyle: string = "black";

    constructor(text: string) {
        super();
        this.text = text;
    }

    renderCanvas(renderer: IRenderer) {
        const ctx = renderer.ctx;
        
        // We need to apply the world transform to the 2D context.
        // World matrix is 3x3:
        // [ m00 m01 m02 ]
        // [ m10 m11 m12 ]
        // [ m20 m21 m22 ]
        // Canvas transform is setTransform(m11, m12, m21, m22, dx, dy) -> (a, b, c, d, e, f)
        // gl-matrix:
        // 0 3 6
        // 1 4 7
        // 2 5 8
        // m00=0, m01=3, m02=6 (tx)
        // m10=1, m11=4, m12=7 (ty)
        // Wait, gl-matrix is column major? Yes.
        // Index:
        // 0: sx (m00)
        // 1: shearY (m10)
        // 2: 0
        // 3: shearX (m01)
        // 4: sy (m11)
        // 5: 0
        // 6: tx (m02)
        // 7: ty (m12)
        // 8: 1

        // ctx.setTransform(a, b, c, d, e, f)
        // a (m11), b (m12), c (m21), d (m22), e (dx), f (dy)
        // Row-major vs Column-major.
        // Canvas is: x' = ax + cy + e
        //            y' = bx + dy + f
        
        // Matrix multiplication:
        // [ m00 m01 m02 ]   [ x ]
        // [ m10 m11 m12 ] * [ y ]
        // [  0   0   1  ]   [ 1 ]
        
        // x' = m00*x + m01*y + m02
        // y' = m10*x + m11*y + m12
        
        // So:
        // a = m00 (idx 0)
        // b = m10 (idx 1)
        // c = m01 (idx 3)
        // d = m11 (idx 4)
        // e = m02 (idx 6)
        // f = m12 (idx 7)

        const m = this.transform.worldMatrix;
        ctx.setTransform(m[0], m[1], m[3], m[4], m[6], m[7]);

        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.fillStyle;
        ctx.textBaseline = "top";
        ctx.fillText(this.text, 0, 0);
        
        // Measure text for hit testing / size
        const metrics = ctx.measureText(this.text);
        this.width = metrics.width;
        this.height = this.fontSize; // Approx
    }
}
