import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from './LayoutTypes';

/** A watched node's layout state: where it is, and how far it is scrolled. */
export interface NotifiedLayout {
  readonly box: LayoutBox;
  /** The container's own effective offset; zero for anything that does not scroll. */
  readonly scrollX: number;
  readonly scrollY: number;
}

/**
 * Tells listeners when a node's layout changed.
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
 *
 * **A container's own scroll counts as a change, even though its box
 * does not move.** That is the one case the box alone cannot describe:
 * scrolling a list moves everything inside it and leaves the list
 * itself exactly where it was, so a listener on the list heard
 * nothing. It is also the only fact an application has no other way to
 * learn — a wheel writes the offset from inside the runtime, and there
 * is no scroll event — which is why it is reported here rather than
 * through a second mechanism of its own. See `scrollPosition`.
 */
export class LayoutNotifier {
  private readonly listeners = new Map<UiNode, Set<(box: LayoutBox) => void>>();
  private readonly last = new Map<UiNode, NotifiedLayout>();

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
   * Calls the listeners of every watched node whose box or scroll
   * offset differs from what it was last told about.
   */
  notify(read: (node: UiNode) => NotifiedLayout): void {
    for (const [node, listeners] of this.listeners) {
      const current = read(node);
      const previous = this.last.get(node);
      if (previous !== undefined && sameLayout(previous, current)) {
        continue;
      }
      this.last.set(node, { box: { ...current.box }, scrollX: current.scrollX, scrollY: current.scrollY });
      for (const listener of listeners) {
        listener(current.box);
      }
    }
  }

  /** Drops a removed node's listeners, so nothing keeps it alive. */
  handleNodeRemoved(node: UiNode): void {
    this.listeners.delete(node);
    this.last.delete(node);
  }
}

function sameLayout(a: NotifiedLayout, b: NotifiedLayout): boolean {
  return a.scrollX === b.scrollX && a.scrollY === b.scrollY && sameBox(a.box, b.box);
}

function sameBox(a: LayoutBox, b: LayoutBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
