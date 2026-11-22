import type { UiNode } from '../graph/UiNode';

/**
 * Where a node was, before the layout passes since the last frame moved
 * it: its subtree's extent, its box's origin (the pivot of its
 * transform), its sticky shift and its transform, as they stood when it
 * was last drawn.
 *
 * In the coordinates a `LayoutRecord` keeps, before any scroll offset,
 * shift or transform, so a renderer carries it out to the surface as it
 * carries a node's present extent, through the node's own placement
 * (this one) and its ancestors' (as they are now).
 */
export interface MovedFrom {
  readonly extentMinX: number;
  readonly extentMinY: number;
  readonly extentMaxX: number;
  readonly extentMaxY: number;
  readonly x: number;
  readonly y: number;
  readonly stickyOffsetX: number;
  readonly stickyOffsetY: number;
  /** The `transform` property's value then. */
  readonly transform: unknown;
  /**
   * For a node taken out of the tree, the parent it was taken from,
   * through whose placement it is carried out to where it was drawn.
   */
  readonly parent?: UiNode | null;
  /** A node laid out for the first time: drawn nowhere before, so only where it is. */
  readonly added?: boolean;
}

/**
 * What moved since a renderer last asked: `LayoutEngine.takeMoves`.
 *
 * A renderer that keeps its pixels draws a frame where a box moved by
 * drawing where it was and where it is, rather than everything. That is
 * only sound when every move is here, so `complete` is false whenever
 * something changed that no entry describes (a full layout, a node
 * taken away with no parent to say where it was), and the frame is
 * drawn whole. A node added is an entry with nowhere to come from; a
 * node taken away, one with its old parent; a node whose children
 * changed, or whose clip did, one with its whole extent as it was.
 * An entry is the node's oldest place since the last ask: a node moved
 * twice between frames was drawn at neither but the first.
 *
 * A node that moved with an ancestor is often not here; the ancestor's
 * extent held it, where it was and where it is.
 */
export interface LayoutMoves {
  readonly nodes: ReadonlyMap<UiNode, MovedFrom>;
  readonly complete: boolean;
}
