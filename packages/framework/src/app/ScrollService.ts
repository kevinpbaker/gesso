import type { UiNode } from 'gesso-core';

/** Where and how long `ScrollService.keepInPlace` holds a node. */
export interface KeepInPlaceOptions {
  /**
   * The point to hold, in the node's own box: where the pointer pressed
   * on a canvas that paints its own shapes, so the shape under it stays
   * under it. The node's top left when left out.
   */
  readonly at?: { readonly x: number; readonly y: number };
  /**
   * How long to keep holding, in milliseconds, so a panel that animates
   * shut over several frames is held against on every one of them.
   * Zero, the default, holds through the next frame that lays out and
   * then lets go.
   */
  readonly for?: number;
}

/** A node the runtime holds in place, as `keepInPlace` registered it. */
export interface HeldInPlace {
  readonly node: UiNode;
  readonly at: { readonly x: number; readonly y: number } | undefined;
  /** `now()` after which the hold ends, or null for one laid-out frame. */
  readonly until: number | null;
}

/**
 * Scrolling a node into view, for a component that moves a highlight
 * rather than focus, and holding a node where it is on screen while
 * the layout around it changes.
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
  private holder: ((held: HeldInPlace) => () => void) | null = null;

  /** Installed by the runtime; without one nothing scrolls. */
  setScroller(scroller: ((node: UiNode, padding: number) => void) | null): void {
    this.scroller = scroller;
  }

  /** Installed by the runtime; without one nothing is held. */
  setHolder(holder: ((held: HeldInPlace) => () => void) | null): void {
    this.holder = holder;
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

  /**
   * Keeps `node` (or a point in it) where it is on screen through the
   * layout change the caller is about to make: call it, then change
   * the state. After each layout the scroll containers above the node
   * scroll, on both axes, innermost first, by however far the layout
   * moved it, so a panel folding beside it or a column re-centring
   * leaves the thing the person just clicked under the pointer. Where
   * there is not enough to scroll it moves by the rest, as it would
   * have without.
   *
   * The runtime already does this for the focused node, vertically,
   * against content that grows above it; this is the same for any node
   * and any change. Scrolls the person makes while it holds are theirs:
   * only what a layout moves is made up. Returns a function that lets
   * go early.
   */
  keepInPlace(node: UiNode, options: KeepInPlaceOptions = {}): () => void {
    const duration = options.for ?? 0;
    const until = duration > 0 ? now() + duration : null;
    return this.holder?.({ node, at: options.at, until }) ?? noop;
  }
}

function noop(): void {}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
