import type { Command } from './Command';

/**
 * 历史记录管理器
 * 
 * 维护 undo 和 redo 两个栈
 */
export class HistoryManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private maxHistory: number = 100;

    /**
     * 执行并记录命令
     */
    public execute(command: Command) {
        command.execute();
        this.undoStack.push(command);
        this.redoStack = []; // 执行新命令时清空 redo 栈

        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    /**
     * 仅记录已执行的命令（例如在 InteractionManager 中已经完成的操作）
     */
    public push(command: Command) {
        this.undoStack.push(command);
        this.redoStack = [];

        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    /**
     * 撤销
     */
    public undo() {
        if (this.undoStack.length === 0) return;

        const command = this.undoStack.pop()!;
        command.undo();
        this.redoStack.push(command);
    }

    /**
     * 重做
     */
    public redo() {
        if (this.redoStack.length === 0) return;

        const command = this.redoStack.pop()!;
        command.redo();
        this.undoStack.push(command);
    }

    /**
     * 是否可以撤销
     */
    public canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * 是否可以重做
     */
    public canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * 清空历史记录
     */
    public clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}
