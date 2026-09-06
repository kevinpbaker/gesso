import { Constraints } from './LayoutTypes';
import type { UiNode } from '../graph/UiNode';

/**
 * Mutable per-node layout projection owned by LayoutEngine.
 *
 * Records are keyed by UiNode identity and survive graph
 * reconciliation when the node survives. All geometry is
 * scalar so the projection can later migrate to typed-array
 * slabs for Worker/shared-memory transfer.
 */
export class LayoutRecord {
  constructor(public readonly node: UiNode) {}

  /** Final border box, parent-content coordinates, pre-scroll. */
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  /** Desired size under the last constraints. */
  measuredWidth = 0;
  measuredHeight = 0;

  /** Measured size plus margins: contribution to the parent. */
  outerWidth = 0;
  outerHeight = 0;

  paddingLeft = 0;
  paddingRight = 0;
  paddingTop = 0;
  paddingBottom = 0;

  marginLeft = 0;
  marginRight = 0;
  marginTop = 0;
  marginBottom = 0;

  /** Own min/max resolved from properties (grow/shrink clamps). */
  minWidth = 0;
  maxWidth = Infinity;
  minHeight = 0;
  maxHeight = Infinity;

  flexGrow = 0;
  flexShrink = 1;
  /** `flex: n` shorthand without an explicit flexBasis: basis is 0. */
  flexBasisZero = false;

  /**
   * True when the minimum on that axis is `auto` (unset): as a flex item
   * the node then has CSS's automatic minimum, its min-content size.
   */
  minWidthAuto = true;
  minHeightAuto = true;

  marginLeftAuto = false;
  marginRightAuto = false;
  marginTopAuto = false;
  marginBottomAuto = false;

  aspectRatio: number | undefined = undefined;

  /**
   * Distance from the box top to the first alphabetic baseline, when
   * the node has one: its own text, or a descendant's along the start
   * edge. Boxes without one synthesise a baseline from their bottom
   * edge at alignment time (as CSS does), which is why this is a flag
   * and not a sentinel value.
   */
  hasBaseline = false;
  baseline = 0;

  /**
   * Intrinsic sizes. `minContentWidth` is the narrowest the content can
   * be (a text's longest word, a row's summed items); `intrinsicHeight`
   * is the content's height before explicit or parent sizes. Flex uses
   * both for the automatic minimum size of items.
   */
  minContentWidth = 0;
  maxContentWidth = 0;
  intrinsicWidth = 0;
  intrinsicHeight = 0;

  /**
   * What the last flex container this node was an item of decided
   * about it, kept for `LayoutEngine.explain`: which axis was the main
   * axis (0 when the node is not a flex item), the flex base size, and
   * the minimum and maximum the resolution clamped it between —
   * `flexMinAuto` when that minimum was CSS's automatic minimum (the
   * content's min-content size) rather than an explicit one.
   */
  flexMain: 0 | 1 | 2 = 0;
  flexBase = 0;
  flexMin = 0;
  flexMax = Infinity;
  flexMinAuto = false;

  /**
   * Positioning. An absolute node is out of flow: it neither takes
   * space in its parent nor is measured with it; the parent positions
   * it against its containing block after the flow is placed. A
   * relative node is in flow and shifted by its offsets afterwards.
   * Both are containing blocks for absolute descendants.
   */
  positioned = false;
  absolute = false;
  top: number | undefined = undefined;
  right: number | undefined = undefined;
  bottom: number | undefined = undefined;
  left: number | undefined = undefined;

  zIndex = 0;

  /**
   * `lift`: this node and its subtree are painted in a top layer,
   * above the whole tree and outside every ancestor's clip. Hit
   * testing tries the lifted nodes before the tree, for the same
   * reason it walks `paintOrder` in reverse: what is drawn last is
   * pressed first.
   */
  lifted = false;

  /**
   * `liftBoundary`: lifted descendants of this node are painted at the
   * end of this node's subtree rather than at the end of the frame.
   */
  liftBoundary = false;

  /**
   * Overflow. A clipping node paints and hit-tests its children inside
   * its own box; a scrollable one (a ScrollView, or overflow 'scroll'
   * / 'auto') also translates them by its scroll offset and clamps
   * that offset to its content extent.
   */
  clips = false;
  scrollable = false;

  /**
   * position: 'sticky'. The offsets are how far the node is shifted from
   * its flow position to stay at its scroll container's edge; they are
   * recomputed whenever anything scrolls and are part of the node's
   * visible position, not its record box.
   */
  sticky = false;
  stickyOffsetX = 0;
  stickyOffsetY = 0;

  /** Time (ms) until which this scroll container's scrollbars are shown. */
  scrollbarVisibleUntil = 0;

  /**
   * `subgrid: 'columns'`: the parent grid's resolved track widths for
   * the span this node occupies, and the parent's column gap, written
   * by the parent before it measures the node. A subgrid lays itself
   * out against these instead of its own `columns` prop, which is what
   * makes a table row line up with its header.
   */
  subgridColumns: number[] | undefined = undefined;
  subgridColumnGap = 0;

  /**
   * Children (fragments expanded) in paint order when any of them has
   * a non-zero zIndex; null means tree order. Hit testing walks it in
   * reverse. Rebuilt whenever the node is placed.
   */
  paintOrder: UiNode[] | null = null;

  /** Effective scroll offset of a scroll container. */
  scrollX = 0;
  scrollY = 0;

  /** Content extent of a scroll container, pre-scroll. */
  contentWidth = 0;
  contentHeight = 0;

  /** Constraints this record was last measured under. */
  lastConstraints: Constraints = Constraints.unbounded();

  /**
   * A second memoised measurement. Flex measures every item twice —
   * loose for its max-content size, then tight at its final size — and
   * a one-entry memo would miss on every pass of every later frame. The
   * outputs of the previous constraints are kept here and swapped back
   * in when those constraints come round again, so an unchanged item
   * costs nothing in either pass.
   */
  altValid = false;
  altConstraints: Constraints = Constraints.unbounded();
  private altOutputs: number[] = [];

  /** Keeps the current measurement as the alternate before a fresh one overwrites it. */
  saveAlt(): void {
    this.altValid = true;
    this.altConstraints = this.lastConstraints;
    this.altOutputs = this.outputs();
  }

  /** Makes the alternate measurement current, and the current one alternate. */
  swapAlt(): void {
    const constraints = this.lastConstraints;
    const outputs = this.outputs();
    this.lastConstraints = this.altConstraints;
    this.restore(this.altOutputs);
    this.altConstraints = constraints;
    this.altOutputs = outputs;
  }

  private outputs(): number[] {
    return [
      this.measuredWidth,
      this.measuredHeight,
      this.outerWidth,
      this.outerHeight,
      this.minContentWidth,
      this.maxContentWidth,
      this.intrinsicWidth,
      this.intrinsicHeight,
      this.hasBaseline ? 1 : 0,
      this.baseline,
      this.contentWidth,
      this.contentHeight
    ];
  }

  private restore(outputs: number[]): void {
    this.measuredWidth = outputs[0];
    this.measuredHeight = outputs[1];
    this.outerWidth = outputs[2];
    this.outerHeight = outputs[3];
    this.minContentWidth = outputs[4];
    this.maxContentWidth = outputs[5];
    this.intrinsicWidth = outputs[6];
    this.intrinsicHeight = outputs[7];
    this.hasBaseline = outputs[8] === 1;
    this.baseline = outputs[9];
    this.contentWidth = outputs[10];
    this.contentHeight = outputs[11];
  }

  /**
   * Set by the parent before measuring this node: something outside it
   * reads a content-derived output beyond its constrained size — its
   * min-content width, intrinsic height or baseline. True until a
   * parent says otherwise, so an unflagged node is never a boundary.
   */
  contentMatters = true;

  /**
   * Set by the parent after measuring this node: the parent's layout
   * cannot change when this node's content does, because the sizes the
   * parent read were fixed by constraints or explicit lengths and
   * nothing content-derived was consulted. A change inside such a node
   * is laid out from the node itself (a relayout boundary, as Flutter
   * calls it) instead of from the root.
   */
  relayoutBoundary = false;

  measureDirty = true;
  placeDirty = true;
  transformDirty = false;

  /**
   * Which layout pass last folded the node's properties onto this
   * record, and the percentage base they were folded against.
   *
   * A pass asks for the same node's properties several times over (the
   * measure walk, then again from whichever container places it), and
   * each ask re-reads about thirty properties and re-resolves every
   * length. `LayoutEngine.resolveLayoutProps` compares these three
   * against the pass it is in and returns early when they agree, which
   * is why the base is recorded and not just the pass number: the
   * engine reassigns the base as it descends, and a node measured
   * before its container's content box was known is genuinely resolved
   * twice against two different bases.
   *
   * Zero is "never resolved", and pass numbers start at one, so a fresh
   * record cannot match the pass it is first seen in.
   */
  propsPass = 0;
  propsBaseWidth: number | undefined = undefined;
  propsBaseHeight: number | undefined = undefined;
}
