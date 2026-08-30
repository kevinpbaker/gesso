import type { UiNode } from '../graph/UiNode';

/**
 * Tells a listener when one particular node gains or loses focus.
 *
 * `UiFocusManager.onFocusChange` reports the node that now holds focus,
 * which is the right shape for the runtime (scroll it into view) and
 * the wrong one for a focus ring: with a ring on every control, every
 * listener would run on every focus change and all but two of them
 * would decide nothing happened.
 *
 * A focus change touches exactly two nodes — the one losing it and the
 * one gaining it — so the notifier keeps the previous node and fires
 * only those. The cost of a focus change is therefore independent of
 * how many rings exist.
 */
export class FocusNotifier {
  private readonly listeners = new Map<UiNode, Set<(focused: boolean) => void>>();
  private focused: UiNode | null = null;

  /** Registers a listener for one node; the returned function removes it. */
  add(node: UiNode, listener: (focused: boolean) => void): () => void {
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

  /** Whether the node the notifier last saw focused is this one. */
  isFocused(node: UiNode): boolean {
    return this.focused === node;
  }

  /** Fed from `UiFocusManager.onFocusChange`, which reports the new holder. */
  handleFocusChange(node: UiNode | null): void {
    const previous = this.focused;
    if (previous === node) {
      return;
    }
    this.focused = node;
    if (previous !== null) {
      this.notify(previous, false);
    }
    if (node !== null) {
      this.notify(node, true);
    }
  }

  /**
   * A removed node's listeners go with it. The modifier's own detach
   * removes them too; this is the case where the node leaves without
   * its modifiers being reconciled first.
   */
  handleNodeRemoved(node: UiNode): void {
    this.listeners.delete(node);
    if (this.focused === node) {
      this.focused = null;
    }
  }

  private notify(node: UiNode, focused: boolean): void {
    const forNode = this.listeners.get(node);
    if (forNode === undefined) {
      return;
    }
    for (const listener of forNode) {
      listener(focused);
    }
  }
}
