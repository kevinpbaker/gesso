import type { UiNode } from './UiNode';

/**
 * The set of nodes invalidated since the last frame.
 *
 * Each node is stored once and drained in insertion order.
 * Dirty flags live on the UiNode itself; this set only tracks
 * membership.
 */
export class DirtyNodeSet {
  private readonly nodes = new Set<UiNode>();

  /**
   * Adds a node and reports whether it was newly added.
   */
  mark(node: UiNode): boolean {
    const size = this.nodes.size;
    this.nodes.add(node);
    return this.nodes.size > size;
  }

  has(node: UiNode): boolean {
    return this.nodes.has(node);
  }

  delete(node: UiNode): boolean {
    return this.nodes.delete(node);
  }

  get size(): number {
    return this.nodes.size;
  }

  isEmpty(): boolean {
    return this.nodes.size === 0;
  }

  /**
   * Drains the set, returning the nodes in insertion order.
   */
  take(): UiNode[] {
    const nodes = [...this.nodes];
    this.nodes.clear();
    return nodes;
  }

  clear(): void {
    this.nodes.clear();
  }
}
