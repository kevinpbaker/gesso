import type { UiNode } from '../graph/UiNode';

/**
 * Tells a listener when a node's scoped environment changed under it.
 *
 * The graph already rebuilds environments in one place — at attach for
 * a freshly mounted subtree, and in the environment phase after a
 * provider changed — and marks the affected nodes dirty so their
 * inherited properties re-resolve. A modifier that read a value out of
 * the environment holds it in its own state instead, where no dirty
 * flag reaches it; this is the notification it needs.
 *
 * Registered per node and usually empty, so a provider change costs a
 * map lookup per node it already visits.
 */
export class EnvironmentNotifier {
  private readonly listeners = new Map<UiNode, Set<() => void>>();

  add(node: UiNode, listener: () => void): () => void {
    let forNode = this.listeners.get(node);
    if (forNode === undefined) {
      forNode = new Set();
      this.listeners.set(node, forNode);
    }
    forNode.add(listener);
    return () => {
      const set = this.listeners.get(node);
      if (set === undefined) {
        return;
      }
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(node);
      }
    };
  }

  isEmpty(): boolean {
    return this.listeners.size === 0;
  }

  /** Fed from the graph, for every node whose environment was reassigned. */
  handleEnvironmentChange(node: UiNode): void {
    const forNode = this.listeners.get(node);
    if (forNode === undefined) {
      return;
    }
    for (const listener of forNode) {
      listener();
    }
  }

  handleNodeRemoved(node: UiNode): void {
    this.listeners.delete(node);
  }
}
