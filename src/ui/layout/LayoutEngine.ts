import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiFrame } from '../scheduler/UiFrame';
import { CrossAxisAlignment, MainAxisAlignment, parseCrossAxisAlignment, parseMainAxisAlignment } from './Alignment';
import { FlexDirection, parseFlexDirection } from './FlexDirection';
import { LayoutRecord } from './LayoutRecord';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { TextMeasurer } from './TextMeasurer';
import { accumulatedOffsetTo } from './LayoutTransform';
import { clampSize, Constraints, constraintsEqual, tightenConstraints } from './LayoutTypes';
import type { LayoutBox, LayoutResult, Size } from './LayoutTypes';

const DEFAULT_FONT_SIZE = 14;

interface FlexItem {
  child: UiNode;
  baseMain: number;
  finalMain: number;
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
    if (!rec.measureDirty && constraintsEqual(rec.lastConstraints, constraints)) {
      return;
    }
    rec.lastConstraints = constraints;
    this.resolveLayoutProps(node, rec);
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
      size = this.measureLeaf(node, effective);
    }
    const clamped = clampSize(effective, size.width, size.height);
    rec.measuredWidth = clamped.width;
    rec.measuredHeight = clamped.height;
    rec.outerWidth = clamped.width + rec.marginLeft + rec.marginRight;
    rec.outerHeight = clamped.height + rec.marginTop + rec.marginBottom;
    rec.measureDirty = false;
  }

  private measureContainer(node: UiNode, rec: LayoutRecord, effective: Constraints): Size {
    const paddingH = rec.paddingLeft + rec.paddingRight;
    const paddingV = rec.paddingTop + rec.paddingBottom;
    const content = new Constraints(
      Math.max(0, effective.minWidth - paddingH),
      Math.max(0, effective.maxWidth - paddingH),
      Math.max(0, effective.minHeight - paddingV),
      Math.max(0, effective.maxHeight - paddingV)
    );
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

  private measureFlex(node: UiNode, rec: LayoutRecord, content: Constraints, direction: FlexDirection): Size {
    const children = this.collectChildren(node);
    const paddingMain =
      direction === FlexDirection.Row ? rec.paddingLeft + rec.paddingRight : rec.paddingTop + rec.paddingBottom;
    const paddingCross =
      direction === FlexDirection.Row ? rec.paddingTop + rec.paddingBottom : rec.paddingLeft + rec.paddingRight;
    if (children.length === 0) {
      return { width: paddingMain, height: paddingCross };
    }
    const gap = this.numberProp(node, 'gap') ?? 0;
    let mainTotal = 0;
    let crossMax = 0;
    for (const child of children) {
      this.measure(child, this.childConstraints(child, content));
      const cRec = this.record(child);
      const measuredMain = direction === FlexDirection.Row ? cRec.measuredWidth : cRec.measuredHeight;
      const measuredCross = direction === FlexDirection.Row ? cRec.measuredHeight : cRec.measuredWidth;
      const marginMain =
        direction === FlexDirection.Row ? cRec.marginLeft + cRec.marginRight : cRec.marginTop + cRec.marginBottom;
      const marginCross =
        direction === FlexDirection.Row ? cRec.marginTop + cRec.marginBottom : cRec.marginLeft + cRec.marginRight;
      mainTotal += this.flexBasisMain(cRec, direction, measuredMain) + marginMain;
      crossMax = Math.max(crossMax, measuredCross + marginCross);
    }
    mainTotal += gap * (children.length - 1);
    return {
      width: paddingMain + (direction === FlexDirection.Row ? mainTotal : crossMax),
      height: paddingCross + (direction === FlexDirection.Row ? crossMax : mainTotal)
    };
  }

  private measureStack(node: UiNode, rec: LayoutRecord, content: Constraints): Size {
    let maxWidth = 0;
    let maxHeight = 0;
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      this.measure(child, this.childConstraints(child, content));
      const cRec = this.record(child);
      maxWidth = Math.max(maxWidth, cRec.outerWidth);
      maxHeight = Math.max(maxHeight, cRec.outerHeight);
    }
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
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      const childBase = new Constraints(
        0,
        vertical ? content.maxWidth : Infinity,
        0,
        vertical ? Infinity : content.maxHeight
      );
      this.measure(child, this.childConstraints(child, childBase));
      const cRec = this.record(child);
      const measuredMain = vertical ? cRec.measuredHeight : cRec.measuredWidth;
      const measuredCross = vertical ? cRec.measuredWidth : cRec.measuredHeight;
      const marginMain = vertical ? cRec.marginTop + cRec.marginBottom : cRec.marginLeft + cRec.marginRight;
      const marginCross = vertical ? cRec.marginLeft + cRec.marginRight : cRec.marginTop + cRec.marginBottom;
      mainTotal += measuredMain + marginMain;
      crossMax = Math.max(crossMax, measuredCross + marginCross);
      childCount++;
    }
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

  private measureLeaf(node: UiNode, effective: Constraints): Size {
    if (node.type === UiNodeType.Text || node.type === UiNodeType.Button) {
      const text = String(node.properties.get('text') ?? '');
      const fontSize = this.numberProp(node, 'fontSize') ?? DEFAULT_FONT_SIZE;
      let maxWidth: number | undefined;
      if (isFinite(effective.maxWidth)) {
        maxWidth = effective.maxWidth;
      }
      return this.textMeasurer.measure({
        text,
        fontSize,
        fontFamily: this.stringProp(node, 'fontFamily'),
        fontWeight: this.weightProp(node),
        lineHeight: this.numberProp(node, 'lineHeight'),
        maxWidth
      });
    }
    return { width: 0, height: 0 };
  }

  // ---------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------

  private place(node: UiNode): void {
    const rec = this.record(node);
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
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (this.record(child).placeDirty) {
        this.place(child);
      }
    }
  }

  private placeFlex(node: UiNode, rec: LayoutRecord, direction: FlexDirection): void {
    const children = this.collectChildren(node);
    if (children.length === 0) {
      return;
    }
    const mainAlign = parseMainAxisAlignment(node.properties.get(direction === FlexDirection.Row ? 'x' : 'y'));
    const crossAlign =
      parseCrossAxisAlignment(node.properties.get(direction === FlexDirection.Row ? 'y' : 'x')) ??
      CrossAxisAlignment.Start;
    const gap = this.numberProp(node, 'gap') ?? 0;

    const paddingH = rec.paddingLeft + rec.paddingRight;
    const paddingV = rec.paddingTop + rec.paddingBottom;
    const contentX = rec.x + rec.paddingLeft;
    const contentY = rec.y + rec.paddingTop;
    const contentMain = Math.max(
      0,
      (direction === FlexDirection.Row ? rec.width : rec.height) -
        (direction === FlexDirection.Row ? paddingH : paddingV)
    );
    const contentCross = Math.max(
      0,
      (direction === FlexDirection.Row ? rec.height : rec.width) -
        (direction === FlexDirection.Row ? paddingV : paddingH)
    );

    const items: FlexItem[] = [];
    for (const child of children) {
      const cRec = this.record(child);
      const measuredMain = direction === FlexDirection.Row ? cRec.measuredWidth : cRec.measuredHeight;
      const minMain = direction === FlexDirection.Row ? cRec.minWidth : cRec.minHeight;
      const maxMain = direction === FlexDirection.Row ? cRec.maxWidth : cRec.maxHeight;
      const baseMain = this.clamp(this.flexBasisMain(cRec, direction, measuredMain), minMain, maxMain);
      const cross = direction === FlexDirection.Row ? cRec.measuredHeight : cRec.measuredWidth;
      const marginMainStart = direction === FlexDirection.Row ? cRec.marginLeft : cRec.marginTop;
      const marginMainEnd = direction === FlexDirection.Row ? cRec.marginRight : cRec.marginBottom;
      const marginCrossStart = direction === FlexDirection.Row ? cRec.marginTop : cRec.marginLeft;
      const marginCrossEnd = direction === FlexDirection.Row ? cRec.marginBottom : cRec.marginRight;
      const selfAlign = parseCrossAxisAlignment(
        child.properties.get(direction === FlexDirection.Row ? 'selfY' : 'selfX')
      );
      items.push({
        child,
        baseMain,
        finalMain: baseMain,
        cross,
        marginMainStart,
        marginMainEnd,
        marginCrossStart,
        marginCrossEnd,
        minMain,
        maxMain,
        grow: cRec.flexGrow,
        shrink: cRec.flexShrink,
        align: selfAlign ?? crossAlign
      });
    }

    let totalOuterMain = 0;
    for (const item of items) {
      totalOuterMain += item.baseMain + item.marginMainStart + item.marginMainEnd;
    }
    totalOuterMain += gap * (items.length - 1);
    let freeSpace = contentMain - totalOuterMain;

    if (node.type === UiNodeType.ScrollView) {
      // Scroll content overflows its viewport instead of compressing
      // into it: flex shrink/grow on the scroll axis would crush
      // (or stretch) items that merely need to scroll. Items keep
      // their measured main size; the viewport is a window, and only
      // the cross axis still constrains stretch.
      freeSpace = 0;
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
    } else if (freeSpace < 0) {
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
      freeSpace = 0;
    }

    let leading = 0;
    let between = gap;
    if (freeSpace > 0 && items.length > 0) {
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

    const contentStart = direction === FlexDirection.Row ? contentX : contentY;
    const crossStart = direction === FlexDirection.Row ? contentY : contentX;
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
        default:
          crossDim = item.cross;
          crossPos = crossStart + item.marginCrossStart;
          break;
      }

      const x = direction === FlexDirection.Row ? mainPos : crossPos;
      const y = direction === FlexDirection.Row ? crossPos : mainPos;
      const width = direction === FlexDirection.Row ? item.finalMain : crossDim;
      const height = direction === FlexDirection.Row ? crossDim : item.finalMain;
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
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      const cRec = this.record(child);
      this.assignBox(child, contentX, contentY, cRec.measuredWidth, cRec.measuredHeight);
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

  private effectiveConstraints(node: UiNode, constraints: Constraints): Constraints {
    return tightenConstraints(constraints, {
      width: this.numberProp(node, 'width'),
      height: this.numberProp(node, 'height'),
      minWidth: this.numberProp(node, 'minWidth'),
      maxWidth: this.numberProp(node, 'maxWidth'),
      minHeight: this.numberProp(node, 'minHeight'),
      maxHeight: this.numberProp(node, 'maxHeight')
    });
  }

  /**
   * Constraints for measuring a child of a container.
   *
   * Children are measured under the container's max bounds with a
   * zero minimum, so a tight parent (e.g. the root under the
   * viewport) never forces a child to fill it: explicit sizes and
   * flex grow/shrink decide the final box, like CSS replaced sizing.
   */
  private childConstraints(child: UiNode, content: Constraints): Constraints {
    return tightenConstraints(new Constraints(0, content.maxWidth, 0, content.maxHeight), {
      width: this.numberProp(child, 'width'),
      height: this.numberProp(child, 'height'),
      minWidth: this.numberProp(child, 'minWidth'),
      maxWidth: this.numberProp(child, 'maxWidth'),
      minHeight: this.numberProp(child, 'minHeight'),
      maxHeight: this.numberProp(child, 'maxHeight')
    });
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

  private collectChildren(node: UiNode): UiNode[] {
    const children: UiNode[] = [];
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      children.push(child);
    }
    return children;
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
