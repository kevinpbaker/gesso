import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiFrame } from '../scheduler/UiFrame';
import { CrossAxisAlignment, MainAxisAlignment, parseCrossAxisAlignment, parseMainAxisAlignment } from './Alignment';
import { FlexDirection, parseFlexDirection } from './FlexDirection';
import { LayoutRecord } from './LayoutRecord';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { TextMeasurer, TextOverflow, TextWrap } from './TextMeasurer';
import { accumulatedOffsetTo } from './LayoutTransform';
import { Constraints, constraintsEqual } from './LayoutTypes';
import type { LayoutBox, LayoutResult, Size } from './LayoutTypes';

const DEFAULT_FONT_SIZE = 14;

interface FlexItem {
  child: UiNode;
  rec: LayoutRecord;
  /** Flex base size: max-content along the main axis, or flexBasis. */
  baseMain: number;
  finalMain: number;
  /** Cross size after the second measurement pass, margins excluded. */
  cross: number;
  marginMainStart: number;
  marginMainEnd: number;
  marginCrossStart: number;
  marginCrossEnd: number;
  minMain: number;
  maxMain: number;
  grow: number;
  shrink: number;
  align: CrossAxisAlignment;
}

/**
 * Calculates geometry for a retained UiNode tree.
 *
 * Layout owns a separate projection of the graph (LayoutRecords
 * keyed by UiNode identity) so the graph stays structural and
 * the renderer/hit-testing read geometry from one place. The
 * engine knows nothing about Canvas, WebGPU, or the DOM: it
 * produces numbers only.
 *
 *   measure: bottom-up, dirty subtrees only, early-stop via
 *            idempotent measured-size comparison
 *   place:   top-down, dirty paths only, re-places a child's
 *            descendants only when its box actually changed
 *
 * Flex is two-pass, as in CSS: items are first measured at their
 * max-content size to obtain a flex base, the main axis is resolved,
 * and any item whose main size changed is measured again at that size
 * so a cross size that depends on it — wrapped text above all — comes
 * out right. The second pass only touches items that actually flexed.
 *
 * Scroll offset is a coordinate-space translation stored on the
 * container record; descendants keep content coordinates, so
 * scrolling never re-measures or re-places them.
 */
export class LayoutEngine {
  private readonly records = new Map<UiNode, LayoutRecord>();
  private readonly scrollNodes = new Set<UiNode>();
  private readonly textMeasurer: TextMeasurer;
  private layoutRoot: UiNode | null = null;
  private rootConstraints: Constraints = Constraints.unbounded();

  constructor(textMeasurer: TextMeasurer = new CharacterCountTextMeasurer()) {
    this.textMeasurer = textMeasurer;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  recordFor(node: UiNode): LayoutRecord | undefined {
    return this.records.get(node);
  }

  /**
   * Full layout pass for a subtree. Every record in the subtree
   * is measured and placed; other records are dropped.
   */
  layout(node: UiNode, constraints: Constraints): LayoutResult {
    this.layoutRoot = node;
    this.rootConstraints = constraints;
    this.records.clear();
    this.scrollNodes.clear();
    this.measure(node, constraints);
    const rec = this.record(node);
    const rootBox = this.computeRootBox();
    this.assignBox(node, 0, 0, rootBox.width, rootBox.height);
    this.place(node);
    this.applyScroll();
    const isScroll = node.type === UiNodeType.ScrollView;
    return {
      root: node,
      box: { x: rec.x, y: rec.y, width: rec.width, height: rec.height },
      contentWidth: rec.contentWidth,
      contentHeight: rec.contentHeight,
      scrollX: rec.scrollX,
      scrollY: rec.scrollY,
      clip: isScroll
        ? { x: rec.scrollX, y: rec.scrollY, width: rec.width, height: rec.height }
        : { x: 0, y: 0, width: rec.width, height: rec.height }
    };
  }

  /**
   * Incremental layout driven by a scheduler frame. Only dirty
   * subtrees are re-measured and re-placed; transform-only
   * changes skip layout entirely.
   */
  layoutForFrame(frame: UiFrame, constraints: Constraints, root?: UiNode): void {
    if (root !== undefined) {
      this.layoutRoot = root;
      this.rootConstraints = constraints;
    } else if (this.layoutRoot === null) {
      throw new Error('LayoutEngine has no layout root. Call layout() first.');
    } else {
      this.rootConstraints = constraints;
    }

    let anyLayout = false;
    for (const node of frame.nodes) {
      const flags = frame.dirtyFlagsFor(node);
      if ((flags & (DirtyFlags.Layout | DirtyFlags.Children | DirtyFlags.SubtreeLayout)) !== 0) {
        anyLayout = true;
        this.markLayoutDirty(node);
      }
      if ((flags & DirtyFlags.Transform) !== 0) {
        this.record(node).transformDirty = true;
        this.scrollNodes.add(node);
      }
    }

    if (!anyLayout) {
      this.applyScroll();
      return;
    }

    this.measure(this.layoutRoot, constraints);
    const rootRec = this.record(this.layoutRoot);
    const rootBox = this.computeRootBox();
    this.assignBox(this.layoutRoot, 0, 0, rootBox.width, rootBox.height);
    if (rootRec.placeDirty) {
      this.place(this.layoutRoot);
    }
    this.applyScroll();
  }

  /**
   * Border box of a node in layout coordinates (relative to the
   * layout root). For scroll containers this is also the clip.
   */
  worldBoxTo(node: UiNode, out: LayoutBox): LayoutBox {
    const rec = this.records.get(node);
    if (rec === undefined) {
      out.x = 0;
      out.y = 0;
      out.width = 0;
      out.height = 0;
      return out;
    }
    accumulatedOffsetTo(node, this.records, out);
    out.width = rec.width;
    out.height = rec.height;
    return out;
  }

  worldBox(node: UiNode): LayoutBox {
    return this.worldBoxTo(node, { x: 0, y: 0, width: 0, height: 0 });
  }

  /**
   * The visible window of a scroll container over its content,
   * in content coordinates.
   */
  contentWindow(node: UiNode): LayoutBox {
    const rec = this.records.get(node);
    if (rec === undefined) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: rec.scrollX, y: rec.scrollY, width: rec.width, height: rec.height };
  }

  /**
   * Drops layout records for a removed subtree. Wired to
   * UiGraph's node-removal listener.
   */
  detachNode(node: UiNode): void {
    const stack: UiNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      this.records.delete(current);
      this.scrollNodes.delete(current);
      for (let child = current.firstChild; child !== null; child = child.nextSibling) {
        stack.push(child);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Measurement
  // ---------------------------------------------------------------------------

  private measure(node: UiNode, constraints: Constraints): void {
    const rec = this.record(node);
    if (this.isFragment(node)) {
      // Fragments are transparent graph anchors. Their children are
      // measured, but the fragment itself contributes zero size.
      this.forEachLayoutChild(node, child => this.measure(child, constraints));
      rec.measuredWidth = 0;
      rec.measuredHeight = 0;
      rec.outerWidth = 0;
      rec.outerHeight = 0;
      rec.measureDirty = false;
      return;
    }
    if (!rec.measureDirty && constraintsEqual(rec.lastConstraints, constraints)) {
      return;
    }
    rec.lastConstraints = constraints;
    this.resolveLayoutProps(node, rec);
    rec.hasBaseline = false;
    const effective = this.effectiveConstraints(node, constraints);
    let size: Size;
    if (
      node.type === UiNodeType.Row ||
      node.type === UiNodeType.Column ||
      node.type === UiNodeType.ScrollView ||
      node.hasChildren()
    ) {
      size = this.measureContainer(node, rec, effective);
    } else {
      size = this.measureLeaf(node, rec, effective);
    }
    // A tight axis is the parent's decision (a flexed main size, a
    // stretched cross size, the viewport) and wins outright. A loose
    // axis only set the available space: content that cannot fit it
    // overflows, as in CSS, clamped by the node's own min/max alone.
    rec.measuredWidth =
      effective.minWidth === effective.maxWidth
        ? effective.minWidth
        : this.clamp(Math.max(size.width, effective.minWidth), rec.minWidth, rec.maxWidth);
    rec.measuredHeight =
      effective.minHeight === effective.maxHeight
        ? effective.minHeight
        : this.clamp(Math.max(size.height, effective.minHeight), rec.minHeight, rec.maxHeight);
    rec.outerWidth = rec.measuredWidth + rec.marginLeft + rec.marginRight;
    rec.outerHeight = rec.measuredHeight + rec.marginTop + rec.marginBottom;
    rec.measureDirty = false;
  }

  private measureContainer(node: UiNode, rec: LayoutRecord, effective: Constraints): Size {
    const content = this.contentConstraints(rec, effective);
    if (node.type === UiNodeType.ScrollView) {
      return this.measureScroll(node, rec, content);
    }
    if (node.type === UiNodeType.Row || node.type === UiNodeType.Column) {
      return this.measureFlex(
        node,
        rec,
        content,
        node.type === UiNodeType.Row ? FlexDirection.Row : FlexDirection.Column
      );
    }
    return this.measureStack(node, rec, content);
  }

  /** Constraints for a container's content box: the border box less padding. */
  private contentConstraints(rec: LayoutRecord, effective: Constraints): Constraints {
    const paddingH = rec.paddingLeft + rec.paddingRight;
    const paddingV = rec.paddingTop + rec.paddingBottom;
    return new Constraints(
      Math.max(0, effective.minWidth - paddingH),
      Math.max(0, effective.maxWidth - paddingH),
      Math.max(0, effective.minHeight - paddingV),
      Math.max(0, effective.maxHeight - paddingV)
    );
  }

  private measureFlex(node: UiNode, rec: LayoutRecord, content: Constraints, direction: FlexDirection): Size {
    const row = direction === FlexDirection.Row;
    const paddingMain = row ? rec.paddingLeft + rec.paddingRight : rec.paddingTop + rec.paddingBottom;
    const paddingCross = row ? rec.paddingTop + rec.paddingBottom : rec.paddingLeft + rec.paddingRight;
    const items = this.collectFlexItems(node, content, direction);
    if (items.length === 0) {
      return { width: paddingMain, height: paddingCross };
    }
    const gap = this.numberProp(node, 'gap') ?? 0;
    const gaps = gap * (items.length - 1);

    let baseTotal = gaps;
    for (const item of items) {
      baseTotal += item.baseMain + item.marginMainStart + item.marginMainEnd;
    }

    // Resolve the main axis now when the outcome is already known:
    // the container's main size is definite (explicit or tight), or
    // the items overflow it and must shrink to exactly the available
    // space. Otherwise the container shrink-wraps its items and nothing
    // flexes here; a parent that then assigns a larger box (the layout
    // root filling its viewport, a stretched cross axis) gets the same
    // resolution and second pass from placeFlex.
    const mainMin = row ? content.minWidth : content.minHeight;
    const mainMax = row ? content.maxWidth : content.maxHeight;
    const mainBounded = isFinite(mainMax);
    const mainDefinite = mainBounded && mainMin === mainMax;
    let contentMain: number;
    if (mainBounded && (mainDefinite || baseTotal > mainMax)) {
      this.resolveFlexMain(items, mainMax - gaps, false);
      this.measureFlexedItems(items, content, direction, undefined);
      // Items that could not shrink enough overflow, and the container
      // is as wide as they are (fit-content), rather than pretending.
      let finalTotal = gaps;
      for (const item of items) {
        finalTotal += item.finalMain + item.marginMainStart + item.marginMainEnd;
      }
      contentMain = Math.max(mainMax, finalTotal);
    } else {
      contentMain = baseTotal;
    }

    const contentCross = this.flexLineCross(items, row);
    this.setFlexBaseline(rec, items, row);
    return {
      width: row ? paddingMain + contentMain : paddingCross + contentCross,
      height: row ? paddingCross + contentCross : paddingMain + contentMain
    };
  }

  /**
   * Measures each child at its flex base size and builds the items
   * the resolution steps work on.
   */
  private collectFlexItems(node: UiNode, content: Constraints, direction: FlexDirection): FlexItem[] {
    const row = direction === FlexDirection.Row;
    const containerAlign = parseCrossAxisAlignment(node.properties.get(row ? 'y' : 'x')) ?? CrossAxisAlignment.Start;
    const items: FlexItem[] = [];
    this.forEachLayoutChild(node, child => {
      const cRec = this.record(child);
      // Margins and min/max are needed before the child is measured,
      // to size its constraints; measure() resolves them again, cheaply.
      this.resolveLayoutProps(child, cRec);
      let align = parseCrossAxisAlignment(child.properties.get(row ? 'selfY' : 'selfX')) ?? containerAlign;
      if (!row && align === CrossAxisAlignment.Baseline) {
        align = CrossAxisAlignment.Start;
      }
      // Stretch only sizes an item whose cross size is auto; an explicit
      // one is left alone and start-aligned, as in CSS.
      if (align === CrossAxisAlignment.Stretch && this.numberProp(child, row ? 'height' : 'width') !== undefined) {
        align = CrossAxisAlignment.Start;
      }
      this.measure(child, this.flexChildConstraints(cRec, content, direction, align, undefined));
      const measuredMain = row ? cRec.measuredWidth : cRec.measuredHeight;
      const minMain = row ? cRec.minWidth : cRec.minHeight;
      const maxMain = row ? cRec.maxWidth : cRec.maxHeight;
      const baseMain = this.clamp(this.flexBasisMain(cRec, direction, measuredMain), minMain, maxMain);
      items.push({
        child,
        rec: cRec,
        baseMain,
        finalMain: baseMain,
        cross: row ? cRec.measuredHeight : cRec.measuredWidth,
        marginMainStart: row ? cRec.marginLeft : cRec.marginTop,
        marginMainEnd: row ? cRec.marginRight : cRec.marginBottom,
        marginCrossStart: row ? cRec.marginTop : cRec.marginLeft,
        marginCrossEnd: row ? cRec.marginBottom : cRec.marginRight,
        minMain,
        maxMain,
        grow: cRec.flexGrow,
        shrink: cRec.flexShrink,
        align
      });
    });
    return items;
  }

  /**
   * Constraints for measuring a flex child.
   *
   * The main axis is unbounded so the child reports its max-content
   * size — the CSS flex base for `flex-basis: auto` — unless a final
   * main size is supplied, which makes the axis tight. The cross axis
   * is bounded by the container's content box and, for a stretched
   * child of a container whose cross size is definite, tight: CSS
   * gives such an item its stretched size before measuring so that
   * text wraps at the width it will really have.
   *
   * A zero minimum on both axes keeps a tight parent from forcing a
   * child to fill it; explicit sizes and flexing decide the box.
   */
  private flexChildConstraints(
    cRec: LayoutRecord,
    content: Constraints,
    direction: FlexDirection,
    align: CrossAxisAlignment,
    mainTight: number | undefined
  ): Constraints {
    const row = direction === FlexDirection.Row;
    const marginCross = row ? cRec.marginTop + cRec.marginBottom : cRec.marginLeft + cRec.marginRight;
    const crossMin = row ? content.minHeight : content.minWidth;
    const crossMaxRaw = row ? content.maxHeight : content.maxWidth;
    const crossMax = Math.max(0, crossMaxRaw - marginCross);
    const crossDefinite = isFinite(crossMaxRaw) && crossMin === crossMaxRaw;
    const crossTight = align === CrossAxisAlignment.Stretch && crossDefinite;
    const mainMin = mainTight ?? 0;
    const mainMax = mainTight ?? Infinity;
    return row
      ? new Constraints(mainMin, mainMax, crossTight ? crossMax : 0, crossMax)
      : new Constraints(crossTight ? crossMax : 0, crossMax, mainMin, mainMax);
  }

  /**
   * Distributes free space (grow) or the deficit (shrink) over the
   * items and writes each item's finalMain. Returns the free space
   * left over for main-axis alignment.
   */
  private resolveFlexMain(items: FlexItem[], availableMain: number, isScroll: boolean): number {
    let totalOuterMain = 0;
    for (const item of items) {
      item.finalMain = item.baseMain;
      totalOuterMain += item.baseMain + item.marginMainStart + item.marginMainEnd;
    }
    let freeSpace = availableMain - totalOuterMain;

    if (isScroll) {
      // Scroll content overflows its viewport instead of compressing
      // into it: flex shrink/grow on the scroll axis would crush
      // (or stretch) items that merely need to scroll. Items keep
      // their measured main size; the viewport is a window, and only
      // the cross axis still constrains stretch.
      return 0;
    }

    if (freeSpace > 0) {
      let sumGrow = 0;
      for (const item of items) {
        sumGrow += item.grow;
      }
      if (sumGrow > 0) {
        const unit = freeSpace / sumGrow;
        let distributed = 0;
        for (const item of items) {
          if (item.grow <= 0) {
            continue;
          }
          const target = this.clamp(item.baseMain + unit * item.grow, item.minMain, item.maxMain);
          distributed += target - item.baseMain;
          item.finalMain = target;
        }
        freeSpace = Math.max(0, freeSpace - distributed);
      }
      return freeSpace;
    }

    if (freeSpace < 0) {
      const deficit = -freeSpace;
      let sumShrinkWeight = 0;
      for (const item of items) {
        sumShrinkWeight += item.shrink * item.baseMain;
      }
      if (sumShrinkWeight > 0) {
        for (const item of items) {
          if (item.shrink <= 0 || item.baseMain <= 0) {
            continue;
          }
          const weight = item.shrink * item.baseMain;
          item.finalMain = this.clamp(item.baseMain - (deficit * weight) / sumShrinkWeight, item.minMain, item.maxMain);
        }
      }
    }
    return 0;
  }

  /**
   * Second measurement pass: any item whose main size changed is
   * measured again at that size so its cross size reflects it, and a
   * stretched item learns its definite cross size. Items that did not
   * flex early-stop inside measure().
   */
  private measureFlexedItems(
    items: FlexItem[],
    content: Constraints,
    direction: FlexDirection,
    crossAvailable: number | undefined
  ): void {
    const row = direction === FlexDirection.Row;
    for (const item of items) {
      const measuredMain = row ? item.rec.measuredWidth : item.rec.measuredHeight;
      const stretched = item.align === CrossAxisAlignment.Stretch && crossAvailable !== undefined;
      if (item.finalMain === measuredMain && !stretched) {
        continue;
      }
      let constraints = this.flexChildConstraints(item.rec, content, direction, item.align, item.finalMain);
      if (stretched) {
        const cross = Math.max(0, crossAvailable - item.marginCrossStart - item.marginCrossEnd);
        constraints = row
          ? new Constraints(constraints.minWidth, constraints.maxWidth, cross, cross)
          : new Constraints(cross, cross, constraints.minHeight, constraints.maxHeight);
      }
      this.measure(item.child, constraints);
      item.cross = row ? item.rec.measuredHeight : item.rec.measuredWidth;
    }
  }

  /**
   * Cross size of the single flex line: the tallest margin box, or for
   * a baseline-aligned row the span from the highest item top to the
   * lowest item bottom once baselines coincide.
   */
  private flexLineCross(items: FlexItem[], row: boolean): number {
    let crossMax = 0;
    let above = 0;
    let below = 0;
    for (const item of items) {
      const outer = item.cross + item.marginCrossStart + item.marginCrossEnd;
      if (row && item.align === CrossAxisAlignment.Baseline) {
        const baseline = item.marginCrossStart + this.itemBaseline(item);
        above = Math.max(above, baseline);
        below = Math.max(below, outer - baseline);
      } else {
        crossMax = Math.max(crossMax, outer);
      }
    }
    return Math.max(crossMax, above + below);
  }

  /**
   * An item's first baseline measured from its border-box top. A node
   * without one synthesises it from its bottom edge, as CSS does.
   */
  private itemBaseline(item: FlexItem): number {
    return item.rec.hasBaseline ? item.rec.baseline : item.cross;
  }

  /**
   * The container's own first baseline, from its items: the shared
   * baseline of a baseline-aligned row, otherwise the first item's,
   * positioned as if aligned to the start edge.
   *
   * The start-edge assumption is what CSS does for the first item of a
   * column; for a row whose cross alignment is center or end it is an
   * approximation, accepted until nested baseline alignment needs it.
   */
  private setFlexBaseline(rec: LayoutRecord, items: FlexItem[], row: boolean): void {
    if (items.length === 0) {
      return;
    }
    if (row) {
      let above = 0;
      let any = false;
      for (const item of items) {
        if (item.align === CrossAxisAlignment.Baseline) {
          above = Math.max(above, item.marginCrossStart + this.itemBaseline(item));
          any = true;
        }
      }
      if (any) {
        rec.hasBaseline = true;
        rec.baseline = rec.paddingTop + above;
        return;
      }
    }
    const first = items[0];
    const marginTop = row ? first.marginCrossStart : first.marginMainStart;
    rec.hasBaseline = true;
    rec.baseline = rec.paddingTop + marginTop + this.itemBaseline(first);
  }

  private measureStack(node: UiNode, rec: LayoutRecord, content: Constraints): Size {
    let maxWidth = 0;
    let maxHeight = 0;
    let first = true;
    this.forEachLayoutChild(node, child => {
      this.measure(child, this.childConstraints(content));
      const cRec = this.record(child);
      maxWidth = Math.max(maxWidth, cRec.outerWidth);
      maxHeight = Math.max(maxHeight, cRec.outerHeight);
      if (first) {
        first = false;
        rec.hasBaseline = true;
        rec.baseline = rec.paddingTop + cRec.marginTop + (cRec.hasBaseline ? cRec.baseline : cRec.measuredHeight);
      }
    });
    return {
      width: rec.paddingLeft + rec.paddingRight + maxWidth,
      height: rec.paddingTop + rec.paddingBottom + maxHeight
    };
  }

  private measureScroll(node: UiNode, rec: LayoutRecord, content: Constraints): Size {
    const direction = this.scrollDirection(node);
    const vertical = direction === FlexDirection.Column;
    const gap = this.numberProp(node, 'gap') ?? 0;
    const paddingMain = vertical ? rec.paddingTop + rec.paddingBottom : rec.paddingLeft + rec.paddingRight;
    const paddingCross = vertical ? rec.paddingLeft + rec.paddingRight : rec.paddingTop + rec.paddingBottom;
    let mainTotal = 0;
    let crossMax = 0;
    let childCount = 0;
    this.forEachLayoutChild(node, child => {
      const childBase = new Constraints(
        0,
        vertical ? content.maxWidth : Infinity,
        0,
        vertical ? Infinity : content.maxHeight
      );
      this.measure(child, this.childConstraints(childBase));
      const cRec = this.record(child);
      const measuredMain = vertical ? cRec.measuredHeight : cRec.measuredWidth;
      const measuredCross = vertical ? cRec.measuredWidth : cRec.measuredHeight;
      const marginMain = vertical ? cRec.marginTop + cRec.marginBottom : cRec.marginLeft + cRec.marginRight;
      const marginCross = vertical ? cRec.marginLeft + cRec.marginRight : cRec.marginTop + cRec.marginBottom;
      mainTotal += measuredMain + marginMain;
      crossMax = Math.max(crossMax, measuredCross + marginCross);
      childCount++;
    });
    mainTotal += gap * Math.max(0, childCount - 1);
    const contentMain = mainTotal + paddingMain;
    const contentCross = crossMax + paddingCross;
    rec.contentWidth = vertical ? contentCross : contentMain;
    rec.contentHeight = vertical ? contentMain : contentCross;
    this.scrollNodes.add(node);

    const explicitWidth = this.numberProp(node, 'width');
    const explicitHeight = this.numberProp(node, 'height');
    const width = explicitWidth ?? (content.hasBoundedWidth() ? content.maxWidth : rec.contentWidth);
    const height = explicitHeight ?? (content.hasBoundedHeight() ? content.maxHeight : rec.contentHeight);
    return { width, height };
  }

  /**
   * A leaf is its content plus padding. Text content comes from the
   * paragraph layout, whose lines the renderer will draw unchanged.
   */
  private measureLeaf(node: UiNode, rec: LayoutRecord, effective: Constraints): Size {
    const paddingH = rec.paddingLeft + rec.paddingRight;
    const paddingV = rec.paddingTop + rec.paddingBottom;
    if (node.type === UiNodeType.Text || node.type === UiNodeType.Button) {
      const text = String(node.properties.get('text') ?? '');
      const fontSize = this.numberProp(node, 'fontSize') ?? DEFAULT_FONT_SIZE;
      const maxLines = this.numberProp(node, 'maxLines');
      const paragraph = this.textMeasurer.layout({
        text,
        fontSize,
        fontFamily: this.stringProp(node, 'fontFamily'),
        fontWeight: this.weightProp(node),
        lineHeight: this.numberProp(node, 'lineHeight'),
        maxWidth: isFinite(effective.maxWidth) ? Math.max(0, effective.maxWidth - paddingH) : undefined,
        wrap: this.textWrapProp(node),
        maxLines: maxLines !== undefined && maxLines >= 1 ? Math.floor(maxLines) : undefined,
        overflow: this.textOverflowProp(node)
      });
      rec.hasBaseline = true;
      rec.baseline = rec.paddingTop + paragraph.firstBaseline;
      rec.minContentWidth = paragraph.minContentWidth + paddingH;
      rec.maxContentWidth = paragraph.maxContentWidth + paddingH;
      return { width: paragraph.width + paddingH, height: paragraph.height + paddingV };
    }
    rec.minContentWidth = paddingH;
    rec.maxContentWidth = paddingH;
    return { width: paddingH, height: paddingV };
  }

  // ---------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------

  private place(node: UiNode): void {
    const rec = this.record(node);
    if (this.isFragment(node)) {
      // Fragments are transparent: pass placement through to children.
      rec.placeDirty = false;
      this.forEachLayoutChild(node, child => {
        if (this.record(child).placeDirty) {
          this.place(child);
        }
      });
      return;
    }
    if (!rec.placeDirty) {
      return;
    }
    rec.placeDirty = false;
    if (!node.hasChildren()) {
      return;
    }
    if (node.type === UiNodeType.Row || node.type === UiNodeType.Column) {
      this.placeFlex(node, rec, node.type === UiNodeType.Row ? FlexDirection.Row : FlexDirection.Column);
    } else if (node.type === UiNodeType.ScrollView) {
      this.placeFlex(node, rec, this.scrollDirection(node));
    } else {
      this.placeStack(node, rec);
    }
    this.forEachLayoutChild(node, child => {
      if (this.record(child).placeDirty) {
        this.place(child);
      }
    });
  }

  private placeFlex(node: UiNode, rec: LayoutRecord, direction: FlexDirection): void {
    const row = direction === FlexDirection.Row;
    const isScroll = node.type === UiNodeType.ScrollView;
    const content = this.contentConstraints(rec, this.effectiveConstraints(node, rec.lastConstraints));
    const items = this.collectFlexItems(node, content, direction);
    if (items.length === 0) {
      return;
    }
    const mainAlign = parseMainAxisAlignment(node.properties.get(row ? 'x' : 'y'));
    const gap = this.numberProp(node, 'gap') ?? 0;

    const paddingH = rec.paddingLeft + rec.paddingRight;
    const paddingV = rec.paddingTop + rec.paddingBottom;
    const contentX = rec.x + rec.paddingLeft;
    const contentY = rec.y + rec.paddingTop;
    const contentMain = Math.max(0, (row ? rec.width : rec.height) - (row ? paddingH : paddingV));
    const contentCross = Math.max(0, (row ? rec.height : rec.width) - (row ? paddingV : paddingH));

    let freeSpace = this.resolveFlexMain(items, contentMain - gap * (items.length - 1), isScroll);
    // Scroll content keeps its size; the leftover is not alignable space.
    if (isScroll) {
      freeSpace = 0;
    }
    // Items are now at their final main size and stretched items know
    // their cross size, so a cross size that depends on either — wrapped
    // text — is right before boxes are assigned.
    this.measureFlexedItems(items, content, direction, isScroll ? undefined : contentCross);

    let leading = 0;
    let between = gap;
    if (freeSpace > 0) {
      switch (mainAlign) {
        case MainAxisAlignment.Center:
          leading = freeSpace / 2;
          break;
        case MainAxisAlignment.End:
          leading = freeSpace;
          break;
        case MainAxisAlignment.SpaceBetween:
          if (items.length > 1) {
            between = gap + freeSpace / (items.length - 1);
          }
          break;
        case MainAxisAlignment.SpaceEvenly: {
          const slot = freeSpace / (items.length + 1);
          leading = slot;
          between = gap + slot;
          break;
        }
        case MainAxisAlignment.SpaceAround: {
          const slot = freeSpace / items.length;
          leading = slot / 2;
          between = gap + slot;
          break;
        }
        default:
          break;
      }
    }

    // Baseline alignment: the shared baseline sits `above` below the
    // cross start, where `above` is the largest distance from any
    // participating item's margin-box top to its baseline.
    let above = 0;
    if (row) {
      for (const item of items) {
        if (item.align === CrossAxisAlignment.Baseline) {
          above = Math.max(above, item.marginCrossStart + this.itemBaseline(item));
        }
      }
    }

    const contentStart = row ? contentX : contentY;
    const crossStart = row ? contentY : contentX;
    let mainCursor = contentStart + leading;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const mainPos = mainCursor + item.marginMainStart;
      mainCursor += item.marginMainStart;

      const marginCross = item.marginCrossStart + item.marginCrossEnd;
      const outerCross = item.cross + marginCross;
      let crossPos: number;
      let crossDim: number;
      switch (item.align) {
        case CrossAxisAlignment.Stretch:
          crossDim = Math.max(0, contentCross - marginCross);
          crossPos = crossStart + item.marginCrossStart;
          break;
        case CrossAxisAlignment.Center:
          crossDim = item.cross;
          crossPos = crossStart + item.marginCrossStart + (contentCross - outerCross) / 2;
          break;
        case CrossAxisAlignment.End:
          crossDim = item.cross;
          crossPos = crossStart + (contentCross - outerCross) + item.marginCrossStart;
          break;
        case CrossAxisAlignment.Baseline:
          crossDim = item.cross;
          crossPos = crossStart + above - this.itemBaseline(item);
          break;
        default:
          crossDim = item.cross;
          crossPos = crossStart + item.marginCrossStart;
          break;
      }

      const x = row ? mainPos : crossPos;
      const y = row ? crossPos : mainPos;
      const width = row ? item.finalMain : crossDim;
      const height = row ? crossDim : item.finalMain;
      this.assignBox(item.child, x, y, width, height);

      mainCursor += item.finalMain + item.marginMainEnd;
      if (i < items.length - 1) {
        mainCursor += between;
      }
    }
  }

  private placeStack(node: UiNode, rec: LayoutRecord): void {
    const contentX = rec.x + rec.paddingLeft;
    const contentY = rec.y + rec.paddingTop;
    this.forEachLayoutChild(node, child => {
      const cRec = this.record(child);
      this.assignBox(child, contentX, contentY, cRec.measuredWidth, cRec.measuredHeight);
    });
  }

  // ---------------------------------------------------------------------------
  // Invalidation
  // ---------------------------------------------------------------------------

  private markLayoutDirty(node: UiNode): void {
    let current: UiNode | null = node;
    while (current !== null) {
      if (current === this.layoutRoot) {
        this.record(current).measureDirty = true;
        this.record(current).placeDirty = true;
        return;
      }
      const rec = this.records.get(current);
      if (rec !== undefined) {
        rec.measureDirty = true;
        rec.placeDirty = true;
      }
      current = current.parent;
    }
  }

  private applyScroll(): void {
    for (const node of this.scrollNodes) {
      const rec = this.record(node);
      const rawX = this.numberProp(node, 'scrollX') ?? 0;
      const rawY = this.numberProp(node, 'scrollY') ?? 0;
      const maxX = Math.max(0, rec.contentWidth - rec.width);
      const maxY = Math.max(0, rec.contentHeight - rec.height);
      rec.scrollX = this.clamp(rawX, 0, maxX);
      rec.scrollY = this.clamp(rawY, 0, maxY);
      rec.transformDirty = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private record(node: UiNode): LayoutRecord {
    let rec = this.records.get(node);
    if (rec === undefined) {
      rec = new LayoutRecord(node);
      this.records.set(node, rec);
    }
    return rec;
  }

  private computeRootBox(): Size {
    const rec = this.record(this.layoutRoot!);
    const constraints = this.rootConstraints;
    let width = rec.measuredWidth;
    let height = rec.measuredHeight;
    // A root without an explicit size fills the bounded constraints
    // (app-viewport behavior); an explicit size wins instead.
    const explicitWidth = this.numberProp(this.layoutRoot!, 'width');
    const explicitHeight = this.numberProp(this.layoutRoot!, 'height');
    if (explicitWidth === undefined && constraints.hasBoundedWidth()) {
      width = constraints.maxWidth;
    }
    if (explicitHeight === undefined && constraints.hasBoundedHeight()) {
      height = constraints.maxHeight;
    }
    width = Math.max(width, constraints.minWidth);
    height = Math.max(height, constraints.minHeight);
    return { width, height };
  }

  private resolveLayoutProps(node: UiNode, rec: LayoutRecord): void {
    const props = node.properties;
    rec.flexGrow = this.numberProp(node, 'flexGrow') ?? 0;
    rec.flexShrink = this.numberProp(node, 'flexShrink') ?? 1;
    rec.flexBasis = this.numberProp(node, 'flexBasis');
    rec.minWidth = this.numberProp(node, 'minWidth') ?? 0;
    rec.maxWidth = this.numberProp(node, 'maxWidth') ?? Infinity;
    rec.minHeight = this.numberProp(node, 'minHeight') ?? 0;
    rec.maxHeight = this.numberProp(node, 'maxHeight') ?? Infinity;
    rec.paddingLeft = this.spacingProp(props, 'padding', 'paddingLeft');
    rec.paddingRight = this.spacingProp(props, 'padding', 'paddingRight');
    rec.paddingTop = this.spacingProp(props, 'padding', 'paddingTop');
    rec.paddingBottom = this.spacingProp(props, 'padding', 'paddingBottom');
    rec.marginLeft = this.spacingProp(props, 'margin', 'marginLeft');
    rec.marginRight = this.spacingProp(props, 'margin', 'marginRight');
    rec.marginTop = this.spacingProp(props, 'margin', 'marginTop');
    rec.marginBottom = this.spacingProp(props, 'margin', 'marginBottom');
  }

  /**
   * The constraints a node sizes itself under: the parent's, combined
   * with its own size properties.
   *
   * Per axis: a tight parent constraint is authoritative and the node's
   * own properties are ignored (the parent has flexed or stretched it).
   * Otherwise an explicit size, clamped by the node's own min/max,
   * makes the axis tight even when it exceeds the parent's bound — the
   * node overflows rather than being squeezed. Without an explicit
   * size the bounds intersect, and the parent's max is the available
   * space content lays out against.
   */
  private effectiveConstraints(node: UiNode, constraints: Constraints): Constraints {
    const width = this.axisConstraints(
      constraints.minWidth,
      constraints.maxWidth,
      this.numberProp(node, 'width'),
      this.numberProp(node, 'minWidth') ?? 0,
      this.numberProp(node, 'maxWidth') ?? Infinity
    );
    const height = this.axisConstraints(
      constraints.minHeight,
      constraints.maxHeight,
      this.numberProp(node, 'height'),
      this.numberProp(node, 'minHeight') ?? 0,
      this.numberProp(node, 'maxHeight') ?? Infinity
    );
    return new Constraints(width[0], width[1], height[0], height[1]);
  }

  private axisConstraints(
    parentMin: number,
    parentMax: number,
    own: number | undefined,
    ownMin: number,
    ownMax: number
  ): [number, number] {
    if (parentMin === parentMax) {
      return [parentMin, parentMax];
    }
    const min = Math.max(0, ownMin);
    // Like CSS, a min bound wins over a conflicting max bound.
    const max = Math.max(min, ownMax);
    if (own !== undefined) {
      const size = this.clamp(own, min, max);
      return [size, size];
    }
    const lower = Math.max(parentMin, min);
    return [lower, Math.max(lower, Math.min(parentMax, max))];
  }

  /**
   * Constraints for measuring a child of a stack or scroll container:
   * the container's available space with a zero minimum, so a tight
   * parent never forces a child to fill it. The child applies its own
   * size properties itself, in measure().
   */
  private childConstraints(content: Constraints): Constraints {
    return new Constraints(0, content.maxWidth, 0, content.maxHeight);
  }

  private flexBasisMain(rec: LayoutRecord, direction: FlexDirection, measuredMain: number): number {
    if (rec.flexBasis === undefined) {
      return measuredMain;
    }
    const minMain = direction === FlexDirection.Row ? rec.minWidth : rec.minHeight;
    const maxMain = direction === FlexDirection.Row ? rec.maxWidth : rec.maxHeight;
    return this.clamp(rec.flexBasis, minMain, maxMain);
  }

  private assignBox(node: UiNode, x: number, y: number, width: number, height: number): void {
    const rec = this.record(node);
    if (rec.x !== x || rec.y !== y || rec.width !== width || rec.height !== height) {
      rec.x = x;
      rec.y = y;
      rec.width = width;
      rec.height = height;
      rec.placeDirty = true;
    }
  }

  private scrollDirection(node: UiNode): FlexDirection {
    return parseFlexDirection(node.properties.get('direction')) ?? FlexDirection.Column;
  }

  /**
   * Iterates over a node's children, transparently expanding Fragment
   * anchors so their children participate in layout as if they were
   * direct children of the parent.
   */
  private forEachLayoutChild(node: UiNode, callback: (child: UiNode) => void): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (this.isFragment(child)) {
        this.forEachLayoutChild(child, callback);
      } else {
        callback(child);
      }
    }
  }

  private isFragment(node: UiNode): boolean {
    return node.type === UiNodeType.Fragment;
  }

  private numberProp(node: UiNode, property: string): number | undefined {
    const value = node.properties.get(property);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  }

  private stringProp(node: UiNode, property: string): string | undefined {
    const value = node.properties.get(property);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    return undefined;
  }

  private textWrapProp(node: UiNode): TextWrap | undefined {
    const value = node.properties.get('textWrap');
    if (value === 'none' || value === 'nowrap') {
      return 'none';
    }
    if (value === 'char' || value === 'word') {
      return value;
    }
    return undefined;
  }

  private textOverflowProp(node: UiNode): TextOverflow | undefined {
    const value = node.properties.get('textOverflow');
    return value === 'ellipsis' ? 'ellipsis' : undefined;
  }

  private weightProp(node: UiNode): string | number | undefined {
    const value = node.properties.get('fontWeight');
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  }

  private spacingProp(props: ReadonlyMap<string, unknown>, base: string, side: string): number {
    const explicit = props.get(side);
    if (explicit !== undefined) {
      return this.toNumber(explicit) ?? 0;
    }
    const shorthand = props.get(base);
    if (shorthand !== undefined) {
      return this.toNumber(shorthand) ?? 0;
    }
    return 0;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
