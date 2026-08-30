import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from './LayoutTypes';

/**
 * Tells listeners when a node's box moved.
 *
 * Layout is readable at any moment — `worldBox(node)` answers "where is
 * this" — but nothing told a listener "this changed on this frame",
 * and a behaviour that follows a box (a split pane's divider, a drag
 * ghost, a `ResizeObserver` equivalent) needs exactly that.
 *
 * The cost is proportional to the number of registered listeners, not
 * to the size of the tree: a frame with none does nothing. A scroll
 * moves the world box of everything under the scroller, and reporting
 * that is correct — a thing that follows a box has to follow it when
 * the page scrolls too.
 */
export class LayoutNotifier {
  private readonly listeners = new Map<UiNode, Set<(box: LayoutBox) => void>>();
  private readonly last = new Map<UiNode, LayoutBox>();

  /** Registers a listener; the returned function removes it. */
  add(node: UiNode, listener: (box: LayoutBox) => void): () => void {
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
        this.last.delete(node);
      }
    };
  }

  get size(): number {
    return this.listeners.size;
  }

  /** Whether anything is listening, so a frame can skip the walk. */
  isEmpty(): boolean {
    return this.listeners.size === 0;
  }

  /**
   * Calls the listeners of every watched node whose box differs from
   * the one it was last told about.
   */
  notify(boxOf: (node: UiNode) => LayoutBox): void {
    for (const [node, listeners] of this.listeners) {
      const box = boxOf(node);
      const previous = this.last.get(node);
      if (previous !== undefined && sameBox(previous, box)) {
        continue;
      }
      this.last.set(node, { ...box });
      for (const listener of listeners) {
        listener(box);
      }
    }
  }

  /** Drops a removed node's listeners, so nothing keeps it alive. */
  handleNodeRemoved(node: UiNode): void {
    this.listeners.delete(node);
    this.last.delete(node);
  }
}

function sameBox(a: LayoutBox, b: LayoutBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
