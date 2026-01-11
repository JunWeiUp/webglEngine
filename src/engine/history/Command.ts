import { Node } from '../scene/Node';

/**
 * 命令接口，定义 undo/redo 必须实现的方法
 */
export interface Command {
    execute(): void;
    undo(): void;
    redo(): void;
    label: string;
}

/**
 * 变换命令：记录节点的位置、大小、旋转变化，以及层级变化
 */
export class TransformCommand implements Command {
    public label = 'Transform';
    private nodes: Node[];
    private oldStates: Map<Node, { x: number, y: number, w: number, h: number, rotation: number, parent: Node | null, index: number }>;
    private newStates: Map<Node, { x: number, y: number, w: number, h: number, rotation: number, parent: Node | null, index: number }>;

    constructor(
        nodes: Node[],
        oldStates: Map<Node, any>,
        newStates: Map<Node, any>
    ) {
        this.nodes = nodes;
        this.oldStates = oldStates;
        this.newStates = newStates;
    }

    execute(): void {}

    undo(): void {
        const sortedNodes = [...this.nodes].sort((a, b) => {
            const stateA = this.oldStates.get(a);
            const stateB = this.oldStates.get(b);
            if (stateA && stateB && stateA.parent === stateB.parent) {
                return stateA.index - stateB.index;
            }
            return 0;
        });

        for (const node of sortedNodes) {
            const state = this.oldStates.get(node);
            if (state) {
                if (node.parent !== state.parent || (state.parent && state.parent.children.indexOf(node) !== state.index)) {
                    if (state.parent) {
                        state.parent.addChild(node, state.index);
                    } else if (node.parent) {
                        node.parent.removeChild(node);
                    }
                }
                node.set(state.x, state.y, state.w, state.h);
                node.rotation = state.rotation;
                node.invalidate();
            }
        }
    }

    redo(): void {
        const sortedNodes = [...this.nodes].sort((a, b) => {
            const stateA = this.newStates.get(a);
            const stateB = this.newStates.get(b);
            if (stateA && stateB && stateA.parent === stateB.parent) {
                return stateA.index - stateB.index;
            }
            return 0;
        });

        for (const node of sortedNodes) {
            const state = this.newStates.get(node);
            if (state) {
                if (node.parent !== state.parent || (state.parent && state.parent.children.indexOf(node) !== state.index)) {
                    if (state.parent) {
                        state.parent.addChild(node, state.index);
                    } else if (node.parent) {
                        node.parent.removeChild(node);
                    }
                }
                node.set(state.x, state.y, state.w, state.h);
                node.rotation = state.rotation;
                node.invalidate();
            }
        }
    }
}

/**
 * 创建节点命令
 */
export class CreateCommand implements Command {
    public label = 'Create Node';
    private node: Node;
    private parent: Node;
    private index: number;

    constructor(
        node: Node,
        parent: Node,
        index: number = -1
    ) {
        this.node = node;
        this.parent = parent;
        this.index = index;
    }

    execute(): void {}

    undo(): void {
        this.parent.removeChild(this.node);
        this.node.invalidate();
    }

    redo(): void {
        this.parent.addChild(this.node, this.index);
        this.node.invalidate();
    }
}

/**
 * 删除节点命令
 */
export class DeleteCommand implements Command {
    public label = 'Delete Node';
    private nodes: Node[];
    private parents: Map<Node, { parent: Node, index: number }>;

    constructor(
        nodes: Node[],
        parents: Map<Node, { parent: Node, index: number }> = new Map()
    ) {
        this.nodes = nodes;
        this.parents = parents;
    }

    execute(): void {
        for (const node of this.nodes) {
            const parent = node.parent;
            if (parent) {
                const index = parent.children.indexOf(node);
                this.parents.set(node, { parent, index });
                parent.removeChild(node);
                node.invalidate();
            }
        }
    }

    undo(): void {
        // 按原来的索引顺序恢复，避免恢复时索引发生偏移
        // 先按层级排序，父节点应该先恢复？
        // 实际上只要记录了绝对索引，从后往前恢复或者按索引排序恢复比较稳妥
        const sortedNodes = [...this.nodes].sort((a, b) => {
            const infoA = this.parents.get(a);
            const infoB = this.parents.get(b);
            if (infoA && infoB && infoA.parent === infoB.parent) {
                return infoA.index - infoB.index;
            }
            return 0;
        });

        for (const node of sortedNodes) {
            const info = this.parents.get(node);
            if (info) {
                info.parent.addChild(node, info.index);
                node.invalidate();
            }
        }
    }

    redo(): void {
        this.execute();
    }
}

/**
 * 属性变更命令：记录节点的任意属性变化
 */
export class PropertyCommand implements Command {
    public label = 'Change Property';
    private nodes: Node[];
    private propertyName: string;
    private oldValues: Map<Node, any>;
    private newValues: Map<Node, any>;
    private applyFn: (node: Node, value: any) => void;

    constructor(
        nodes: Node[],
        propertyName: string,
        oldValues: Map<Node, any>,
        newValues: Map<Node, any>,
        applyFn: (node: Node, value: any) => void
    ) {
        this.nodes = nodes;
        this.propertyName = propertyName;
        this.oldValues = oldValues;
        this.newValues = newValues;
        this.applyFn = applyFn;
        this.label = `Change ${propertyName}`;
    }

    execute(): void {}

    undo(): void {
        for (const node of this.nodes) {
            const val = this.oldValues.get(node);
            if (val !== undefined) {
                this.applyFn(node, val);
                node.invalidate();
            }
        }
    }

    redo(): void {
        for (const node of this.nodes) {
            const val = this.newValues.get(node);
            if (val !== undefined) {
                this.applyFn(node, val);
                node.invalidate();
            }
        }
    }
}
