import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiFrame } from '../scheduler/UiFrame';
import {
  AlignContent,
  CrossAxisAlignment,
  MainAxisAlignment,
  parseAlignContent,
  parseCrossAxisAlignment,
  parseMainAxisAlignment
} from './Alignment';
import { resolveString } from '../properties/UiPropertyResolver';
import { resolveLength } from './UiLength';
import { FlexDirection, parseFlexDirection } from './FlexDirection';
import { LayoutRecord } from './LayoutRecord';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { TextMeasurer, TextOverflow, TextWrap } from './TextMeasurer';
import { accumulatedOffsetTo } from './LayoutTransform';
import { Constraints, constraintsEqual } from './LayoutTypes';
import type { LayoutBox, LayoutResult, Size } from './LayoutTypes';

const DEFAULT_FONT_SIZE = 14;
/** How long overlay scrollbars stay after the last scroll change. */
export const SCROLLBAR_LINGER_MS = 1200;
/** Portion of the linger during which the scrollbar fades out. */
export const SCROLLBAR_FADE_MS = 350;

export interface ScrollAdjustment {
  container: UiNode;
  scrollX: number;
  scrollY: number;
}

interface FlexItem {
  child: UiNode;
  rec: LayoutRecord;
  /** Flex base size: max-content along the main axis, or flexBasis. */
  baseMain: number;
  /** Base size clamped to the item's min/max. */
  hypotheticalMain: number;
  finalMain: number;
  /** Cross size after the second measurement pass, margins excluded. */
  cross: number;
  /** Margins; auto ones start at 0 and grow when free space is shared out. */
  marginMainStart: number;
  marginMainEnd: number;
  marginCrossStart: number;
  marginCrossEnd: number;
  marginMainStartAuto: boolean;
  marginMainEndAuto: boolean;
  marginCrossStartAuto: boolean;
  marginCrossEndAuto: boolean;
  minMain: number;
  maxMain: number;
  grow: number;
  shrink: number;
  align: CrossAxisAlignment;
  /** Resolution state (CSS Flexbox §9.7). */
  frozen: boolean;
  violation: number;
}

interface FlexLine {
  items: FlexItem[];
  cross: number;
  crossStart: number;
  /** Main-axis space left after flexing and auto margins. */
  free?: number;
  /** Cross-axis spacing from alignContent. */
  leading?: number;
  between?: number;
}

interface FlexConfig {
  row: boolean;
  isScroll: boolean;
  gapMain: number;
  gapLine: number;
  wrap: boolean;
  wrapReverse: boolean;
  mainReversed: boolean;
  mainAlign: MainAxisAlignment;
  crossAlign: CrossAxisAlignment;
  alignContent: AlignContent;
  paddingMainStart: number;
  paddingCrossStart: number;
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
  /** Absolutely positioned nodes placed against an anchor node. */
  private readonly anchoredNodes = new Set<UiNode>();
  /** position: 'sticky' nodes, re-offset whenever anything scrolls. */
  private readonly stickyNodes = new Set<UiNode>();
  private readonly textMeasurer: TextMeasurer;
  /**
   * The definite size percentages resolve against while a container's
   * children are measured: its content box. Undefined on an axis whose
   * size is not yet known, which makes a percentage there behave as
   * `auto`, as CSS does with cyclic percentages.
   */
  private percentBase: { width: number | undefined; height: number | undefined } = {
    width: undefined,
    height: undefined
  };
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
    this.percentBase = this.rootPercentBase(constraints);
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
        // An anchored node sits next to something that may just have
        // scrolled; it is re-placed, cheaply, on the same frame.
        if (this.anchoredNodes.size > 0) {
          this.applyScroll();
          for (const anchored of this.anchoredNodes) {
            this.markLayoutDirty(anchored);
          }
          anyLayout = true;
        }
      }
    }

    if (!anyLayout) {
      this.applyScroll();
      return;
    }

    this.percentBase = this.rootPercentBase(constraints);
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
   * Where a node is actually seen: its record box shifted by every
   * scroll ancestor's offset and by the sticky offsets of the node and
   * its ancestors. Records stay in pre-scroll coordinates; this is the
   * projection renderers and hit testing agree on.
   */
  visibleBox(node: UiNode): LayoutBox {
    const rec = this.records.get(node);
    if (rec === undefined) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    let x = rec.x + rec.stickyOffsetX;
    let y = rec.y + rec.stickyOffsetY;
    for (let current = node.parent; current !== null; current = current.parent) {
      const ancestor = this.records.get(current);
      if (ancestor === undefined) {
        continue;
      }
      x += ancestor.stickyOffsetX;
      y += ancestor.stickyOffsetY;
      if (ancestor.scrollable) {
        x -= ancestor.scrollX;
        y -= ancestor.scrollY;
      }
    }
    return { x, y, width: rec.width, height: rec.height };
  }

  /**
   * The scroll offsets each scroll ancestor would need so that `node`
   * is inside its viewport, `padding` pixels from the nearest edge,
   * innermost first. Nothing is changed: the caller writes the offsets
   * (scrollX/scrollY properties) and marks the containers dirty, which
   * is how NodalRuntime.scrollIntoView keeps a focused row on screen.
   */
  revealAdjustments(node: UiNode, padding = 0): ScrollAdjustment[] {
    const rec = this.records.get(node);
    if (rec === undefined) {
      return [];
    }
    const adjustments: ScrollAdjustment[] = [];
    // The target's edges in the layout root's pre-scroll frame, brought
    // into each successive scroller's content space by removing the
    // offsets of the scrollers passed on the way up.
    let innerScrollX = 0;
    let innerScrollY = 0;
    for (let current = node.parent; current !== null; current = current.parent) {
      const container = this.records.get(current);
      if (container === undefined || !container.scrollable) {
        continue;
      }
      const left = rec.x - innerScrollX - padding;
      const right = rec.x + rec.width - innerScrollX + padding;
      const top = rec.y - innerScrollY - padding;
      const bottom = rec.y + rec.height - innerScrollY + padding;
      const viewLeft = container.x + container.scrollX;
      const viewTop = container.y + container.scrollY;
      let scrollX = container.scrollX;
      let scrollY = container.scrollY;
      if (left < viewLeft) {
        scrollX -= viewLeft - left;
      } else if (right > viewLeft + container.width) {
        scrollX += right - (viewLeft + container.width);
      }
      if (top < viewTop) {
        scrollY -= viewTop - top;
      } else if (bottom > viewTop + container.height) {
        scrollY += bottom - (viewTop + container.height);
      }
      scrollX = this.clamp(scrollX, 0, Math.max(0, container.contentWidth - container.width));
      scrollY = this.clamp(scrollY, 0, Math.max(0, container.contentHeight - container.height));
      if (scrollX !== container.scrollX || scrollY !== container.scrollY) {
        adjustments.push({ container: current, scrollX, scrollY });
      }
      innerScrollX += scrollX;
      innerScrollY += scrollY;
    }
    return adjustments;
  }

  /** Every scroll container that has been laid out. */
  scrollContainers(): Iterable<UiNode> {
    return this.scrollNodes;
  }

  /**
   * When the next scrollbar changes appearance (starts fading or
   * disappears), or undefined when none is showing. Lets a host schedule
   * the repaint that a fade needs without polling.
   */
  nextScrollbarChange(now: number): number | undefined {
    let next: number | undefined;
    for (const node of this.scrollNodes) {
      const rec = this.records.get(node);
      if (rec === undefined || rec.scrollbarVisibleUntil <= now) {
        continue;
      }
      if (rec.contentWidth <= rec.width && rec.contentHeight <= rec.height) {
        continue;
      }
      const fadeStart = rec.scrollbarVisibleUntil - SCROLLBAR_FADE_MS;
      const candidate = now < fadeStart ? fadeStart : now + 16;
      next = next === undefined ? candidate : Math.min(next, candidate);
    }
    return next;
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
      this.anchoredNodes.delete(current);
      this.stickyNodes.delete(current);
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
    if (rec.aspectRatio !== undefined) {
      size = this.applyAspectRatio(size, rec.aspectRatio, effective);
    }
    // The content's own height, before any explicit or parent size: the
    // "content size suggestion" a column uses for automatic minimums.
    rec.intrinsicHeight = size.height;
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
    const config = this.flexConfig(node, rec, direction);
    const mainMin = row ? content.minWidth : content.minHeight;
    const mainMax = row ? content.maxWidth : content.maxHeight;
    const mainBounded = isFinite(mainMax);
    const mainDefinite = mainBounded && mainMin === mainMax;
    const crossDefinite = row
      ? isFinite(content.maxHeight) && content.minHeight === content.maxHeight
      : isFinite(content.maxWidth) && content.minWidth === content.maxWidth;

    const items = this.collectFlexItems(node, content, direction, config, crossDefinite && !config.wrap);
    if (items.length === 0) {
      rec.minContentWidth = rec.paddingLeft + rec.paddingRight;
      return { width: paddingMain, height: paddingCross };
    }
    const lines = this.breakLines(items, config, mainBounded ? mainMax : Infinity);

    // Resolve the main axis now when the outcome is already known: the
    // container's main size is definite (explicit or tight), or a line
    // overflows and must shrink to the available space. Otherwise the
    // container shrink-wraps its items and nothing flexes here; a parent
    // that then assigns a larger box (the layout root filling its
    // viewport, a stretched cross axis) gets the same resolution and
    // second pass from placeFlex.
    let contentMain = 0;
    for (const line of lines) {
      const lineTotal = this.lineOuterMain(line, config.gapMain, 'hypothetical');
      if (mainBounded && (mainDefinite || lineTotal > mainMax)) {
        this.resolveLine(line, mainMax - config.gapMain * (line.items.length - 1), config);
        this.measureFlexedItems(line.items, content, direction, undefined);
        contentMain = Math.max(contentMain, this.lineOuterMain(line, config.gapMain, 'final'));
      } else {
        for (const item of line.items) {
          item.finalMain = item.hypotheticalMain;
        }
        contentMain = Math.max(contentMain, lineTotal);
      }
    }
    if (mainDefinite) {
      contentMain = Math.max(mainMax, contentMain);
    }

    let contentCross = 0;
    for (const line of lines) {
      line.cross = this.flexLineCross(line.items, row);
      contentCross += line.cross;
    }
    contentCross += config.gapLine * (lines.length - 1);

    this.setFlexBaseline(rec, lines[0].items, row);
    rec.minContentWidth = this.flexMinContentWidth(rec, items, row, config);
    return {
      width: row ? paddingMain + contentMain : paddingCross + contentCross,
      height: row ? paddingCross + contentCross : paddingMain + contentMain
    };
  }

  /**
   * The properties that shape a flex container, read once per pass.
   */
  private flexConfig(node: UiNode, rec: LayoutRecord, direction: FlexDirection): FlexConfig {
    const row = direction === FlexDirection.Row;
    const gap = this.numberProp(node, 'gap') ?? 0;
    const rowGap = this.numberProp(node, 'rowGap') ?? gap;
    const columnGap = this.numberProp(node, 'columnGap') ?? gap;
    const wrapValue = node.properties.get('flexWrap');
    const wrap = wrapValue === 'wrap' || wrapValue === 'wrap-reverse';
    const rawDirection = node.properties.get('direction');
    const reversedDirection = typeof rawDirection === 'string' && rawDirection.endsWith('-reverse');
    // A row's main axis runs right-to-left under rtl; alignment,
    // ordering and auto margins all mirror with it.
    const rtl = row && resolveString(node, 'textDirection') === 'rtl';
    return {
      row,
      isScroll: node.type === UiNodeType.ScrollView,
      gapMain: row ? columnGap : rowGap,
      gapLine: row ? rowGap : columnGap,
      wrap,
      wrapReverse: wrapValue === 'wrap-reverse',
      mainReversed: reversedDirection !== rtl,
      mainAlign: parseMainAxisAlignment(node.properties.get(row ? 'x' : 'y')),
      crossAlign: parseCrossAxisAlignment(node.properties.get(row ? 'y' : 'x')) ?? CrossAxisAlignment.Stretch,
      alignContent: parseAlignContent(node.properties.get('alignContent')),
      paddingMainStart: row ? rec.paddingLeft : rec.paddingTop,
      paddingCrossStart: row ? rec.paddingTop : rec.paddingLeft
    };
  }

  /**
   * Measures each child at its flex base size and builds the items
   * the resolution steps work on.
   *
   * `crossTightForStretch` is true for a single-line container whose
   * cross size is definite: CSS gives stretched items that size before
   * measuring (9.2.3), so text wraps at the width it will really have.
   */
  private collectFlexItems(
    node: UiNode,
    content: Constraints,
    direction: FlexDirection,
    config: FlexConfig,
    crossTightForStretch: boolean
  ): FlexItem[] {
    const row = direction === FlexDirection.Row;
    const items: FlexItem[] = [];
    const mainBase = this.definiteAxis(content, row ? 'width' : 'height');
    const crossBase = this.definiteAxis(content, row ? 'height' : 'width');
    const savedBase = this.percentBase;
    this.percentBase = row ? { width: mainBase, height: crossBase } : { width: crossBase, height: mainBase };
    this.forEachLayoutChild(node, child => {
      const cRec = this.record(child);
      // Margins and min/max are needed before the child is measured,
      // to size its constraints; measure() resolves them again, cheaply.
      this.resolveLayoutProps(child, cRec);
      let align = parseCrossAxisAlignment(child.properties.get(row ? 'selfY' : 'selfX')) ?? config.crossAlign;
      if (!row && align === CrossAxisAlignment.Baseline) {
        align = CrossAxisAlignment.Start;
      }
      // Stretch only sizes an item whose cross size is auto; an explicit
      // one is left alone and start-aligned, as in CSS.
      if (
        align === CrossAxisAlignment.Stretch &&
        this.lengthProp(child, row ? 'height' : 'width', row ? crossBase : crossBase) !== undefined
      ) {
        align = CrossAxisAlignment.Start;
      }
      this.measure(child, this.flexChildConstraints(cRec, content, direction, align, undefined, crossTightForStretch));
      const measuredMain = row ? cRec.measuredWidth : cRec.measuredHeight;
      const explicitMain = this.lengthProp(child, row ? 'width' : 'height', mainBase);
      const maxMain = row ? cRec.maxWidth : cRec.maxHeight;
      // Automatic minimum size (CSS `min-width: auto`): the smaller of
      // the specified main size and the content's min-content size, so
      // a text item never shrinks below its longest word and a column
      // never crushes an item below its content. Explicit minimums win;
      // scroll containers have none.
      let minMain: number;
      if (row ? cRec.minWidthAuto : cRec.minHeightAuto) {
        // Scroll containers and text that clips (ellipsis, maxLines) do
        // not have visible overflow, so CSS gives them no automatic
        // minimum; everything else keeps its min-content size.
        const clips =
          child.type === UiNodeType.ScrollView ||
          child.properties.get('textOverflow') === 'ellipsis' ||
          this.numberProp(child, 'maxLines') !== undefined;
        const contentSuggestion = clips ? 0 : row ? cRec.minContentWidth : cRec.intrinsicHeight;
        minMain = Math.min(contentSuggestion, explicitMain ?? Infinity, maxMain);
      } else {
        minMain = row ? cRec.minWidth : cRec.minHeight;
      }
      const basis = this.flexBasis(child, cRec, mainBase);
      const baseMain = basis ?? measuredMain;
      // Along a mirrored main axis (rtl, *-reverse) the physical start
      // margin is the logical end margin; positions are mirrored back
      // at placement, so the swap lands each margin on its own side.
      const physicalStart = row ? cRec.marginLeft : cRec.marginTop;
      const physicalEnd = row ? cRec.marginRight : cRec.marginBottom;
      const physicalStartAuto = row ? cRec.marginLeftAuto : cRec.marginTopAuto;
      const physicalEndAuto = row ? cRec.marginRightAuto : cRec.marginBottomAuto;
      items.push({
        child,
        rec: cRec,
        baseMain,
        hypotheticalMain: this.clamp(baseMain, minMain, maxMain),
        finalMain: baseMain,
        cross: row ? cRec.measuredHeight : cRec.measuredWidth,
        marginMainStart: config.mainReversed ? physicalEnd : physicalStart,
        marginMainEnd: config.mainReversed ? physicalStart : physicalEnd,
        marginCrossStart: row ? cRec.marginTop : cRec.marginLeft,
        marginCrossEnd: row ? cRec.marginBottom : cRec.marginRight,
        marginMainStartAuto: config.mainReversed ? physicalEndAuto : physicalStartAuto,
        marginMainEndAuto: config.mainReversed ? physicalStartAuto : physicalEndAuto,
        marginCrossStartAuto: row ? cRec.marginTopAuto : cRec.marginLeftAuto,
        marginCrossEndAuto: row ? cRec.marginBottomAuto : cRec.marginRightAuto,
        minMain,
        maxMain,
        grow: cRec.flexGrow,
        shrink: cRec.flexShrink,
        align,
        frozen: false,
        violation: 0
      });
    });
    this.percentBase = savedBase;
    return items;
  }

  /** `flexBasis`, resolved: a number, a percent of the main size, or undefined for content. */
  private flexBasis(child: UiNode, cRec: LayoutRecord, mainBase: number | undefined): number | undefined {
    const basis = this.lengthProp(child, 'flexBasis', mainBase);
    if (basis !== undefined) {
      return basis;
    }
    return cRec.flexBasisZero ? 0 : undefined;
  }

  /**
   * Constraints for measuring a flex child.
   *
   * The main axis is unbounded so the child reports its max-content
   * size — the CSS flex base for `flex-basis: auto` — unless a final
   * main size is supplied, which makes the axis tight. The cross axis
   * is bounded by the container's content box and, for a stretched
   * child of a single-line container whose cross size is definite,
   * tight.
   *
   * A zero minimum on both axes keeps a tight parent from forcing a
   * child to fill it; explicit sizes and flexing decide the box.
   */
  private flexChildConstraints(
    cRec: LayoutRecord,
    content: Constraints,
    direction: FlexDirection,
    align: CrossAxisAlignment,
    mainTight: number | undefined,
    crossTightForStretch: boolean
  ): Constraints {
    const row = direction === FlexDirection.Row;
    const marginCross = row ? cRec.marginTop + cRec.marginBottom : cRec.marginLeft + cRec.marginRight;
    const crossMaxRaw = row ? content.maxHeight : content.maxWidth;
    const crossMax = Math.max(0, crossMaxRaw - marginCross);
    const crossTight = align === CrossAxisAlignment.Stretch && crossTightForStretch;
    const mainMin = mainTight ?? 0;
    const mainMax = mainTight ?? Infinity;
    return row
      ? new Constraints(mainMin, mainMax, crossTight ? crossMax : 0, crossMax)
      : new Constraints(crossTight ? crossMax : 0, crossMax, mainMin, mainMax);
  }

  /**
   * Splits items into lines. Without wrapping, or with unbounded main
   * space, everything is one line; otherwise items go on a line while
   * their hypothetical outer sizes and the gaps between them fit, and
   * an item that fits nowhere starts a line of its own.
   */
  private breakLines(items: FlexItem[], config: FlexConfig, availableMain: number): FlexLine[] {
    if (!config.wrap || !isFinite(availableMain)) {
      return [{ items, cross: 0, crossStart: 0 }];
    }
    const lines: FlexLine[] = [];
    let current: FlexItem[] = [];
    let used = 0;
    for (const item of items) {
      const outer = item.hypotheticalMain + item.marginMainStart + item.marginMainEnd;
      const candidate = current.length === 0 ? outer : used + config.gapMain + outer;
      if (current.length > 0 && candidate > availableMain) {
        lines.push({ items: current, cross: 0, crossStart: 0 });
        current = [item];
        used = outer;
      } else {
        current.push(item);
        used = candidate;
      }
    }
    if (current.length > 0) {
      lines.push({ items: current, cross: 0, crossStart: 0 });
    }
    return lines;
  }

  private lineOuterMain(line: FlexLine, gap: number, size: 'hypothetical' | 'final'): number {
    let total = gap * (line.items.length - 1);
    for (const item of line.items) {
      total += (size === 'final' ? item.finalMain : item.hypotheticalMain) + item.marginMainStart + item.marginMainEnd;
    }
    return total;
  }

  /**
   * Resolves the flexible lengths of one line (CSS Flexbox §9.7).
   *
   * Items with a zero factor, or already clamped against the direction
   * of flexing, are frozen at their hypothetical size. The remaining
   * free space is then distributed by factor over the unfrozen items,
   * each is clamped to its min/max, and any item whose clamp fought the
   * distribution is frozen at the clamp — repeatedly, so space an item
   * could not take is redistributed to the ones that can, instead of
   * being left over.
   *
   * Returns the free space left for alignment. Scroll containers never
   * flex: content overflows a viewport rather than compressing into it.
   */
  private resolveLine(line: FlexLine, availableMain: number, config: FlexConfig): number {
    const items = line.items;
    if (config.isScroll) {
      for (const item of items) {
        item.finalMain = item.hypotheticalMain;
        item.frozen = true;
      }
      return 0;
    }
    let margins = 0;
    let hypothetical = 0;
    for (const item of items) {
      margins += item.marginMainStart + item.marginMainEnd;
      hypothetical += item.hypotheticalMain;
    }
    const growing = availableMain - margins - hypothetical > 0;

    for (const item of items) {
      const factor = growing ? item.grow : item.shrink;
      item.frozen =
        factor === 0 ||
        (growing && item.baseMain > item.hypotheticalMain) ||
        (!growing && item.baseMain < item.hypotheticalMain);
      item.finalMain = item.frozen ? item.hypotheticalMain : item.baseMain;
    }

    for (let guard = 0; guard <= items.length; guard++) {
      let frozenTotal = 0;
      let unfrozenBase = 0;
      let factorSum = 0;
      let scaledSum = 0;
      let unfrozen = 0;
      for (const item of items) {
        if (item.frozen) {
          frozenTotal += item.finalMain;
        } else {
          unfrozen++;
          unfrozenBase += item.baseMain;
          factorSum += growing ? item.grow : item.shrink;
          scaledSum += item.shrink * item.baseMain;
        }
      }
      if (unfrozen === 0) {
        break;
      }
      let free = availableMain - margins - frozenTotal - unfrozenBase;
      // A line whose factors sum below one only takes that fraction of
      // the free space, as the spec asks.
      if (factorSum < 1) {
        free *= factorSum;
      }

      let totalViolation = 0;
      for (const item of items) {
        if (item.frozen) {
          continue;
        }
        let target = item.baseMain;
        if (growing && factorSum > 0) {
          target = item.baseMain + (free * item.grow) / factorSum;
        } else if (!growing && scaledSum > 0) {
          target = item.baseMain - (Math.abs(free) * item.shrink * item.baseMain) / scaledSum;
        }
        const clamped = this.clamp(Math.max(0, target), item.minMain, item.maxMain);
        item.finalMain = clamped;
        item.violation = clamped - target;
        totalViolation += item.violation;
      }

      for (const item of items) {
        if (item.frozen) {
          continue;
        }
        if (
          totalViolation === 0 ||
          (totalViolation > 0 && item.violation > 0) ||
          (totalViolation < 0 && item.violation < 0)
        ) {
          item.frozen = true;
        }
      }
    }

    let used = margins;
    for (const item of items) {
      used += item.finalMain;
    }
    return Math.max(0, availableMain - used);
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
      let constraints = this.flexChildConstraints(item.rec, content, direction, item.align, item.finalMain, false);
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
   * Cross size of one flex line: the tallest margin box, or for a
   * baseline-aligned row the span from the highest item top to the
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
   * The container's own first baseline, from its first line: the shared
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

  /**
   * A flex container's min-content width: the widest item contribution
   * when items can wrap or run vertically, their sum when they must sit
   * in one row.
   */
  private flexMinContentWidth(rec: LayoutRecord, items: FlexItem[], row: boolean, config: FlexConfig): number {
    let total = 0;
    for (const item of items) {
      const contribution =
        this.minContentContribution(item.child, item.rec) + item.rec.marginLeft + item.rec.marginRight;
      total = row && !config.wrap ? total + contribution : Math.max(total, contribution);
    }
    if (row && !config.wrap) {
      total += config.gapMain * (items.length - 1);
    }
    return total + rec.paddingLeft + rec.paddingRight;
  }

  /**
   * What a child contributes to its parent's min-content width: its
   * explicit width when it has one, else its own min-content width,
   * clamped to its min/max.
   */
  private minContentContribution(child: UiNode, cRec: LayoutRecord): number {
    if (child.type === UiNodeType.ScrollView) {
      return this.lengthProp(child, 'width', undefined) ?? 0;
    }
    const explicit = this.lengthProp(child, 'width', undefined);
    return this.clamp(explicit ?? cRec.minContentWidth, cRec.minWidth, cRec.maxWidth);
  }

  private measureStack(node: UiNode, rec: LayoutRecord, content: Constraints): Size {
    let maxWidth = 0;
    let maxHeight = 0;
    let minContent = 0;
    let first = true;
    const savedBase = this.percentBase;
    this.percentBase = { width: this.definiteAxis(content, 'width'), height: this.definiteAxis(content, 'height') };
    this.forEachLayoutChild(node, child => {
      this.measure(child, this.childConstraints(content));
      const cRec = this.record(child);
      maxWidth = Math.max(maxWidth, cRec.outerWidth);
      maxHeight = Math.max(maxHeight, cRec.outerHeight);
      minContent = Math.max(minContent, this.minContentContribution(child, cRec) + cRec.marginLeft + cRec.marginRight);
      if (first) {
        first = false;
        rec.hasBaseline = true;
        rec.baseline = rec.paddingTop + cRec.marginTop + (cRec.hasBaseline ? cRec.baseline : cRec.measuredHeight);
      }
    });
    this.percentBase = savedBase;
    rec.minContentWidth = rec.paddingLeft + rec.paddingRight + minContent;
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
    const savedBase = this.percentBase;
    this.percentBase = { width: this.definiteAxis(content, 'width'), height: this.definiteAxis(content, 'height') };
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
    this.percentBase = savedBase;
    // Scrollable content does not push on the outside world.
    rec.minContentWidth = rec.paddingLeft + rec.paddingRight;
    mainTotal += gap * Math.max(0, childCount - 1);
    const contentMain = mainTotal + paddingMain;
    const contentCross = crossMax + paddingCross;
    rec.contentWidth = vertical ? contentCross : contentMain;
    rec.contentHeight = vertical ? contentMain : contentCross;
    this.scrollNodes.add(node);

    const explicitWidth = this.lengthProp(node, 'width', savedBase.width);
    const explicitHeight = this.lengthProp(node, 'height', savedBase.height);
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
    // Out-of-flow children are positioned once the flow has settled,
    // against containing blocks that are already placed.
    this.placeAbsoluteChildren(node);
    this.updatePaintOrder(node, rec);
    if (rec.clips) {
      this.updateContentExtent(node, rec);
    }
    if (rec.scrollable) {
      this.scrollNodes.add(node);
    }
    this.forEachChild(node, child => {
      const cRec = this.record(child);
      if (cRec.sticky) {
        this.stickyNodes.add(child);
      } else {
        this.stickyNodes.delete(child);
      }
      if (cRec.placeDirty) {
        this.place(child);
      }
    });
  }

  /**
   * How far a clipping node's children reach, from its placed boxes:
   * the scrollable extent of a scroll container. A ScrollView measured
   * this already, but placement is the truth for any container.
   */
  private updateContentExtent(node: UiNode, rec: LayoutRecord): void {
    let right = rec.x + rec.paddingLeft;
    let bottom = rec.y + rec.paddingTop;
    this.forEachChild(node, child => {
      const cRec = this.record(child);
      right = Math.max(right, cRec.x + cRec.width + cRec.marginRight);
      bottom = Math.max(bottom, cRec.y + cRec.height + cRec.marginBottom);
    });
    rec.contentWidth = right - rec.x + rec.paddingRight;
    rec.contentHeight = bottom - rec.y + rec.paddingBottom;
  }

  /**
   * Positions the absolutely positioned children of `parent`.
   *
   * Each is measured now, against its containing block — the nearest
   * positioned ancestor, or the layout root — since it took no part in
   * the flow. With both edges of an axis set and no explicit size the
   * axis is tight; otherwise the child is its own size and one edge
   * decides where it goes, `left`/`top` winning over `right`/`bottom`.
   * A child with an `anchor` ignores its edges and is placed next to
   * the anchor instead.
   */
  private placeAbsoluteChildren(parent: UiNode): void {
    const savedBase = this.percentBase;
    this.forEachAbsoluteChild(parent, child => {
      const cRec = this.record(child);
      const block = this.containingBlockOf(child);
      this.percentBase = { width: block.width, height: block.height };
      this.resolveLayoutProps(child, cRec);
      const anchor = child.properties.get('anchor');
      if (anchor !== undefined && anchor !== null) {
        this.anchoredNodes.add(child);
        const anchorRec = this.records.get(anchor as UiNode);
        if (anchorRec !== undefined) {
          this.placeAnchored(child, cRec, anchorRec, anchor as UiNode, block);
          return;
        }
      } else {
        this.anchoredNodes.delete(child);
      }

      const marginH = cRec.marginLeft + cRec.marginRight;
      const marginV = cRec.marginTop + cRec.marginBottom;
      const availableWidth = Math.max(0, block.width - (cRec.left ?? 0) - (cRec.right ?? 0) - marginH);
      const availableHeight = Math.max(0, block.height - (cRec.top ?? 0) - (cRec.bottom ?? 0) - marginV);
      const tightWidth =
        cRec.left !== undefined &&
        cRec.right !== undefined &&
        this.lengthProp(child, 'width', block.width) === undefined;
      const tightHeight =
        cRec.top !== undefined &&
        cRec.bottom !== undefined &&
        this.lengthProp(child, 'height', block.height) === undefined;
      this.measure(
        child,
        new Constraints(
          tightWidth ? availableWidth : 0,
          availableWidth,
          tightHeight ? availableHeight : 0,
          availableHeight
        )
      );
      const width = cRec.measuredWidth;
      const height = cRec.measuredHeight;
      let x: number;
      if (cRec.left !== undefined) {
        x = block.x + cRec.left + cRec.marginLeft;
      } else if (cRec.right !== undefined) {
        x = block.x + block.width - cRec.right - cRec.marginRight - width;
      } else {
        x = block.x + cRec.marginLeft;
      }
      let y: number;
      if (cRec.top !== undefined) {
        y = block.y + cRec.top + cRec.marginTop;
      } else if (cRec.bottom !== undefined) {
        y = block.y + block.height - cRec.bottom - cRec.marginBottom - height;
      } else {
        y = block.y + cRec.marginTop;
      }
      this.assignBox(child, x, y, width, height);
    });
    this.percentBase = savedBase;
  }

  /**
   * Places an anchored node beside its anchor.
   *
   * `placement` names a side and, after a dash, an alignment along it
   * ('bottom-start', 'right-end'; the bare side centres). The node
   * flips to the opposite side when it would overflow the containing
   * block there and the opposite side has more room, and shifts along
   * the anchor so it stays inside the block. Anchor and node may live
   * under different scroll containers, so both positions are brought
   * into the same visible space before comparing them.
   */
  private placeAnchored(
    child: UiNode,
    cRec: LayoutRecord,
    anchorRec: LayoutRecord,
    anchor: UiNode,
    block: LayoutBox
  ): void {
    this.measure(child, new Constraints(0, Math.max(0, block.width), 0, Math.max(0, block.height)));
    const width = cRec.measuredWidth;
    const height = cRec.measuredHeight;
    const gap = this.numberProp(child, 'anchorOffset') ?? 0;
    const { side, align } = this.parsePlacement(child.properties.get('placement'));

    // Anchor box in the child's coordinate space.
    const scrollAnchor = this.scrollOffsetOf(anchor);
    const scrollChild = this.scrollOffsetOf(child);
    const ax = anchorRec.x - scrollAnchor.x + scrollChild.x;
    const ay = anchorRec.y - scrollAnchor.y + scrollChild.y;
    const aw = anchorRec.width;
    const ah = anchorRec.height;

    const vertical = side === 'top' || side === 'bottom';
    let resolvedSide = side;
    if (vertical) {
      const roomBelow = block.y + block.height - (ay + ah + gap);
      const roomAbove = ay - gap - block.y;
      if (side === 'bottom' && height > roomBelow && roomAbove > roomBelow) {
        resolvedSide = 'top';
      } else if (side === 'top' && height > roomAbove && roomBelow > roomAbove) {
        resolvedSide = 'bottom';
      }
    } else {
      const roomRight = block.x + block.width - (ax + aw + gap);
      const roomLeft = ax - gap - block.x;
      if (side === 'right' && width > roomRight && roomLeft > roomRight) {
        resolvedSide = 'left';
      } else if (side === 'left' && width > roomLeft && roomRight > roomLeft) {
        resolvedSide = 'right';
      }
    }

    let x: number;
    let y: number;
    if (vertical) {
      y = resolvedSide === 'bottom' ? ay + ah + gap : ay - gap - height;
      x = align === 'start' ? ax : align === 'end' ? ax + aw - width : ax + (aw - width) / 2;
      x = this.clamp(x, block.x, Math.max(block.x, block.x + block.width - width));
    } else {
      x = resolvedSide === 'right' ? ax + aw + gap : ax - gap - width;
      y = align === 'start' ? ay : align === 'end' ? ay + ah - height : ay + (ah - height) / 2;
      y = this.clamp(y, block.y, Math.max(block.y, block.y + block.height - height));
    }
    this.assignBox(child, x, y, width, height);
  }

  private parsePlacement(value: unknown): {
    side: 'top' | 'bottom' | 'left' | 'right';
    align: 'start' | 'center' | 'end';
  } {
    const text = typeof value === 'string' ? value : 'bottom';
    const [rawSide, rawAlign] = text.split('-');
    const side = rawSide === 'top' || rawSide === 'left' || rawSide === 'right' ? rawSide : ('bottom' as const);
    const align = rawAlign === 'start' || rawAlign === 'end' ? rawAlign : ('center' as const);
    return { side, align };
  }

  /** Sum of the scroll offsets of a node's scroll-container ancestors. */
  private scrollOffsetOf(node: UiNode): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (let current = node.parent; current !== null; current = current.parent) {
      const rec = this.records.get(current);
      if (rec !== undefined && rec.scrollable) {
        x += rec.scrollX;
        y += rec.scrollY;
      }
    }
    return { x, y };
  }

  /**
   * The box an absolute child is positioned against: the nearest
   * positioned ancestor's, else the layout root's.
   */
  private containingBlockOf(child: UiNode): LayoutBox {
    for (let current = child.parent; current !== null; current = current.parent) {
      if (this.isFragment(current)) {
        continue;
      }
      const rec = this.records.get(current);
      if (rec !== undefined && (rec.positioned || current === this.layoutRoot)) {
        return { x: rec.x, y: rec.y, width: rec.width, height: rec.height };
      }
    }
    const root = this.record(this.layoutRoot!);
    return { x: root.x, y: root.y, width: root.width, height: root.height };
  }

  /**
   * Records the children's paint order when it differs from tree order,
   * so renderers and hit testing agree on who is on top: by zIndex, and
   * within a zIndex positioned children (relative, sticky, absolute)
   * after in-flow ones — CSS's stacking rule, and what lets a sticky
   * header paint over the rows that scroll under it.
   */
  private updatePaintOrder(node: UiNode, rec: LayoutRecord): void {
    let reorder = false;
    const children: UiNode[] = [];
    this.forEachChild(node, child => {
      const cRec = this.record(child);
      children.push(child);
      if (cRec.zIndex !== 0 || cRec.positioned) {
        reorder = true;
      }
    });
    if (!reorder) {
      rec.paintOrder = null;
      return;
    }
    // Array.prototype.sort is stable: equal keys keep tree order.
    const key = (child: UiNode): number => {
      const cRec = this.record(child);
      return cRec.zIndex * 2 + (cRec.positioned ? 1 : 0);
    };
    children.sort((a, b) => key(a) - key(b));
    rec.paintOrder = children;
  }

  private placeFlex(node: UiNode, rec: LayoutRecord, direction: FlexDirection): void {
    const row = direction === FlexDirection.Row;
    const config = this.flexConfig(node, rec, direction);
    const paddingH = rec.paddingLeft + rec.paddingRight;
    const paddingV = rec.paddingTop + rec.paddingBottom;
    const contentX = rec.x + rec.paddingLeft;
    const contentY = rec.y + rec.paddingTop;
    const contentMain = Math.max(0, (row ? rec.width : rec.height) - (row ? paddingH : paddingV));
    const contentCross = Math.max(0, (row ? rec.height : rec.width) - (row ? paddingV : paddingH));
    // The box is final now, so children measure against it: percentages
    // resolve, and a stretched item of a single-line container is tight.
    const content = row
      ? new Constraints(contentMain, contentMain, contentCross, contentCross)
      : new Constraints(contentCross, contentCross, contentMain, contentMain);
    const items = this.collectFlexItems(node, content, direction, config, !config.wrap);
    if (items.length === 0) {
      return;
    }
    const lines = this.breakLines(items, config, contentMain);

    // Main axis, per line: flex, let auto margins take what is left,
    // then measure items at their final main size so cross sizes that
    // depend on it — wrapped text — are right before boxes are assigned.
    for (const line of lines) {
      line.free = this.resolveLine(line, contentMain - config.gapMain * (line.items.length - 1), config);
      this.distributeAutoMargins(line);
      this.measureFlexedItems(line.items, content, direction, undefined);
      line.cross = this.flexLineCross(line.items, row);
    }

    // Cross axis. A single-line container's line is the container's
    // inner cross size; multiple lines share it by alignContent.
    if (lines.length === 1 && !config.wrap) {
      lines[0].cross = contentCross;
    } else {
      this.alignLines(lines, contentCross, config);
    }
    const crossOrigin = row ? contentY : contentX;
    let crossCursor = crossOrigin;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      line.crossStart = crossCursor + (line.leading ?? 0);
      crossCursor = line.crossStart + line.cross + (i < lines.length - 1 ? (line.between ?? config.gapLine) : 0);
      if (config.wrapReverse) {
        // Cross-start is the far edge: mirror the line across the axis.
        line.crossStart = crossOrigin + contentCross - (line.crossStart - crossOrigin) - line.cross;
      }
      // Stretched items learn their line's cross size before placement.
      this.stretchItems(line.items, content, direction, line.cross);
    }

    const contentStart = row ? contentX : contentY;
    for (const line of lines) {
      let leading = 0;
      let between = config.gapMain;
      const free = line.free ?? 0;
      if (free > 0) {
        switch (config.mainAlign) {
          case MainAxisAlignment.Center:
            leading = free / 2;
            break;
          case MainAxisAlignment.End:
            leading = free;
            break;
          case MainAxisAlignment.SpaceBetween:
            if (line.items.length > 1) {
              between = config.gapMain + free / (line.items.length - 1);
            }
            break;
          case MainAxisAlignment.SpaceEvenly: {
            const slot = free / (line.items.length + 1);
            leading = slot;
            between = config.gapMain + slot;
            break;
          }
          case MainAxisAlignment.SpaceAround: {
            const slot = free / line.items.length;
            leading = slot / 2;
            between = config.gapMain + slot;
            break;
          }
          default:
            break;
        }
      }

      // Baseline alignment: the shared baseline sits `above` below the
      // line's cross start, where `above` is the largest distance from
      // any participating item's margin-box top to its baseline.
      let above = 0;
      if (row) {
        for (const item of line.items) {
          if (item.align === CrossAxisAlignment.Baseline) {
            above = Math.max(above, item.marginCrossStart + this.itemBaseline(item));
          }
        }
      }

      let mainCursor = contentStart + leading;
      for (let i = 0; i < line.items.length; i++) {
        const item = line.items[i];
        let mainPos = mainCursor + item.marginMainStart;
        if (config.mainReversed) {
          // Mirror across the main axis: flex-start becomes the far
          // edge, item order reverses, auto margins push the other way.
          mainPos = contentStart + contentMain - (mainPos - contentStart) - item.finalMain;
        }
        const { crossPos, crossDim } = this.crossPlacement(item, line, above);
        const x = row ? mainPos : crossPos;
        const y = row ? crossPos : mainPos;
        const width = row ? item.finalMain : crossDim;
        const height = row ? crossDim : item.finalMain;
        this.assignBox(item.child, x, y, width, height);
        mainCursor += item.marginMainStart + item.finalMain + item.marginMainEnd;
        if (i < line.items.length - 1) {
          mainCursor += between;
        }
      }
    }
  }

  /**
   * Main-axis `margin: auto` absorbs the line's free space, shared
   * equally between every auto margin, before alignment sees any.
   */
  private distributeAutoMargins(line: FlexLine): void {
    const free = line.free ?? 0;
    if (free <= 0) {
      return;
    }
    let count = 0;
    for (const item of line.items) {
      count += (item.marginMainStartAuto ? 1 : 0) + (item.marginMainEndAuto ? 1 : 0);
    }
    if (count === 0) {
      return;
    }
    const share = free / count;
    for (const item of line.items) {
      if (item.marginMainStartAuto) {
        item.marginMainStart += share;
      }
      if (item.marginMainEndAuto) {
        item.marginMainEnd += share;
      }
    }
    line.free = 0;
  }

  /**
   * Distributes a multi-line container's spare cross space over its
   * lines (CSS `align-content`): as leading space, between lines, or
   * by growing every line for `stretch`, the default.
   */
  private alignLines(lines: FlexLine[], contentCross: number, config: FlexConfig): void {
    let total = config.gapLine * (lines.length - 1);
    for (const line of lines) {
      total += line.cross;
    }
    const free = Math.max(0, contentCross - total);
    for (const line of lines) {
      line.leading = 0;
      line.between = undefined;
    }
    if (free === 0) {
      return;
    }
    switch (config.alignContent) {
      case AlignContent.Stretch:
        for (const line of lines) {
          line.cross += free / lines.length;
        }
        break;
      case AlignContent.Center:
        lines[0].leading = free / 2;
        break;
      case AlignContent.End:
        lines[0].leading = free;
        break;
      case AlignContent.SpaceBetween:
        if (lines.length > 1) {
          for (const line of lines) {
            line.between = config.gapLine + free / (lines.length - 1);
          }
        }
        break;
      case AlignContent.SpaceAround: {
        const slot = free / lines.length;
        lines[0].leading = slot / 2;
        for (const line of lines) {
          line.between = config.gapLine + slot;
        }
        break;
      }
      case AlignContent.SpaceEvenly: {
        const slot = free / (lines.length + 1);
        lines[0].leading = slot;
        for (const line of lines) {
          line.between = config.gapLine + slot;
        }
        break;
      }
      default:
        break;
    }
  }

  /** Re-measures a line's stretched items at the line's cross size. */
  private stretchItems(items: FlexItem[], content: Constraints, direction: FlexDirection, lineCross: number): void {
    const row = direction === FlexDirection.Row;
    for (const item of items) {
      if (item.align !== CrossAxisAlignment.Stretch || item.marginCrossStartAuto || item.marginCrossEndAuto) {
        continue;
      }
      const cross = Math.max(0, lineCross - item.marginCrossStart - item.marginCrossEnd);
      const base = this.flexChildConstraints(item.rec, content, direction, item.align, item.finalMain, false);
      const constraints = row
        ? new Constraints(base.minWidth, base.maxWidth, cross, cross)
        : new Constraints(cross, cross, base.minHeight, base.maxHeight);
      this.measure(item.child, constraints);
      // The child clamps a stretched size by its own min/max.
      item.cross = row ? item.rec.measuredHeight : item.rec.measuredWidth;
    }
  }

  /**
   * Where an item sits across its line. Cross-axis auto margins take
   * precedence: both centre the item, one pushes it to the other edge.
   */
  private crossPlacement(item: FlexItem, line: FlexLine, above: number): { crossPos: number; crossDim: number } {
    const crossStart = line.crossStart;
    const marginCross = item.marginCrossStart + item.marginCrossEnd;
    const outerCross = item.cross + marginCross;
    if (item.marginCrossStartAuto || item.marginCrossEndAuto) {
      const free = Math.max(0, line.cross - outerCross);
      const startShare = item.marginCrossStartAuto ? (item.marginCrossEndAuto ? free / 2 : free) : 0;
      return { crossPos: crossStart + item.marginCrossStart + startShare, crossDim: item.cross };
    }
    switch (item.align) {
      case CrossAxisAlignment.Stretch:
        return { crossPos: crossStart + item.marginCrossStart, crossDim: item.cross };
      case CrossAxisAlignment.Center:
        return { crossPos: crossStart + item.marginCrossStart + (line.cross - outerCross) / 2, crossDim: item.cross };
      case CrossAxisAlignment.End:
        return { crossPos: crossStart + (line.cross - outerCross) + item.marginCrossStart, crossDim: item.cross };
      case CrossAxisAlignment.Baseline:
        return { crossPos: crossStart + above - this.itemBaseline(item), crossDim: item.cross };
      default:
        return { crossPos: crossStart + item.marginCrossStart, crossDim: item.cross };
    }
  }

  /**
   * A stack lays every child over the same content box. `x` and `y`
   * on the stack align them all (start, center, end, stretch), and
   * `selfX` / `selfY` on a child override. Margins are honoured.
   */
  private placeStack(node: UiNode, rec: LayoutRecord): void {
    const contentX = rec.x + rec.paddingLeft;
    const contentY = rec.y + rec.paddingTop;
    const contentWidth = Math.max(0, rec.width - rec.paddingLeft - rec.paddingRight);
    const contentHeight = Math.max(0, rec.height - rec.paddingTop - rec.paddingBottom);
    const stackX = parseCrossAxisAlignment(node.properties.get('x')) ?? CrossAxisAlignment.Start;
    const stackY = parseCrossAxisAlignment(node.properties.get('y')) ?? CrossAxisAlignment.Start;
    const savedBase = this.percentBase;
    this.percentBase = { width: contentWidth, height: contentHeight };
    this.forEachLayoutChild(node, child => {
      const cRec = this.record(child);
      this.resolveLayoutProps(child, cRec);
      const alignX = this.stackAlignment(child, 'selfX', 'width', stackX);
      const alignY = this.stackAlignment(child, 'selfY', 'height', stackY);
      const availableWidth = Math.max(0, contentWidth - cRec.marginLeft - cRec.marginRight);
      const availableHeight = Math.max(0, contentHeight - cRec.marginTop - cRec.marginBottom);
      const stretchX = alignX === CrossAxisAlignment.Stretch;
      const stretchY = alignY === CrossAxisAlignment.Stretch;
      if (stretchX || stretchY) {
        // A stretched axis is tight, so the child lays out at that size.
        const last = cRec.lastConstraints;
        this.measure(
          child,
          new Constraints(
            stretchX ? availableWidth : last.minWidth,
            stretchX ? availableWidth : last.maxWidth,
            stretchY ? availableHeight : last.minHeight,
            stretchY ? availableHeight : last.maxHeight
          )
        );
      }
      const width = cRec.measuredWidth;
      const height = cRec.measuredHeight;
      const x = contentX + cRec.marginLeft + this.stackOffset(alignX, availableWidth, width);
      const y = contentY + cRec.marginTop + this.stackOffset(alignY, availableHeight, height);
      this.assignBox(child, x, y, width, height);
    });
    this.percentBase = savedBase;
  }

  private stackAlignment(
    child: UiNode,
    selfProp: string,
    sizeProp: string,
    fallback: CrossAxisAlignment
  ): CrossAxisAlignment {
    let align = parseCrossAxisAlignment(child.properties.get(selfProp)) ?? fallback;
    if (align === CrossAxisAlignment.Baseline) {
      align = CrossAxisAlignment.Start;
    }
    // Stretch never overrides an explicit size, as in CSS.
    if (
      align === CrossAxisAlignment.Stretch &&
      this.lengthProp(child, sizeProp, sizeProp === 'width' ? this.percentBase.width : this.percentBase.height) !==
        undefined
    ) {
      align = CrossAxisAlignment.Start;
    }
    return align;
  }

  private stackOffset(align: CrossAxisAlignment, available: number, size: number): number {
    switch (align) {
      case CrossAxisAlignment.Center:
        return (available - size) / 2;
      case CrossAxisAlignment.End:
        return available - size;
      default:
        return 0;
    }
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
      const scrollX = this.clamp(rawX, 0, maxX);
      const scrollY = this.clamp(rawY, 0, maxY);
      if (scrollX !== rec.scrollX || scrollY !== rec.scrollY) {
        rec.scrollX = scrollX;
        rec.scrollY = scrollY;
        // Overlay scrollbars show while the user scrolls and linger a
        // moment after; the host repaints when they fade.
        rec.scrollbarVisibleUntil = this.now() + SCROLLBAR_LINGER_MS;
      }
      rec.transformDirty = false;
    }
    this.applySticky();
  }

  /**
   * Holds each sticky node at its scroll container's edge.
   *
   * A sticky node keeps its flow position until scrolling would carry
   * it past the edge named by top/right/bottom/left (CSS: the inset is
   * measured from the scrollport); it is then shifted just enough to
   * stay there, but never beyond its parent's box — when the parent
   * scrolls away, the node goes with it. For a node whose parent is the
   * scroll container itself, the parent's box is the scrollable extent.
   */
  private applySticky(): void {
    for (const node of this.stickyNodes) {
      const rec = this.records.get(node);
      if (rec === undefined) {
        continue;
      }
      rec.stickyOffsetX = 0;
      rec.stickyOffsetY = 0;
      const scroller = this.scrollAncestorOf(node);
      const parent = this.flowParentOf(node);
      if (scroller === null || parent === null) {
        continue;
      }
      const sRec = this.record(scroller);
      const pRec = this.record(parent);
      const parentIsScroller = parent === scroller;
      // Bounds the node may move within: its parent's content box, in
      // the same pre-scroll frame as the node's record.
      const boundTop = pRec.y + pRec.paddingTop;
      const boundLeft = pRec.x + pRec.paddingLeft;
      const boundBottom = parentIsScroller
        ? pRec.y + pRec.contentHeight - pRec.paddingBottom
        : pRec.y + pRec.height - pRec.paddingBottom;
      const boundRight = parentIsScroller
        ? pRec.x + pRec.contentWidth - pRec.paddingRight
        : pRec.x + pRec.width - pRec.paddingRight;
      // The scrollport's edges in that frame.
      const viewTop = sRec.y + sRec.scrollY + (parentIsScroller ? 0 : 0);
      const viewLeft = sRec.x + sRec.scrollX;
      const viewBottom = viewTop + sRec.height;
      const viewRight = viewLeft + sRec.width;

      if (rec.top !== undefined) {
        const wanted = viewTop + rec.top - rec.y;
        const limit = boundBottom - rec.height - rec.y;
        rec.stickyOffsetY = this.clamp(wanted, 0, Math.max(0, limit));
      } else if (rec.bottom !== undefined) {
        const wanted = viewBottom - rec.bottom - rec.height - rec.y;
        const limit = boundTop - rec.y;
        rec.stickyOffsetY = this.clamp(wanted, Math.min(0, limit), 0);
      }
      if (rec.left !== undefined) {
        const wanted = viewLeft + rec.left - rec.x;
        const limit = boundRight - rec.width - rec.x;
        rec.stickyOffsetX = this.clamp(wanted, 0, Math.max(0, limit));
      } else if (rec.right !== undefined) {
        const wanted = viewRight - rec.right - rec.width - rec.x;
        const limit = boundLeft - rec.x;
        rec.stickyOffsetX = this.clamp(wanted, Math.min(0, limit), 0);
      }
    }
  }

  private scrollAncestorOf(node: UiNode): UiNode | null {
    for (let current = node.parent; current !== null; current = current.parent) {
      const rec = this.records.get(current);
      if (rec !== undefined && rec.scrollable) {
        return current;
      }
    }
    return null;
  }

  /** The nearest non-fragment ancestor. */
  private flowParentOf(node: UiNode): UiNode | null {
    for (let current = node.parent; current !== null; current = current.parent) {
      if (!this.isFragment(current)) {
        return current;
      }
    }
    return null;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
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
    const explicitWidth = this.lengthProp(this.layoutRoot!, 'width', this.rootPercentBase(constraints).width);
    const explicitHeight = this.lengthProp(this.layoutRoot!, 'height', this.rootPercentBase(constraints).height);
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
    const base = this.percentBase;
    // `flex: n` is CSS's shorthand for grow n, shrink 1, basis 0.
    const flex = this.numberProp(node, 'flex');
    rec.flexGrow = this.numberProp(node, 'flexGrow') ?? flex ?? 0;
    rec.flexShrink = this.numberProp(node, 'flexShrink') ?? 1;
    rec.flexBasisZero = flex !== undefined && props.get('flexBasis') === undefined;
    const minWidth = this.lengthPropOrAuto(node, 'minWidth', base.width);
    const minHeight = this.lengthPropOrAuto(node, 'minHeight', base.height);
    rec.minWidthAuto = typeof minWidth !== 'number';
    rec.minHeightAuto = typeof minHeight !== 'number';
    rec.minWidth = typeof minWidth === 'number' ? minWidth : 0;
    rec.minHeight = typeof minHeight === 'number' ? minHeight : 0;
    rec.maxWidth = this.lengthProp(node, 'maxWidth', base.width) ?? Infinity;
    rec.maxHeight = this.lengthProp(node, 'maxHeight', base.height) ?? Infinity;
    rec.paddingLeft = this.spacingProp(props, 'padding', 'paddingLeft');
    rec.paddingRight = this.spacingProp(props, 'padding', 'paddingRight');
    rec.paddingTop = this.spacingProp(props, 'padding', 'paddingTop');
    rec.paddingBottom = this.spacingProp(props, 'padding', 'paddingBottom');
    const marginLeft = this.marginProp(props, 'marginLeft');
    const marginRight = this.marginProp(props, 'marginRight');
    const marginTop = this.marginProp(props, 'marginTop');
    const marginBottom = this.marginProp(props, 'marginBottom');
    rec.marginLeftAuto = marginLeft === 'auto';
    rec.marginRightAuto = marginRight === 'auto';
    rec.marginTopAuto = marginTop === 'auto';
    rec.marginBottomAuto = marginBottom === 'auto';
    rec.marginLeft = typeof marginLeft === 'number' ? marginLeft : 0;
    rec.marginRight = typeof marginRight === 'number' ? marginRight : 0;
    rec.marginTop = typeof marginTop === 'number' ? marginTop : 0;
    rec.marginBottom = typeof marginBottom === 'number' ? marginBottom : 0;
    const position = props.get('position');
    rec.absolute = position === 'absolute';
    rec.sticky = position === 'sticky';
    rec.positioned = rec.absolute || rec.sticky || position === 'relative';
    const overflow = props.get('overflow');
    rec.scrollable = node.type === UiNodeType.ScrollView || overflow === 'scroll' || overflow === 'auto';
    rec.clips = rec.scrollable || overflow === 'hidden';
    const insetH = this.lengthProp(node, 'inset', base.width);
    const insetV = this.lengthProp(node, 'inset', base.height);
    rec.top = this.lengthProp(node, 'top', base.height) ?? insetV;
    rec.right = this.lengthProp(node, 'right', base.width) ?? insetH;
    rec.bottom = this.lengthProp(node, 'bottom', base.height) ?? insetV;
    rec.left = this.lengthProp(node, 'left', base.width) ?? insetH;
    rec.zIndex = this.numberProp(node, 'zIndex') ?? 0;
    const ratio = this.numberProp(node, 'aspectRatio');
    rec.aspectRatio = ratio !== undefined && ratio > 0 ? ratio : undefined;
  }

  /**
   * Sizes with a fixed width:height ratio (CSS `aspect-ratio`). The
   * axis the parent or an explicit size decided drives the other; when
   * neither is decided the content's width does.
   */
  private applyAspectRatio(size: Size, ratio: number, effective: Constraints): Size {
    const tightWidth = effective.minWidth === effective.maxWidth;
    const tightHeight = effective.minHeight === effective.maxHeight;
    if (tightWidth && !tightHeight) {
      return { width: size.width, height: effective.minWidth / ratio };
    }
    if (tightHeight && !tightWidth) {
      return { width: effective.minHeight * ratio, height: size.height };
    }
    if (!tightWidth && !tightHeight) {
      if (size.width > 0) {
        return { width: size.width, height: size.width / ratio };
      }
      if (size.height > 0) {
        return { width: size.height * ratio, height: size.height };
      }
    }
    return size;
  }

  /** The percentage base for a root: the viewport where it is bounded. */
  private rootPercentBase(constraints: Constraints): { width: number | undefined; height: number | undefined } {
    return {
      width: constraints.hasBoundedWidth() ? constraints.maxWidth : undefined,
      height: constraints.hasBoundedHeight() ? constraints.maxHeight : undefined
    };
  }

  /** A content-box axis that is definite (tight), else undefined. */
  private definiteAxis(content: Constraints, axis: 'width' | 'height'): number | undefined {
    if (axis === 'width') {
      return isFinite(content.maxWidth) && content.minWidth === content.maxWidth ? content.maxWidth : undefined;
    }
    return isFinite(content.maxHeight) && content.minHeight === content.maxHeight ? content.maxHeight : undefined;
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
    const base = this.percentBase;
    const width = this.axisConstraints(
      constraints.minWidth,
      constraints.maxWidth,
      this.lengthProp(node, 'width', base.width),
      this.lengthProp(node, 'minWidth', base.width) ?? 0,
      this.lengthProp(node, 'maxWidth', base.width) ?? Infinity
    );
    const height = this.axisConstraints(
      constraints.minHeight,
      constraints.maxHeight,
      this.lengthProp(node, 'height', base.height),
      this.lengthProp(node, 'minHeight', base.height) ?? 0,
      this.lengthProp(node, 'maxHeight', base.height) ?? Infinity
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
    const min = Math.max(0, ownMin);
    // Like CSS, a min bound wins over a conflicting max bound.
    const max = Math.max(min, ownMax);
    if (parentMin === parentMax) {
      // A stretched or flexed size is still clamped by the node's own
      // min/max, as CSS clamps a stretched cross size.
      const size = this.clamp(parentMin, min, max);
      return [size, size];
    }
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

  private assignBox(node: UiNode, x: number, y: number, width: number, height: number): void {
    const rec = this.record(node);
    if (rec.positioned && !rec.absolute && node !== this.layoutRoot) {
      // A relative node keeps its place in the flow and is drawn offset.
      x += rec.left ?? (rec.right !== undefined ? -rec.right : 0);
      y += rec.top ?? (rec.bottom !== undefined ? -rec.bottom : 0);
    }
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
   * Iterates over a node's in-flow children, transparently expanding
   * Fragment anchors so their children participate in layout as if
   * they were direct children of the parent. Absolutely positioned
   * children are skipped: they take no space and are placed separately.
   */
  private forEachLayoutChild(node: UiNode, callback: (child: UiNode) => void): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (this.isFragment(child)) {
        this.forEachLayoutChild(child, callback);
      } else if (!this.isAbsolute(child)) {
        callback(child);
      }
    }
  }

  /** The absolutely positioned children, fragments expanded. */
  private forEachAbsoluteChild(node: UiNode, callback: (child: UiNode) => void): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (this.isFragment(child)) {
        this.forEachAbsoluteChild(child, callback);
      } else if (this.isAbsolute(child)) {
        callback(child);
      }
    }
  }

  /** Every child, in flow or not, fragments expanded, in tree order. */
  private forEachChild(node: UiNode, callback: (child: UiNode) => void): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (this.isFragment(child)) {
        this.forEachChild(child, callback);
      } else {
        callback(child);
      }
    }
  }

  private isAbsolute(node: UiNode): boolean {
    return node.properties.get('position') === 'absolute';
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

  /** A length property in pixels; percentages resolve against `base`. */
  private lengthProp(node: UiNode, property: string, base: number | undefined): number | undefined {
    const value = resolveLength(node.properties.get(property), base, property);
    return value === 'auto' ? undefined : value;
  }

  private lengthPropOrAuto(node: UiNode, property: string, base: number | undefined): number | undefined | 'auto' {
    return resolveLength(node.properties.get(property), base, property, true);
  }

  /** A margin side: the side's own value, else the shorthand; may be auto. */
  private marginProp(props: ReadonlyMap<string, unknown>, side: string): number | 'auto' {
    const explicit = props.get(side);
    const value = explicit !== undefined ? explicit : props.get('margin');
    return resolveLength(value, undefined, side, true) ?? 0;
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
