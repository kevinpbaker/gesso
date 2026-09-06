import { Constraints } from './LayoutTypes';
import type { UiNode } from '../graph/UiNode';

/**
 * The constraints a record has before anything has measured it.
 *
 * One instance rather than one per record: Constraints is immutable,
 * and a record that has never been measured is only ever compared
 * against, never written through.
 */
const NEVER_MEASURED = Constraints.unbounded();

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
   * A scroll container that reads right to left, so its overlay
   * scrollbar hangs on the left edge and the band that reveals it is
   * on the left too.
   *
   * Kept on the record because `Scrollbars.ts` is handed a record and
   * nothing else: the thumb rectangle a renderer draws and the one the
   * hit tester grabs come from the same function, which is what makes
   * what is seen the thing that is dragged.
   */
  mirrored = false;

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

  /**
   * A box around everything in this node's subtree that could take a
   * point, filled in by `LayoutEngine.subtreeBoundsFor` and read by
   * hit testing to pass whole subtrees over. Never smaller than the
   * true hit area, and unbounded where it cannot promise that; see
   * `SubtreeBounds`, which is the read view of these five.
   */
  boundsMinX = 0;
  boundsMinY = 0;
  boundsMaxX = 0;
  boundsMaxY = 0;
  boundsUnbounded = true;

  /** Effective scroll offset of a scroll container. */
  scrollX = 0;
  scrollY = 0;

  /** Content extent of a scroll container, pre-scroll. */
  contentWidth = 0;
  contentHeight = 0;

  /** Constraints this record was last measured under. */
  lastConstraints: Constraints = NEVER_MEASURED;

  /**
   * A second memoised measurement. Flex measures every item twice —
   * loose for its max-content size, then tight at its final size — and
   * a one-entry memo would miss on every pass of every later frame. The
   * outputs of the previous constraints are kept here and swapped back
   * in when those constraints come round again, so an unchanged item
   * costs nothing in either pass.
   */
  altValid = false;
  altConstraints: Constraints = NEVER_MEASURED;

  /**
   * The alternate measurement's twelve outputs, one field each.
   *
   * These were a `number[]` built by an `outputs()` helper, which reads
   * better and cost two array allocations on every flex item of every
   * pass: a full pass of the benchmark list spent 2.2% of its time in
   * the pair of helpers that packed and unpacked them, before the
   * collector's share of having made the arrays at all. A field per
   * output is the same twelve numbers with nothing built to hold them.
   */
  private altMeasuredWidth = 0;
  private altMeasuredHeight = 0;
  private altOuterWidth = 0;
  private altOuterHeight = 0;
  private altMinContentWidth = 0;
  private altMaxContentWidth = 0;
  private altIntrinsicWidth = 0;
  private altIntrinsicHeight = 0;
  private altHasBaseline = false;
  private altBaseline = 0;
  private altContentWidth = 0;
  private altContentHeight = 0;

  /** Keeps the current measurement as the alternate before a fresh one overwrites it. */
  saveAlt(): void {
    this.altValid = true;
    this.altConstraints = this.lastConstraints;
    this.altMeasuredWidth = this.measuredWidth;
    this.altMeasuredHeight = this.measuredHeight;
    this.altOuterWidth = this.outerWidth;
    this.altOuterHeight = this.outerHeight;
    this.altMinContentWidth = this.minContentWidth;
    this.altMaxContentWidth = this.maxContentWidth;
    this.altIntrinsicWidth = this.intrinsicWidth;
    this.altIntrinsicHeight = this.intrinsicHeight;
    this.altHasBaseline = this.hasBaseline;
    this.altBaseline = this.baseline;
    this.altContentWidth = this.contentWidth;
    this.altContentHeight = this.contentHeight;
  }

  /** Makes the alternate measurement current, and the current one alternate. */
  swapAlt(): void {
    const constraints = this.lastConstraints;
    this.lastConstraints = this.altConstraints;
    this.altConstraints = constraints;
    let swap: number = this.measuredWidth;
    this.measuredWidth = this.altMeasuredWidth;
    this.altMeasuredWidth = swap;
    swap = this.measuredHeight;
    this.measuredHeight = this.altMeasuredHeight;
    this.altMeasuredHeight = swap;
    swap = this.outerWidth;
    this.outerWidth = this.altOuterWidth;
    this.altOuterWidth = swap;
    swap = this.outerHeight;
    this.outerHeight = this.altOuterHeight;
    this.altOuterHeight = swap;
    swap = this.minContentWidth;
    this.minContentWidth = this.altMinContentWidth;
    this.altMinContentWidth = swap;
    swap = this.maxContentWidth;
    this.maxContentWidth = this.altMaxContentWidth;
    this.altMaxContentWidth = swap;
    swap = this.intrinsicWidth;
    this.intrinsicWidth = this.altIntrinsicWidth;
    this.altIntrinsicWidth = swap;
    swap = this.intrinsicHeight;
    this.intrinsicHeight = this.altIntrinsicHeight;
    this.altIntrinsicHeight = swap;
    const hadBaseline = this.hasBaseline;
    this.hasBaseline = this.altHasBaseline;
    this.altHasBaseline = hadBaseline;
    swap = this.baseline;
    this.baseline = this.altBaseline;
    this.altBaseline = swap;
    swap = this.contentWidth;
    this.contentWidth = this.altContentWidth;
    this.altContentWidth = swap;
    swap = this.contentHeight;
    this.contentHeight = this.altContentHeight;
    this.altContentHeight = swap;
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

  /**
   * Returns the record to the state a freshly constructed one is in,
   * so a full layout can reuse the object instead of replacing it.
   *
   * `layout()` used to drop every record and let the pass build new
   * ones, which is 5,001 objects of seventy fields for the benchmark
   * list, once per mount and once per resize notification: 71% of
   * everything a full pass allocated, and the largest part of the 10%
   * of it the collector was taking. The engine now keeps the object
   * and calls this instead, which is the same thing without the
   * garbage. Only the node stays, and it is the one field a record is
   * never reused across.
   *
   * **Every field above has to appear here, with the value it is
   * declared with.** A field that is added and not reset would carry
   * one pass's answer into the next, which is the kind of fault that
   * shows as a stale box on a screen and as nothing at all in a test
   * that lays out once. `LayoutRecord.spec.ts` compares a reset record
   * against a new one field by field so the omission fails loudly.
   */
  reset(): void {
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.measuredWidth = 0;
    this.measuredHeight = 0;
    this.outerWidth = 0;
    this.outerHeight = 0;
    this.paddingLeft = 0;
    this.paddingRight = 0;
    this.paddingTop = 0;
    this.paddingBottom = 0;
    this.marginLeft = 0;
    this.marginRight = 0;
    this.marginTop = 0;
    this.marginBottom = 0;
    this.minWidth = 0;
    this.maxWidth = Infinity;
    this.minHeight = 0;
    this.maxHeight = Infinity;
    this.flexGrow = 0;
    this.flexShrink = 1;
    this.flexBasisZero = false;
    this.minWidthAuto = true;
    this.minHeightAuto = true;
    this.marginLeftAuto = false;
    this.marginRightAuto = false;
    this.marginTopAuto = false;
    this.marginBottomAuto = false;
    this.aspectRatio = undefined;
    this.hasBaseline = false;
    this.baseline = 0;
    this.minContentWidth = 0;
    this.maxContentWidth = 0;
    this.intrinsicWidth = 0;
    this.intrinsicHeight = 0;
    this.flexMain = 0;
    this.flexBase = 0;
    this.flexMin = 0;
    this.flexMax = Infinity;
    this.flexMinAuto = false;
    this.positioned = false;
    this.absolute = false;
    this.top = undefined;
    this.right = undefined;
    this.bottom = undefined;
    this.left = undefined;
    this.zIndex = 0;
    this.lifted = false;
    this.liftBoundary = false;
    this.clips = false;
    this.scrollable = false;
    this.mirrored = false;
    this.sticky = false;
    this.stickyOffsetX = 0;
    this.stickyOffsetY = 0;
    this.scrollbarVisibleUntil = 0;
    this.subgridColumns = undefined;
    this.subgridColumnGap = 0;
    this.paintOrder = null;
    this.boundsMinX = 0;
    this.boundsMinY = 0;
    this.boundsMaxX = 0;
    this.boundsMaxY = 0;
    this.boundsUnbounded = true;
    this.scrollX = 0;
    this.scrollY = 0;
    this.contentWidth = 0;
    this.contentHeight = 0;
    this.lastConstraints = NEVER_MEASURED;
    this.altValid = false;
    this.altConstraints = NEVER_MEASURED;
    this.altMeasuredWidth = 0;
    this.altMeasuredHeight = 0;
    this.altOuterWidth = 0;
    this.altOuterHeight = 0;
    this.altMinContentWidth = 0;
    this.altMaxContentWidth = 0;
    this.altIntrinsicWidth = 0;
    this.altIntrinsicHeight = 0;
    this.altHasBaseline = false;
    this.altBaseline = 0;
    this.altContentWidth = 0;
    this.altContentHeight = 0;
    this.contentMatters = true;
    this.relayoutBoundary = false;
    this.measureDirty = true;
    this.placeDirty = true;
    this.transformDirty = false;
    this.propsPass = 0;
    this.propsBaseWidth = undefined;
    this.propsBaseHeight = undefined;
  }
}
