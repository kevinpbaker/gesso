import type { UiNode } from 'gesso-core';

/**
 * Scrolling a node into view, for a component that moves a highlight
 * rather than focus.
 *
 * Focus moved from the keyboard already brings its node into view. A
 * highlight doesn't move focus: a combobox's arrows walk its list while
 * the caret stays in the field, and a grid's cursor can do the same.
 * The list has to follow the highlight all the same, and only the
 * runtime knows where the scroll containers above a node are and how
 * far each has to move. This is the asking.
 */
export class ScrollService {
  private scroller: ((node: UiNode, padding: number) => void) | null = null;

  /** Installed by the runtime; without one nothing scrolls. */
  setScroller(scroller: ((node: UiNode, padding: number) => void) | null): void {
    this.scroller = scroller;
  }

  /**
   * Scrolls every container above `node` just enough that it's inside
   * the container's viewport, `padding` pixels from the nearest edge.
   * Nothing moves when it's visible already. Before the node has been
   * laid out there is nowhere to scroll it to, and nothing happens.
   */
  scrollIntoView(node: UiNode, padding = 8): void {
    this.scroller?.(node, padding);
  }
}
