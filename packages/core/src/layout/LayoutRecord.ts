import { Constraints, constraintsEqual } from './LayoutTypes';
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
   * be (a text's longest word, a row's summed items) and
   * `minContentHeight` the shortest, on the same terms; `intrinsicHeight`
   * is the content's height before explicit or parent sizes. Flex uses
   * the min-content sizes for the automatic minimum size of items.
   *
   * The two min-content sizes leave a scroll container out: scrollable
   * content pushes on nothing outside the scroller, so a box holding a
   * list is as small as the box, not as tall as the list. The intrinsic
   * sizes count it, which is why they are not the minimums.
   */
  minContentWidth = 0;
  minContentHeight = 0;
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

  /**
   * Where anything in this subtree may paint, in the same space as the
   * box: the box itself, grown by whatever reaches past it under a node
   * that doesn't clip (an absolute child, a child pushed past it). A
   * renderer culls a node by this rather than by its box, since a node
   * that doesn't clip lets its children paint anywhere. It's the box
   * whenever nothing reaches past, which is nearly always. Worked out
   * when a node with children is placed, and grown up the ancestors
   * when a box is written; too large costs a descent, never a paint.
   */
  extentMinX = 0;
  extentMinY = 0;
  extentMaxX = 0;
  extentMaxY = 0;
  scrollable = false;

  /**
   * An editable, which scrolls its own text inside its box.
   *
   * Not `scrollable`: it has no children to translate and its offset
   * follows the caret, so every path that treats a scroll container's
   * content as children leaves it alone. What it shares with one is
   * the offset and its clamp — see `scrollRange` — and, when it is
   * multiline, the overlay scrollbars.
   */
  scrollsText = false;

  /**
   * A multiline editable, which shows the overlay scrollbars a scroll
   * container does over its own text. A single-line field scrolls
   * sideways too, but a bar under one line of text reads as part of
   * the control rather than a hint that there is more of it.
   */
  textScrollbars = false;

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
   * The percentage base the current measurement resolved against, and
   * whether the node has a length that resolves against one.
   *
   * A percentage is resolved against the container's content box,
   * which is not in the constraints. A node sized `height: 100%` and
   * asked the same loose constraints under a taller container must
   * not be handed back the height it had in the shorter one, so for a
   * node with a percentage the base is part of what a memo matches.
   * Each axis counts only for a node with a percentage on it, so a
   * block that is `width: 100%` is not measured again because its
   * column's height changed, and a node with none (the overwhelming
   * majority) matches as cheaply as it always did.
   */
  lastBaseWidth: number | undefined = undefined;
  lastBaseHeight: number | undefined = undefined;
  percentWidth = false;
  percentHeight = false;

  /** Whether a measurement under `baseWidth` by `baseHeight` would resolve the same percentages as the current one. */
  sameBase(baseWidth: number | undefined, baseHeight: number | undefined): boolean {
    return (
      (!this.percentWidth || this.lastBaseWidth === baseWidth) &&
      (!this.percentHeight || this.lastBaseHeight === baseHeight)
    );
  }

  /**
   * Earlier memoised measurements, most recently used first.
   *
   * Flex measures an item more than once a pass, and a memo of one
   * entry missed on every pass of every later frame. Two entries (the
   * last one and one alternate) covered a column of items: loose for
   * the max-content size, then tight at the final size. A row with a
   * flexible child holding a column of auto-height blocks asks that
   * column's items a third question: the flex basis measures them
   * unbounded, the final width measures them loose in height, and a
   * row that stretches its items measures them again at the stretched
   * height. With two slots the third evicted one of the others, so an
   * edit to one block re-measured every block on every keystroke: 6,005
   * nodes for a 1,000-paragraph document, where a hit costs nothing.
   *
   * The slots are allocated the first time a record needs one, so a
   * node only ever measured one way carries none.
   */
  private alternates: MeasureSlot[] | null = null;

  /** Keeps the current measurement as the most recent alternate before a fresh one overwrites it. */
  saveAlt(): void {
    let slots = this.alternates;
    if (slots === null) {
      slots = this.alternates = [];
    }
    // Reuse the least recently used slot rather than allocating: it is
    // the one about to be dropped anyway.
    const slot = slots.length < ALTERNATES ? new MeasureSlot() : slots.pop()!;
    slot.capture(this);
    slots.unshift(slot);
  }

  /**
   * Makes a remembered measurement for these constraints current, and
   * keeps the current one as an alternate in its place. False when
   * nothing remembered matches.
   */
  recallAlt(constraints: Constraints, baseWidth?: number, baseHeight?: number): boolean {
    const slots = this.alternates;
    if (slots === null) {
      return false;
    }
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index]!;
      if (
        slot.valid &&
        constraintsEqual(slot.constraints, constraints) &&
        (!this.percentWidth || slot.baseWidth === baseWidth) &&
        (!this.percentHeight || slot.baseHeight === baseHeight)
      ) {
        slot.swap(this);
        // Most recently used first: the measurement just set aside is
        // the likeliest to be asked for next.
        if (index > 0) {
          slots.splice(index, 1);
          slots.unshift(slot);
        }
        return true;
      }
    }
    return false;
  }

  /** Forgets every remembered measurement: the node's content changed. */
  forgetAlts(): void {
    if (this.alternates !== null) {
      for (const slot of this.alternates) {
        slot.valid = false;
      }
    }
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
  /** Whether the node's children have been placed at least once, so its subtree can be shifted rather than placed. */
  placedOnce = false;
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
    this.minContentHeight = 0;
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
    this.extentMinX = 0;
    this.extentMinY = 0;
    this.extentMaxX = 0;
    this.extentMaxY = 0;
    this.scrollable = false;
    this.scrollsText = false;
    this.textScrollbars = false;
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
    this.lastBaseWidth = undefined;
    this.lastBaseHeight = undefined;
    this.percentWidth = false;
    this.percentHeight = false;
    this.alternates = null;
    this.contentMatters = true;
    this.relayoutBoundary = false;
    this.placedOnce = false;
    this.measureDirty = true;
    this.placeDirty = true;
    this.transformDirty = false;
    this.propsPass = 0;
    this.propsBaseWidth = undefined;
    this.propsBaseHeight = undefined;
  }
}

/** How many earlier measurements a record remembers besides the current one. */
const ALTERNATES = 2;

/**
 * One remembered measurement: the constraints it answered and the
 * outputs it produced. A field per output rather than an array, for the
 * reason the record's own fields are: packing and unpacking arrays cost
 * 2.2% of a full pass in allocation alone.
 */
class MeasureSlot {
  valid = false;
  constraints: Constraints = NEVER_MEASURED;
  baseWidth: number | undefined = undefined;
  baseHeight: number | undefined = undefined;
  private measuredWidth = 0;
  private measuredHeight = 0;
  private outerWidth = 0;
  private outerHeight = 0;
  private minContentWidth = 0;
  private minContentHeight = 0;
  private maxContentWidth = 0;
  private intrinsicWidth = 0;
  private intrinsicHeight = 0;
  private hasBaseline = false;
  private baseline = 0;
  private contentWidth = 0;
  private contentHeight = 0;

  /** Copies the record's current measurement in. */
  capture(rec: LayoutRecord): void {
    this.valid = true;
    this.constraints = rec.lastConstraints;
    this.baseWidth = rec.lastBaseWidth;
    this.baseHeight = rec.lastBaseHeight;
    this.measuredWidth = rec.measuredWidth;
    this.measuredHeight = rec.measuredHeight;
    this.outerWidth = rec.outerWidth;
    this.outerHeight = rec.outerHeight;
    this.minContentWidth = rec.minContentWidth;
    this.minContentHeight = rec.minContentHeight;
    this.maxContentWidth = rec.maxContentWidth;
    this.intrinsicWidth = rec.intrinsicWidth;
    this.intrinsicHeight = rec.intrinsicHeight;
    this.hasBaseline = rec.hasBaseline;
    this.baseline = rec.baseline;
    this.contentWidth = rec.contentWidth;
    this.contentHeight = rec.contentHeight;
  }

  /** Trades places with the record's current measurement. */
  swap(rec: LayoutRecord): void {
    const constraints = rec.lastConstraints;
    rec.lastConstraints = this.constraints;
    this.constraints = constraints;
    let base = rec.lastBaseWidth;
    rec.lastBaseWidth = this.baseWidth;
    this.baseWidth = base;
    base = rec.lastBaseHeight;
    rec.lastBaseHeight = this.baseHeight;
    this.baseHeight = base;
    let n: number = rec.measuredWidth;
    rec.measuredWidth = this.measuredWidth;
    this.measuredWidth = n;
    n = rec.measuredHeight;
    rec.measuredHeight = this.measuredHeight;
    this.measuredHeight = n;
    n = rec.outerWidth;
    rec.outerWidth = this.outerWidth;
    this.outerWidth = n;
    n = rec.outerHeight;
    rec.outerHeight = this.outerHeight;
    this.outerHeight = n;
    n = rec.minContentWidth;
    rec.minContentWidth = this.minContentWidth;
    this.minContentWidth = n;
    n = rec.minContentHeight;
    rec.minContentHeight = this.minContentHeight;
    this.minContentHeight = n;
    n = rec.maxContentWidth;
    rec.maxContentWidth = this.maxContentWidth;
    this.maxContentWidth = n;
    n = rec.intrinsicWidth;
    rec.intrinsicWidth = this.intrinsicWidth;
    this.intrinsicWidth = n;
    n = rec.intrinsicHeight;
    rec.intrinsicHeight = this.intrinsicHeight;
    this.intrinsicHeight = n;
    const had = rec.hasBaseline;
    rec.hasBaseline = this.hasBaseline;
    this.hasBaseline = had;
    n = rec.baseline;
    rec.baseline = this.baseline;
    this.baseline = n;
    n = rec.contentWidth;
    rec.contentWidth = this.contentWidth;
    this.contentWidth = n;
    n = rec.contentHeight;
    rec.contentHeight = this.contentHeight;
    this.contentHeight = n;
  }
}
