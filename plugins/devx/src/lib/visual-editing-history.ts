import type { VisualAction } from "./visual-editing-types";

/**
 * Reverse an action for undo.
 * Style actions swap original ↔ updated.
 * Insert ↔ Remove are swapped.
 * Move swaps from ↔ to indices.
 */
export function reverseAction(action: VisualAction): VisualAction {
  switch (action.type) {
    case "update-style":
      return { ...action, original: action.updated, updated: action.original };
    case "edit-text":
      return { ...action, original: action.updated, updated: action.original };
    case "insert-element":
      return {
        type: "remove-element",
        devxId: action.devxId,
        parentDevxId: action.parentDevxId,
        index: action.index,
        tagName: action.tagName,
        defaultClasses: action.defaultClasses,
        defaultText: action.defaultText,
      };
    case "remove-element":
      return {
        type: "insert-element",
        devxId: action.devxId,
        parentDevxId: action.parentDevxId,
        index: action.index,
        tagName: action.tagName,
        defaultClasses: action.defaultClasses,
        defaultText: action.defaultText,
      };
    case "move-element":
      return {
        ...action,
        fromParentDevxId: action.toParentDevxId,
        fromIndex: action.toIndex,
        toParentDevxId: action.fromParentDevxId,
        toIndex: action.fromIndex,
      };
  }
}

export class VisualEditingHistory {
  private undoStack: VisualAction[] = [];
  private redoStack: VisualAction[] = [];
  private listeners: (() => void)[] = [];

  /** Subscribe to changes (for React re-renders) */
  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  /** Push a new action. Clears redo stack. */
  push(action: VisualAction): void {
    this.undoStack.push(action);
    this.redoStack = [];
    this.notify();
  }

  /** Pop and return a reversed action for undo. Returns null if empty. */
  undo(): VisualAction | null {
    const action = this.undoStack.pop();
    if (!action) return null;
    this.redoStack.push(action);
    this.notify();
    return reverseAction(action);
  }

  /** Pop and return an action to re-apply. Returns null if empty. */
  redo(): VisualAction | null {
    const action = this.redoStack.pop();
    if (!action) return null;
    this.undoStack.push(action);
    this.notify();
    return action;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Total number of applied actions. */
  get count(): number {
    return this.undoStack.length;
  }

  /** Get all applied actions (for building PendingChanges). */
  getAll(): VisualAction[] {
    return [...this.undoStack];
  }

  /** Clear everything. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}
