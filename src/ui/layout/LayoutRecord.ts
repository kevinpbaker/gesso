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
  intrinsicHeight = 0;

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

  measureDirty = true;
  placeDirty = true;
  transformDirty = false;
}
