import { DirtyFlags } from '../graph/DirtyFlags';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { resolveFont } from '../properties/UiTextFont';
import { CARET_WIDTH, editorFor } from '../editing/UiEditable';
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
import type { UiTrackSize } from './UiLength';
import { placeGridItems, sizeGridTracks } from './GridLayout';
import type { GridContribution, GridItemRequest, GridPlacement, GridTrackSizingResult } from './GridLayout';
import { FlexDirection, parseFlexDirection } from './FlexDirection';
import { LayoutRecord } from './LayoutRecord';
import { fillSubtreeBounds } from './SubtreeBounds';
import type { SubtreeBounds } from './SubtreeBounds';
import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { TextMeasurer, TextOverflow, TextWrap } from './TextMeasurer';
import { accumulatedOffsetTo } from './LayoutTransform';
import { Constraints, constraintsEqual } from './LayoutTypes';
import type { LayoutBox, LayoutResult, LayoutStats, Size } from './LayoutTypes';
import { buildAxisExplanation, describeOverrides, labelNode, withOverrideSource } from './LayoutExplanation';
import type { AxisFacts, FlexFacts, LayoutExplanation } from './LayoutExplanation';

/** How long overlay scrollbars stay after the last scroll change. */
export const SCROLLBAR_LINGER_MS = 1200;
/** Portion of the linger during which the scrollbar fades out. */
export const SCROLLBAR_FADE_MS = 350;
/**
 * How many times a pass re-places anchored nodes that moved because
 * something they are anchored to moved. One pass settles an overlay on
 * a box; a further pass settles an overlay anchored to that overlay.
 * The limit is what stops a cycle of anchors from spinning.
 */
const ANCHOR_CHAIN_LIMIT = 4;

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
  /**
   * Both of the item's first-pass sizes came from lengths or tight
   * constraints, not from content — a candidate relayout boundary.
   */
  sizeFree: boolean;
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
  private records = new Map<UiNode, LayoutRecord>();
  /**
   * The records the previous full layout ended with, held for the
   * length of the next one so their objects can be reused.
   *
   * `layout()` starts every full pass with an empty map, because the
   * contract is that a node outside the subtree it lays out ends
   * without a record, and the only honest way to say that is to make
   * the pass re-add whatever it touches. Building the records again as
   * well is the part that was not necessary: on the benchmark list
   * that is 5,001 objects of eighty fields per pass, which was 71% of
   * everything a full pass allocated and most of the tenth of its time
   * the collector was taking. The record for a node the pass asks for
   * is lifted out of here, reset, and reused; a node the pass never
   * asks for is dropped with the map when the pass ends, exactly as
   * before.
   *
   * A record is only ever reused for the node it already belongs to,
   * so anything still holding one sees its own node's record cleared
   * rather than somebody else's values.
   *
   * Empty except while a full pass is running, so `record()`'s second
   * lookup costs nothing on an incremental frame.
   */
  private retiredRecords = new Map<UiNode, LayoutRecord>();
  private readonly scrollNodes = new Set<UiNode>();
  /**
   * Editables, which scroll their own text inside their box the way a
   * scroll container scrolls its children — the offset lives on the
   * record and is clamped every pass, but there are no scrollbars and
   * no children to translate, so they are kept apart from `scrollNodes`.
   */
  private readonly textScrollNodes = new Set<UiNode>();
  /** Absolutely positioned nodes placed against an anchor node. */
  private readonly anchoredNodes = new Set<UiNode>();
  /** The anchor each of those nodes was last placed against. */
  private readonly anchorOf = new Map<UiNode, UiNode>();
  /**
   * The reverse index: which anchored nodes each anchor carries. A box
   * that moves consults it, so an anchor that moved for any reason
   * takes its overlays with it without every frame paying for the
   * question.
   */
  private readonly anchorDependents = new Map<UiNode, Set<UiNode>>();
  /** Anchored nodes whose anchor moved this frame, re-placed once it settles. */
  private readonly movedAnchored = new Set<UiNode>();
  /**
   * The nodes asking for `lift`, in the order they asked.
   *
   * Kept as a set rather than rebuilt per pass because layout is
   * incremental: a node whose subtree was not re-placed this frame is
   * still lifted, and a list gathered during placement would have lost
   * it. Hit testing reads this, and it is empty in every frame nothing
   * is morphing, which is nearly all of them.
   */
  private readonly liftedNodes = new Set<UiNode>();
  /** position: 'sticky' nodes, re-offset whenever anything scrolls. */
  private readonly stickyNodes = new Set<UiNode>();
  /**
   * The sticky nodes whose shift came out different this pass. A shift
   * moves a node without moving its box, so it is the one thing the
   * anchor index cannot hear about from `assignBox`; this is what the
   * overlays anchored inside a sticky header are asked about, and only
   * on a pass where something actually stuck or let go.
   */
  private readonly stickyShifted = new Set<UiNode>();
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
  /**
   * Which layout pass this is, counted from one and bumped by every
   * `layout` and `layoutForFrame`. Records stamp it when their
   * properties are folded onto them, which is what lets
   * `resolveLayoutProps` tell "already done, this pass" from "done
   * under some earlier state of the tree".
   */
  private layoutPass = 0;
  private layoutRoot: UiNode | null = null;
  private rootConstraints: Constraints = Constraints.unbounded();
  /**
   * Bumped by anything that can move where a node is hit: every box
   * written, every pass that did any work at all, and every sticky
   * shift that came out different. Subtree bounds are a summary of the
   * records, and this is what keeps them from outliving the records
   * they summarise.
   *
   * A pass that changes nothing leaves it alone, which is the whole
   * point: a pointer crossing a still tree re-uses the same bounds
   * from the first move to the last.
   */
  private layoutVersion = 0;
  /** The version `subtreeBounds` on the records was filled from. */
  private boundsVersion = -1;

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
   * A box around everything in a node's subtree that could take a
   * point, so a hit test can pass the subtree over instead of
   * descending into it. Undefined for a node with no record, and
   * `boundsUnbounded` where no honest box exists (see `SubtreeBounds`).
   *
   * The bounds are computed for the whole tree at once, on the first
   * ask after anything moved, rather than kept up to date as layout
   * runs. That is not laziness for its own sake: an incremental pass
   * re-places only from a relayout boundary downwards, and a boundary
   * is any node whose container fixed its size, not just a clipping
   * one, so a descendant can move and grow past the cached bounds of
   * ancestors that were never re-placed. Filling every record from one
   * walk over boxes that have all settled cannot get that wrong, and
   * it costs four number reads a node on the frames where layout
   * changed rather than a walk of the tree on every pointer move.
   */
  subtreeBoundsFor(node: UiNode): SubtreeBounds | undefined {
    if (this.boundsVersion !== this.layoutVersion) {
      this.boundsVersion = this.layoutVersion;
      if (this.layoutRoot !== null) {
        fillSubtreeBounds(this.layoutRoot, this.records);
      }
    }
    return this.records.get(node);
  }

  /** The node the last `layout` / `layoutForFrame` started from, if any. */
  get root(): UiNode | null {
    return this.layoutRoot;
  }

  /**
   * Why a node has the box it has: the constraints it was handed, what
   * its content asked for, which rule fixed each axis (a flex
   * resolution, a stretch, an explicit size, a clamp) and where a
   * change to it is laid out from. Reads the record and the node's
   * properties; computes nothing layout did not.
   *
   * `formatExplanation` prints the result; the playground's inspector
   * shows it for the hovered node.
   */
  explain(node: UiNode): LayoutExplanation {
    const rec = this.records.get(node);
    const flowParent = this.flowParentOf(node);
    const parent = node === this.layoutRoot ? null : flowParent;
    if (rec === undefined) {
      return this.unexplained(node, parent);
    }
    const isRoot = node === this.layoutRoot;
    const absolute = rec.absolute && !isRoot;
    const pRec = parent === null ? undefined : this.records.get(parent);
    const block = absolute ? this.containingBlockOf(node) : undefined;
    // Percentages resolve against what they resolved against in layout:
    // the containing block, the parent's content box, or the viewport.
    const savedBase = this.percentBase;
    this.percentBase =
      block !== undefined
        ? { width: block.width, height: block.height }
        : pRec === undefined
          ? this.rootPercentBase(this.rootConstraints)
          : {
              width: Math.max(0, pRec.width - pRec.paddingLeft - pRec.paddingRight),
              height: Math.max(0, pRec.height - pRec.paddingTop - pRec.paddingBottom)
            };
    const constraints = rec.lastConstraints;
    const effective = this.effectiveConstraints(node, constraints, undefined);
    const parentLabel = parent === null ? 'the viewport' : labelNode(parent);
    const clipsContent =
      rec.clips ||
      node.properties.get('textOverflow') === 'ellipsis' ||
      this.numberProp(node, 'maxLines') !== undefined;
    const isText =
      node.type === UiNodeType.Text || node.type === UiNodeType.Button || node.type === UiNodeType.EditableText;
    let childCount = 0;
    this.forEachLayoutChild(node, () => childCount++);
    const flexContainer =
      parent !== null &&
      !absolute &&
      (parent.type === UiNodeType.Row || parent.type === UiNodeType.Column || parent.type === UiNodeType.ScrollView);
    const flexFacts = (axis: 'width' | 'height'): FlexFacts | undefined => {
      if (!flexContainer || rec.flexMain !== (axis === 'width' ? 1 : 2)) {
        return undefined;
      }
      return {
        base: rec.flexBase,
        min: rec.flexMin,
        max: rec.flexMax,
        minAuto: rec.flexMinAuto,
        grow: rec.flexGrow,
        shrink: rec.flexShrink,
        basis: this.flexBasis(node, rec, axis === 'width' ? this.percentBase.width : this.percentBase.height),
        containerLabel: parentLabel,
        scroller: parent.type === UiNodeType.ScrollView
      };
    };
    const facts = (axis: 'width' | 'height'): AxisFacts => {
      const horizontal = axis === 'width';
      const base = horizontal ? this.percentBase.width : this.percentBase.height;
      const explicit = this.lengthProp(node, axis, base);
      const flex = flexFacts(axis);
      const parentMin = horizontal ? constraints.minWidth : constraints.minHeight;
      const parentMax = horizontal ? constraints.maxWidth : constraints.maxHeight;
      const tight = parentMin === parentMax && isFinite(parentMax);
      const inset =
        absolute &&
        (horizontal
          ? rec.left !== undefined && rec.right !== undefined
          : rec.top !== undefined && rec.bottom !== undefined) &&
        explicit === undefined;
      return {
        axis,
        isRoot,
        parentLabel,
        parentMin,
        parentMax,
        effectiveMin: horizontal ? effective.minWidth : effective.minHeight,
        effectiveMax: horizontal ? effective.maxWidth : effective.maxHeight,
        explicit,
        explicitRaw: node.properties.get(axis),
        ownMin: this.lengthProp(node, horizontal ? 'minWidth' : 'minHeight', base),
        ownMax: this.lengthProp(node, horizontal ? 'maxWidth' : 'maxHeight', base),
        content: horizontal ? rec.intrinsicWidth : rec.intrinsicHeight,
        measured: horizontal ? rec.measuredWidth : rec.measuredHeight,
        final: horizontal ? rec.width : rec.height,
        contentMin: horizontal ? rec.minContentWidth : rec.intrinsicHeight,
        padding: horizontal ? rec.paddingLeft + rec.paddingRight : rec.paddingTop + rec.paddingBottom,
        aspectRatio: rec.aspectRatio,
        flex,
        stretched: tight && !isRoot && explicit === undefined && flex === undefined && !inset,
        inset,
        gridArea: tight && parent !== null && parent.type === UiNodeType.Grid && explicit === undefined,
        clipsContent,
        isText,
        childCount
      };
    };
    const sources = describeOverrides(node);
    const width = withOverrideSource(buildAxisExplanation(facts('width')), sources?.width);
    const height = withOverrideSource(buildAxisExplanation(facts('height')), sources?.height);
    this.percentBase = savedBase;

    const position = rec.absolute ? 'absolute' : rec.sticky ? 'sticky' : rec.positioned ? 'relative' : 'static';
    return {
      node,
      laidOut: true,
      parent,
      box: { x: rec.x, y: rec.y, width: rec.width, height: rec.height },
      content: { width: rec.intrinsicWidth, height: rec.intrinsicHeight },
      measured: { width: rec.measuredWidth, height: rec.measuredHeight },
      constraints,
      effective,
      padding: { top: rec.paddingTop, right: rec.paddingRight, bottom: rec.paddingBottom, left: rec.paddingLeft },
      margin: { top: rec.marginTop, right: rec.marginRight, bottom: rec.marginBottom, left: rec.marginLeft },
      width,
      height,
      relayout: this.explainRelayout(node, rec),
      state: {
        measureDirty: rec.measureDirty,
        placeDirty: rec.placeDirty,
        measuredLastPass: this.trace ? this.stats.measuredNodes.includes(node) : undefined,
        position,
        clips: rec.clips
      },
      // A field scrolls its own text, so "why is the line cut off here"
      // has the same answer for it as for a scroll container.
      scroll:
        rec.scrollable || this.textScrollNodes.has(node)
          ? {
              scrollX: rec.scrollX,
              scrollY: rec.scrollY,
              contentWidth: rec.contentWidth,
              contentHeight: rec.contentHeight
            }
          : undefined,
      sources
    };
  }

  private unexplained(node: UiNode, parent: UiNode | null): LayoutExplanation {
    let reason: string;
    if (this.layoutRoot === null) {
      reason = 'nothing has been laid out yet';
    } else if (this.isFragment(node)) {
      reason = 'fragments are transparent anchors with no box of their own; explain one of its children';
    } else if (!this.isUnderRoot(node)) {
      reason = `it is not under the layout root ${labelNode(this.layoutRoot)}`;
    } else if (this.hiddenAncestor(node) !== null) {
      reason = `an ancestor (${labelNode(this.hiddenAncestor(node)!)}) has not been laid out`;
    } else {
      reason = 'it was added after the last layout pass and no frame has run since';
    }
    const empty = Constraints.unbounded();
    const zero = { width: 0, height: 0 };
    const axis = (name: 'width' | 'height') => ({
      axis: name,
      content: 0,
      measured: 0,
      final: 0,
      decidedBy: 'content' as const,
      reasons: [] as string[]
    });
    return {
      node,
      laidOut: false,
      notLaidOutReason: reason,
      parent,
      box: { x: 0, y: 0, width: 0, height: 0 },
      content: zero,
      measured: zero,
      constraints: empty,
      effective: empty,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      width: axis('width'),
      height: axis('height'),
      relayout: {
        boundary: false,
        contentMatters: true,
        root: this.layoutRoot ?? node,
        rootIsLayoutRoot: true,
        depth: this.depthOf(node)
      },
      state: { measureDirty: true, placeDirty: true, measuredLastPass: undefined, position: 'static', clips: false }
    };
  }

  /**
   * Where a change to the node's own layout properties is laid out
   * from — the same walk `markLayoutDirty` takes, without marking.
   */
  private explainRelayout(node: UiNode, rec: LayoutRecord): LayoutExplanation['relayout'] {
    let current: UiNode = node;
    let depth = 0;
    for (;;) {
      if (current === this.layoutRoot || current.parent === null) {
        break;
      }
      const cRec = this.records.get(current);
      if (current !== node && cRec?.relayoutBoundary && !cRec.positioned) {
        break;
      }
      current = current.parent;
      depth++;
    }
    return {
      boundary: rec.relayoutBoundary,
      contentMatters: rec.contentMatters,
      root: current,
      rootIsLayoutRoot: current === this.layoutRoot,
      depth
    };
  }

  private isUnderRoot(node: UiNode): boolean {
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      if (current === this.layoutRoot) {
        return true;
      }
    }
    return false;
  }

  /** The nearest non-fragment ancestor without a record, if any. */
  private hiddenAncestor(node: UiNode): UiNode | null {
    for (let current = node.parent; current !== null; current = current.parent) {
      if (!this.isFragment(current) && !this.records.has(current)) {
        return current;
      }
    }
    return null;
  }

  /**
   * Counters for the most recent `layout` / `layoutForFrame` call.
   * `measured` and `placed` count nodes whose measure or place actually
   * ran (memo hits are free and not counted); `relayoutRoots` counts
   * subtrees laid out from a relayout boundary instead of the root.
   */
  readonly stats: LayoutStats = { measured: 0, placed: 0, relayoutRoots: 0, fullLayout: false, measuredNodes: [] };

  /** Records the measured nodes in `stats.measuredNodes` (for inspectors and tests). */
  trace = false;

  /** Where the dirty walks of the current frame stopped. */
  private readonly relayoutRoots = new Set<UiNode>();

  /**
   * Full layout pass for a subtree. Every record in the subtree
   * is measured and placed; other records are dropped.
   */
  /**
   * Forgets every measurement, for when what text measures has changed
   * under an unchanged tree: a declared font face arrived, so every
   * width measured with its fallback is wrong. The caller marks the
   * root's subtree dirty; the next layout then re-measures every node
   * instead of trusting the sizes it had for the same constraints.
   */
  invalidateMeasurements(): void {
    for (const rec of this.records.values()) {
      rec.measureDirty = true;
      rec.placeDirty = true;
      rec.altValid = false;
    }
  }

  layout(node: UiNode, constraints: Constraints): LayoutResult {
    this.layoutPass++;
    this.layoutVersion++;
    this.layoutRoot = node;
    this.rootConstraints = constraints;
    // The pass starts with no records and re-adds what it touches, so
    // that a node outside this subtree ends without one. The map that
    // held them is kept aside rather than cleared, so `record()` can
    // hand each node back the object it had; see `retiredRecords`.
    const retired = this.records;
    this.records = this.retiredRecords;
    if (this.records.size > 0) {
      // Only reachable if a previous pass threw part way through and
      // left its records behind; the contract is an empty map either way.
      this.records.clear();
    }
    this.retiredRecords = retired;
    this.liftedNodes.clear();
    this.scrollNodes.clear();
    this.textScrollNodes.clear();
    this.anchorOf.clear();
    this.anchorDependents.clear();
    this.movedAnchored.clear();
    this.resetStats();
    this.fullLayout(constraints);
    const rec = this.record(node);
    this.applyScroll();
    // Placement is one top-down walk, so an overlay placed before its
    // anchor saw a box the anchor has since been given, and an anchor
    // placed before the overlay reached the index moved without anything
    // to name. Scroll offsets are clamped only once the pass is over, so
    // every anchored node was placed against a list that had not
    // scrolled yet. Every box is final here, and a full layout has just
    // placed all of them, so each anchored node is settled once.
    for (const anchored of this.anchoredNodes) {
      this.movedAnchored.add(anchored);
    }
    this.replaceMovedAnchored();
    // Whatever is still in here belongs to a node this pass never
    // reached, which is exactly what a full layout drops.
    this.retiredRecords.clear();
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
    this.layoutPass++;
    if (root !== undefined) {
      this.layoutRoot = root;
      this.rootConstraints = constraints;
    } else if (this.layoutRoot === null) {
      throw new Error('LayoutEngine has no layout root. Call layout() first.');
    } else {
      this.rootConstraints = constraints;
    }

    this.resetStats();
    this.relayoutRoots.clear();
    let anyLayout = false;
    for (const [node, flags] of frame.entries()) {
      if ((flags & (DirtyFlags.Layout | DirtyFlags.Children | DirtyFlags.SubtreeLayout)) !== 0) {
        anyLayout = true;
        // A node whose own layout properties changed may have a new
        // size, so it cannot bound its own relayout; one whose children
        // changed keeps its size and can.
        this.markLayoutDirty(node, (flags & DirtyFlags.Layout) === 0);
      }
      if ((flags & DirtyFlags.Transform) !== 0) {
        // A transform is the one thing a hit test reads straight off
        // the node rather than off the record, so a node that has just
        // been given one is drawn and hit somewhere its cached subtree
        // bounds never described. Asking whether it has one now is
        // what keeps the far more common member of this flag, a scroll
        // offset changing, from throwing the bounds away every frame a
        // list is scrolled: a scroll container clips, so its bounds are
        // its own box whatever its offset, and its descendants keep
        // their pre-scroll coordinates. A node that has just *lost* its
        // transform is left alone for the same reason it is safe to:
        // its bounds say unbounded, which only costs a descent.
        const transform = node.properties.get('transform');
        if (typeof transform === 'object' && transform !== null) {
          this.layoutVersion++;
        }
        this.record(node).transformDirty = true;
        (node.type === UiNodeType.EditableText ? this.textScrollNodes : this.scrollNodes).add(node);
        // An anchored node sits next to something that may just have
        // scrolled; it is re-placed, cheaply, once the frame settles.
        for (const anchored of this.anchoredNodes) {
          this.movedAnchored.add(anchored);
        }
      }
    }

    if (!anyLayout) {
      this.applyScroll();
      this.replaceMovedAnchored();
      return;
    }

    // Every box a pass writes bumps the version on its own, but a pass
    // can also change what a box means without moving it: a node that
    // stops clipping starts letting its children be hit outside it,
    // and its cached bounds are its own box. Work was done, so the
    // summary of it is thrown away.
    this.layoutVersion++;
    this.relayout(constraints);
    this.applyScroll();
    this.replaceMovedAnchored();
  }

  /**
   * Lays out what the frame dirtied: from the root when a dirty walk
   * reached it, otherwise from each relayout boundary the walks stopped
   * at. A boundary that turns out to have changed size after all
   * (its flag was computed under an earlier layout) hands the work to
   * its parent's walk, so the result is always the one a full layout
   * would give.
   */
  private relayout(constraints: Constraints): void {
    const root = this.layoutRoot!;
    for (;;) {
      if (this.relayoutRoots.has(root)) {
        this.relayoutRoots.clear();
        this.fullLayout(constraints);
        return;
      }
      const next = this.outermostRelayoutRoot();
      if (next === null) {
        return;
      }
      this.relayoutRoots.delete(next);
      // A root inside another root's subtree is kept: the walk that
      // stopped at it did not dirty the nodes between the two, so the
      // outer root's measure may memo-hit that path and never reach it.
      // If the outer pass did reach it, its own pass is two memo hits.
      if (!this.relayoutAt(next)) {
        this.record(next).relayoutBoundary = false;
        this.markLayoutDirty(next.parent ?? root, true);
      }
    }
  }

  private fullLayout(constraints: Constraints): void {
    const root = this.layoutRoot!;
    this.stats.fullLayout = true;
    this.percentBase = this.rootPercentBase(constraints);
    const rootRec = this.record(root);
    rootRec.contentMatters = false;
    this.measure(root, this.rootMeasureConstraints(root, constraints));
    const rootBox = this.computeRootBox();
    this.assignBox(root, 0, 0, rootBox.width, rootBox.height);
    if (rootRec.placeDirty) {
      this.place(root);
    }
  }

  /**
   * Re-measures a boundary under the constraints its parent last gave
   * it and re-places its subtree in the box it already has. Returns
   * false when its size came out different, which means the parent
   * has to be involved after all.
   */
  private relayoutAt(node: UiNode): boolean {
    const rec = this.record(node);
    const flowParent = this.flowParentOf(node);
    const pRec = flowParent === null ? undefined : this.records.get(flowParent);
    // The node's own percentages resolve against the parent's content
    // box, which is final.
    this.percentBase =
      pRec === undefined
        ? this.rootPercentBase(this.rootConstraints)
        : {
            width: Math.max(0, pRec.width - pRec.paddingLeft - pRec.paddingRight),
            height: Math.max(0, pRec.height - pRec.paddingTop - pRec.paddingBottom)
          };
    const width = rec.width;
    const height = rec.height;
    this.stats.relayoutRoots++;
    this.measure(node, rec.lastConstraints);
    if (rec.measuredWidth !== width || rec.measuredHeight !== height) {
      return false;
    }
    rec.placeDirty = true;
    this.place(node);
    return true;
  }

  private outermostRelayoutRoot(): UiNode | null {
    let best: UiNode | null = null;
    let bestDepth = Infinity;
    for (const node of this.relayoutRoots) {
      const depth = this.depthOf(node);
      if (depth < bestDepth) {
        best = node;
        bestDepth = depth;
      }
    }
    return best;
  }

  private depthOf(node: UiNode): number {
    let depth = 0;
    for (let current = node.parent; current !== null; current = current.parent) {
      depth++;
    }
    return depth;
  }

  /**
   * A root without an explicit size fills bounded constraints
   * (computeRootBox), so it is measured tight there: its children then
   * see the definite size they will be placed in, and a stretched
   * child is measured once at that size instead of loose and again at
   * placement.
   */
  private rootMeasureConstraints(root: UiNode, constraints: Constraints): Constraints {
    const base = this.rootPercentBase(constraints);
    const fillsWidth = constraints.hasBoundedWidth() && this.lengthProp(root, 'width', base.width) === undefined;
    const fillsHeight = constraints.hasBoundedHeight() && this.lengthProp(root, 'height', base.height) === undefined;
    if (!fillsWidth && !fillsHeight) {
      return constraints;
    }
    return new Constraints(
      fillsWidth ? constraints.maxWidth : constraints.minWidth,
      constraints.maxWidth,
      fillsHeight ? constraints.maxHeight : constraints.minHeight,
      constraints.maxHeight
    );
  }

  private resetStats(): void {
    this.stats.measured = 0;
    this.stats.placed = 0;
    this.stats.relayoutRoots = 0;
    this.stats.fullLayout = false;
    this.stats.measuredNodes.length = 0;
  }

  /** Marks every record in a subtree as no boundary, without measuring. */
  private clearBoundaries(node: UiNode): void {
    const stack: UiNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const rec = this.records.get(current);
      if (rec !== undefined) {
        rec.relayoutBoundary = false;
        rec.contentMatters = true;
      }
      for (let child = current.firstChild; child !== null; child = child.nextSibling) {
        stack.push(child);
      }
    }
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
   * is how GessoRuntime.scrollIntoView keeps a focused row on screen.
   *
   * `inner`, a box in the node's own coordinates, reveals that part of
   * the node instead of the whole — the caret of a tall editable.
   */
  revealAdjustments(node: UiNode, padding = 0, inner?: LayoutBox): ScrollAdjustment[] {
    const rec = this.records.get(node);
    if (rec === undefined) {
      return [];
    }
    const targetX = rec.x + (inner?.x ?? 0);
    const targetY = rec.y + (inner?.y ?? 0);
    const targetWidth = inner?.width ?? rec.width;
    const targetHeight = inner?.height ?? rec.height;
    const adjustments: ScrollAdjustment[] = [];
    // The target's edges in the layout root's pre-scroll frame, brought
    // into each successive scroller's content space by removing the
    // offsets of the scrollers passed on the way up.
    let innerScrollX = 0;
    let innerScrollY = 0;
    // A field scrolls its own text first: the caret comes into the
    // field's content box, and the ancestors then only have to bring
    // the field itself into view.
    if (inner !== undefined && this.textScrollNodes.has(node)) {
      const self = this.textScrollAdjustment(rec, targetX, targetY, targetWidth, targetHeight, padding);
      if (self.scrollX !== rec.scrollX || self.scrollY !== rec.scrollY) {
        adjustments.push({ container: node, scrollX: self.scrollX, scrollY: self.scrollY });
      }
      innerScrollX = self.scrollX;
      innerScrollY = self.scrollY;
    }
    for (let current = node.parent; current !== null; current = current.parent) {
      const container = this.records.get(current);
      if (container === undefined || !container.scrollable) {
        continue;
      }
      const left = targetX - innerScrollX - padding;
      const right = targetX + targetWidth - innerScrollX + padding;
      const top = targetY - innerScrollY - padding;
      const bottom = targetY + targetHeight - innerScrollY + padding;
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

  /**
   * Where a field must scroll its own text so that `target` — the caret,
   * padded — is inside its content box.
   *
   * The offset is not clamped to the record's content size, only to
   * zero: the caret is placed from the text as it is now, while the
   * record's extent is from the last pass and so is a keystroke behind
   * while typing at the end of a line. `applyScroll` clamps against the
   * fresh extent on the pass that follows, which is what pulls the
   * offset back when text is deleted.
   */
  private textScrollAdjustment(
    rec: LayoutRecord,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number,
    padding: number
  ): { scrollX: number; scrollY: number } {
    const viewLeft = rec.x + rec.paddingLeft + rec.scrollX;
    const viewTop = rec.y + rec.paddingTop + rec.scrollY;
    const viewWidth = Math.max(0, rec.width - rec.paddingLeft - rec.paddingRight);
    const viewHeight = Math.max(0, rec.height - rec.paddingTop - rec.paddingBottom);
    const left = targetX - padding;
    const right = targetX + targetWidth + padding;
    const top = targetY - padding;
    const bottom = targetY + targetHeight + padding;
    let scrollX = rec.scrollX;
    let scrollY = rec.scrollY;
    if (left < viewLeft) {
      scrollX -= viewLeft - left;
    } else if (right > viewLeft + viewWidth) {
      scrollX += right - (viewLeft + viewWidth);
    }
    if (top < viewTop) {
      scrollY -= viewTop - top;
    } else if (bottom > viewTop + viewHeight) {
      scrollY += bottom - (viewTop + viewHeight);
    }
    return { scrollX: Math.max(0, scrollX), scrollY: Math.max(0, scrollY) };
  }

  /**
   * Shows a scroll container's scrollbars as if it had just scrolled:
   * the pointer is near them, or dragging one.
   */
  revealScrollbars(node: UiNode): void {
    const rec = this.records.get(node);
    if (rec !== undefined) {
      rec.scrollbarVisibleUntil = this.now() + SCROLLBAR_LINGER_MS;
    }
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
      if (rec === undefined || !rec.scrollable || rec.scrollbarVisibleUntil <= now) {
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
      // A node removed part way through a full pass must not be handed
      // back the record it had when the pass reaches it.
      this.retiredRecords.delete(current);
      this.liftedNodes.delete(current);
      this.scrollNodes.delete(current);
      this.textScrollNodes.delete(current);
      this.anchoredNodes.delete(current);
      this.movedAnchored.delete(current);
      this.forgetAnchoring(current);
      this.stickyNodes.delete(current);
      this.stickyShifted.delete(current);
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
    if (!rec.measureDirty) {
      if (constraintsEqual(rec.lastConstraints, constraints)) {
        return;
      }
      if (rec.altValid && constraintsEqual(rec.altConstraints, constraints)) {
        rec.swapAlt();
        return;
      }
      rec.saveAlt();
    } else {
      rec.altValid = false;
    }
    this.stats.measured++;
    if (this.trace) {
      this.stats.measuredNodes.push(node);
    }
    rec.lastConstraints = constraints;
    this.resolveLayoutProps(node, rec);
    rec.hasBaseline = false;
    const effective = this.effectiveConstraints(node, constraints, rec);
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
    // The content's own size, before any explicit or parent size: the
    // "content size suggestion" a column uses for automatic minimums,
    // and what explain() reports the content asked for.
    rec.intrinsicWidth = size.width;
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
    if (node.type === UiNodeType.Grid) {
      return this.measureGrid(node, rec, content);
    }
    return this.measureStack(node, rec, content);
  }

  // ---------------------------------------------------------------------------
  // Grid
  // ---------------------------------------------------------------------------

  private measureGrid(node: UiNode, rec: LayoutRecord, content: Constraints): Size {
    const paddingH = rec.paddingLeft + rec.paddingRight;
    const paddingV = rec.paddingTop + rec.paddingBottom;
    const grid = this.layoutGrid(
      node,
      content,
      this.definiteAxis(content, 'width'),
      this.definiteAxis(content, 'height')
    );
    rec.minContentWidth = paddingH + grid.columns.minTotal;
    const first = grid.placements[0];
    if (first !== undefined) {
      const cRec = this.record(first.item);
      rec.hasBaseline = true;
      rec.baseline =
        rec.paddingTop +
        grid.rows.tracks[first.rowStart].offset +
        cRec.marginTop +
        (cRec.hasBaseline ? cRec.baseline : cRec.measuredHeight);
    }
    return { width: paddingH + grid.columns.total, height: paddingV + grid.rows.total };
  }

  private placeGrid(node: UiNode, rec: LayoutRecord): void {
    const contentX = rec.x + rec.paddingLeft;
    const contentY = rec.y + rec.paddingTop;
    const contentWidth = Math.max(0, rec.width - rec.paddingLeft - rec.paddingRight);
    const contentHeight = Math.max(0, rec.height - rec.paddingTop - rec.paddingBottom);
    // The box is final: tracks are sized against it, percentages resolve.
    const content = new Constraints(contentWidth, contentWidth, contentHeight, contentHeight);
    const grid = this.layoutGrid(node, content, contentWidth, contentHeight);
    const gridX = parseCrossAxisAlignment(node.properties.get('x')) ?? CrossAxisAlignment.Stretch;
    const gridY = parseCrossAxisAlignment(node.properties.get('y')) ?? CrossAxisAlignment.Stretch;
    const savedBase = this.percentBase;
    for (const placement of grid.placements) {
      const child = placement.item;
      const cRec = this.record(child);
      const area = this.gridArea(grid, placement);
      this.percentBase = { width: area.width, height: area.height };
      this.resolveLayoutProps(child, cRec);
      const alignX = this.stackAlignment(child, 'selfX', 'width', gridX);
      const alignY = this.stackAlignment(child, 'selfY', 'height', gridY);
      const availableWidth = Math.max(0, area.width - cRec.marginLeft - cRec.marginRight);
      const availableHeight = Math.max(0, area.height - cRec.marginTop - cRec.marginBottom);
      this.measure(
        child,
        new Constraints(
          alignX === CrossAxisAlignment.Stretch ? availableWidth : 0,
          availableWidth,
          alignY === CrossAxisAlignment.Stretch ? availableHeight : 0,
          availableHeight
        )
      );
      const x = contentX + area.x + cRec.marginLeft + this.stackOffset(alignX, availableWidth, cRec.measuredWidth);
      const y = contentY + area.y + cRec.marginTop + this.stackOffset(alignY, availableHeight, cRec.measuredHeight);
      this.assignBox(child, x, y, cRec.measuredWidth, cRec.measuredHeight);
    }
    this.percentBase = savedBase;
  }

  /**
   * Places the grid's items and sizes both axes' tracks (GridLayout.ts
   * does the arithmetic). Columns are sized from the items' intrinsic
   * widths, then rows from the items' heights at their column widths —
   * the same two-step CSS Grid takes, which is what lets text in a cell
   * wrap at its column and decide its row's height.
   */
  private layoutGrid(
    node: UiNode,
    content: Constraints,
    availableWidth: number | undefined,
    availableHeight: number | undefined
  ): { columns: GridTrackSizingResult; rows: GridTrackSizingResult; placements: GridPlacement<UiNode>[] } {
    const columnsProp = this.trackList(node, 'columns');
    const rowsProp = this.trackList(node, 'rows');
    const autoColumns = this.trackSize(node, 'autoColumns');
    const autoRows = this.trackSize(node, 'autoRows');
    const flow = node.properties.get('autoFlow') === 'column' ? 'column' : 'row';
    const gap = this.numberProp(node, 'gap') ?? 0;
    const columnGap = this.numberProp(node, 'columnGap') ?? gap;
    const rowGap = this.numberProp(node, 'rowGap') ?? gap;
    const gridX = parseCrossAxisAlignment(node.properties.get('x')) ?? CrossAxisAlignment.Stretch;

    // A subgrid's own tracks come from its parent, so its own `columns`
    // prop is not read here: the tracks it has are the span it was
    // given, and its cells are placed into those.
    const subgridded = this.subgridColumns(node);
    const explicitColumns = subgridded?.tracks.length ?? columnsProp.length;
    const requests = this.gridRequests(node, explicitColumns);
    const placed = placeGridItems(requests, explicitColumns, rowsProp.length, flow);
    const columnSizes = subgridded?.tracks ?? this.fillTracks(columnsProp, placed.columnCount, autoColumns);
    const rowSizes = this.fillTracks(rowsProp, placed.rowCount, autoRows);
    const effectiveColumnGap = subgridded?.gap ?? columnGap;

    const savedBase = this.percentBase;
    this.percentBase = { width: availableWidth, height: availableHeight };

    // Columns: from each item's min- and max-content width — except a
    // subgrid item, whose own children contribute to the tracks it
    // spans, one per column, so the parent sizes a column from the
    // cells in it rather than from a row treated as one lump.
    const gridRec = this.record(node);
    const columnItems: Array<{ start: number; end: number; contribution: GridContribution }> = [];
    for (const placement of placed.placements) {
      const cRec = this.record(placement.item);
      this.resolveLayoutProps(placement.item, cRec);
      if (this.isSubgrid(placement.item)) {
        cRec.contentMatters = true;
        cRec.relayoutBoundary = false;
        this.collectSubgridColumns(placement, columnItems);
        continue;
      }
      // Tracks are sized from the items' content unless both of an
      // item's sizes are lengths.
      const explicitBoth =
        this.lengthProp(placement.item, 'width', undefined) !== undefined &&
        this.lengthProp(placement.item, 'height', undefined) !== undefined;
      cRec.contentMatters = gridRec.contentMatters || !explicitBoth;
      this.measure(placement.item, new Constraints(0, Infinity, 0, Infinity));
      cRec.relayoutBoundary =
        explicitBoth && !cRec.contentMatters && cRec.aspectRatio === undefined && !cRec.positioned;
      const marginH = cRec.marginLeft + cRec.marginRight;
      const contribution: GridContribution = {
        min: this.minContentContribution(placement.item, cRec) + marginH,
        max: cRec.measuredWidth + marginH
      };
      columnItems.push({ start: placement.columnStart, end: placement.columnEnd, contribution });
    }
    const columns = sizeGridTracks({
      sizes: columnSizes,
      available: availableWidth,
      gap: effectiveColumnGap,
      distribution: parseAlignContent(node.properties.get('justifyContent')),
      items: columnItems
    });

    // Every subgrid row now knows the widths it must lay its cells out
    // in, before it is measured for its own row's height below.
    for (const placement of placed.placements) {
      if (this.isSubgrid(placement.item)) {
        this.publishSubgridTracks(placement, columns, effectiveColumnGap);
      }
    }

    // Rows: from each item's height at the width its column area gives it.
    const rowItems = placed.placements.map(placement => {
      const cRec = this.record(placement.item);
      const areaWidth = this.spanExtent(columns, placement.columnStart, placement.columnEnd, effectiveColumnGap);
      const alignX = this.stackAlignment(placement.item, 'selfX', 'width', gridX);
      const marginH = cRec.marginLeft + cRec.marginRight;
      const width = Math.max(0, areaWidth - marginH);
      this.percentBase = { width: areaWidth, height: availableHeight };
      this.measure(
        placement.item,
        new Constraints(alignX === CrossAxisAlignment.Stretch ? width : 0, width, 0, Infinity)
      );
      const height = cRec.measuredHeight + cRec.marginTop + cRec.marginBottom;
      return { start: placement.rowStart, end: placement.rowEnd, contribution: { min: height, max: height } };
    });
    const rows = sizeGridTracks({
      sizes: rowSizes,
      available: availableHeight,
      gap: rowGap,
      distribution: parseAlignContent(node.properties.get('alignContent')),
      items: rowItems
    });
    this.percentBase = savedBase;
    void content;
    return { columns, rows, placements: placed.placements };
  }

  /**
   * A grid's items, fragments expanded, with their placement requests.
   *
   * A subgrid child that does not say how many columns it spans spans
   * all of them: a table row shares the whole header, and requiring
   * every row to repeat the column count would be a number to keep in
   * step with the columns array.
   */
  private gridRequests(node: UiNode, explicitColumns: number): GridItemRequest<UiNode>[] {
    const requests: GridItemRequest<UiNode>[] = [];
    this.forEachLayoutChild(node, child => {
      const declaredSpan = this.numberProp(child, 'columnSpan');
      const span =
        declaredSpan === undefined && this.isSubgrid(child)
          ? Math.max(1, explicitColumns)
          : Math.max(1, Math.floor(declaredSpan ?? 1));
      requests.push({
        item: child,
        column: this.lineProp(child, 'column'),
        row: this.lineProp(child, 'row'),
        columnSpan: span,
        rowSpan: Math.max(1, Math.floor(this.numberProp(child, 'rowSpan') ?? 1))
      });
    });
    return requests;
  }

  /** A Grid that takes its column tracks from the grid it sits in. */
  private isSubgrid(node: UiNode): boolean {
    return node.type === UiNodeType.Grid && node.properties.get('subgrid') === 'columns';
  }

  /**
   * The tracks a subgrid was handed by its parent, as fixed lengths, or
   * undefined for an ordinary grid.
   *
   * A subgrid that is laid out with no parent tracks yet — measured on
   * its own, or sitting in something that is not a Grid — falls back to
   * its own `columns`, so it degrades to an ordinary grid rather than
   * collapsing to nothing.
   */
  private subgridColumns(node: UiNode): { tracks: UiTrackSize[]; gap: number } | undefined {
    if (!this.isSubgrid(node)) {
      return undefined;
    }
    const rec = this.record(node);
    if (rec.subgridColumns === undefined) {
      return undefined;
    }
    return { tracks: [...rec.subgridColumns], gap: rec.subgridColumnGap };
  }

  /**
   * Contributes a subgrid's cells to the parent's tracks, one entry per
   * cell in the parent's column space.
   *
   * The cells are measured here rather than through the subgrid,
   * because the subgrid cannot be measured until the tracks these
   * contributions decide exist. A subgrid's own horizontal padding and
   * margins are not distributed into the tracks (CSS subgrid does):
   * a row that wants inset content puts the padding on its cells.
   */
  private collectSubgridColumns(
    placement: GridPlacement<UiNode>,
    out: Array<{ start: number; end: number; contribution: GridContribution }>
  ): void {
    const span = placement.columnEnd - placement.columnStart;
    const inner = placeGridItems(this.gridRequests(placement.item, span), span, 0, 'row');
    for (const cell of inner.placements) {
      const cellRec = this.record(cell.item);
      this.resolveLayoutProps(cell.item, cellRec);
      cellRec.contentMatters = true;
      this.measure(cell.item, new Constraints(0, Infinity, 0, Infinity));
      cellRec.relayoutBoundary = false;
      const marginH = cellRec.marginLeft + cellRec.marginRight;
      out.push({
        // A cell beyond the row's span is clamped into it: the parent
        // has no track there, and a row is not allowed to add one.
        start: placement.columnStart + Math.min(cell.columnStart, span - 1),
        end: placement.columnStart + Math.min(cell.columnEnd, span),
        contribution: {
          min: this.minContentContribution(cell.item, cellRec) + marginH,
          max: cellRec.measuredWidth + marginH
        }
      });
    }
  }

  /**
   * Writes the parent's resolved tracks onto a subgrid, and marks it
   * for re-measurement when they moved — its constraints can be
   * unchanged while the tracks inside them are not, and the measurement
   * cache compares only constraints.
   */
  private publishSubgridTracks(placement: GridPlacement<UiNode>, columns: GridTrackSizingResult, gap: number): void {
    const rec = this.record(placement.item);
    const tracks: number[] = [];
    for (let index = placement.columnStart; index < placement.columnEnd; index++) {
      tracks.push(columns.tracks[Math.min(index, columns.tracks.length - 1)]?.size ?? 0);
    }
    const previous = rec.subgridColumns;
    if (
      previous === undefined ||
      rec.subgridColumnGap !== gap ||
      previous.length !== tracks.length ||
      previous.some((size, index) => size !== tracks[index])
    ) {
      rec.subgridColumns = tracks;
      rec.subgridColumnGap = gap;
      rec.measureDirty = true;
      rec.placeDirty = true;
    }
  }

  private gridArea(
    grid: { columns: GridTrackSizingResult; rows: GridTrackSizingResult },
    placement: GridPlacement<UiNode>
  ): LayoutBox {
    const x = grid.columns.tracks[placement.columnStart].offset;
    const y = grid.rows.tracks[placement.rowStart].offset;
    const lastColumn = grid.columns.tracks[placement.columnEnd - 1];
    const lastRow = grid.rows.tracks[placement.rowEnd - 1];
    return { x, y, width: lastColumn.offset + lastColumn.size - x, height: lastRow.offset + lastRow.size - y };
  }

  private spanExtent(result: GridTrackSizingResult, start: number, end: number, gap: number): number {
    if (end <= start || result.tracks.length === 0) {
      return 0;
    }
    const first = result.tracks[Math.min(start, result.tracks.length - 1)];
    const last = result.tracks[Math.min(end - 1, result.tracks.length - 1)];
    void gap;
    return last.offset + last.size - first.offset;
  }

  private fillTracks(explicit: readonly UiTrackSize[], count: number, implicit: UiTrackSize): UiTrackSize[] {
    const sizes = [...explicit];
    while (sizes.length < count) {
      sizes.push(implicit);
    }
    return sizes;
  }

  private trackList(node: UiNode, property: string): readonly UiTrackSize[] {
    const value = node.properties.get(property);
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error(
        `Property '${property}' must be an array of track sizes (numbers, percent(), auto, fr(), minmax()).`
      );
    }
    return value as UiTrackSize[];
  }

  private trackSize(node: UiNode, property: string): UiTrackSize {
    const value = node.properties.get(property);
    return value === undefined || value === null ? { unit: 'auto' } : (value as UiTrackSize);
  }

  /** A 1-based grid line, or undefined for auto placement. */
  private lineProp(node: UiNode, property: string): number | undefined {
    const value = this.numberProp(node, property);
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Property '${property}' must be a positive integer grid line, got ${String(value)}.`);
    }
    return value;
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
        this.measureFlexedItems(
          line.items,
          content,
          direction,
          crossDefinite && !config.wrap ? (row ? content.maxHeight : content.maxWidth) : undefined
        );
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
    this.markFlexBoundaries(lines);

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
    const rec = this.record(node);
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
      const explicitCross = this.lengthProp(child, row ? 'height' : 'width', crossBase) !== undefined;
      if (align === CrossAxisAlignment.Stretch && explicitCross) {
        align = CrossAxisAlignment.Start;
      }
      // What this container reads from the item beyond its size: its
      // baseline when aligning by baseline, and whatever this container
      // passes on to its own parent.
      cRec.contentMatters = rec.contentMatters || align === CrossAxisAlignment.Baseline;
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
      let minFromContent = false;
      if (row ? cRec.minWidthAuto : cRec.minHeightAuto) {
        // Scroll containers and text that clips (ellipsis, maxLines) do
        // not have visible overflow, so CSS gives them no automatic
        // minimum; everything else keeps its min-content size.
        // An editable is a field, not a label: it shrinks to what the
        // row gives it and its text scrolls or wraps inside.
        const clips =
          child.type === UiNodeType.ScrollView ||
          child.type === UiNodeType.EditableText ||
          child.properties.get('textOverflow') === 'ellipsis' ||
          this.numberProp(child, 'maxLines') !== undefined;
        const contentSuggestion = clips ? 0 : row ? cRec.minContentWidth : cRec.intrinsicHeight;
        minMain = Math.min(contentSuggestion, explicitMain ?? Infinity, maxMain);
        minFromContent = !clips && explicitMain === undefined;
      } else {
        minMain = row ? cRec.minWidth : cRec.minHeight;
      }
      const basis = this.flexBasis(child, cRec, mainBase);
      const baseMain = basis ?? measuredMain;
      // The main size is content-free when it comes from a length or an
      // explicit basis whose automatic minimum is not the content; the
      // cross size when it is a length or tight for stretching.
      const sizeFree =
        (explicitMain !== undefined || (basis !== undefined && !minFromContent)) &&
        (explicitCross || (align === CrossAxisAlignment.Stretch && crossTightForStretch)) &&
        cRec.aspectRatio === undefined &&
        !cRec.positioned;
      // Along a mirrored main axis (rtl, *-reverse) the physical start
      // margin is the logical end margin; positions are mirrored back
      // at placement, so the swap lands each margin on its own side.
      const physicalStart = row ? cRec.marginLeft : cRec.marginTop;
      const physicalEnd = row ? cRec.marginRight : cRec.marginBottom;
      const physicalStartAuto = row ? cRec.marginLeftAuto : cRec.marginTopAuto;
      const physicalEndAuto = row ? cRec.marginRightAuto : cRec.marginBottomAuto;
      // Kept on the record so explain() can say how the item flexed.
      cRec.flexMain = row ? 1 : 2;
      cRec.flexBase = baseMain;
      cRec.flexMin = minMain;
      cRec.flexMax = maxMain;
      cRec.flexMinAuto = row ? cRec.minWidthAuto : cRec.minHeightAuto;
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
        sizeFree,
        align,
        frozen: false,
        violation: 0
      });
    });
    this.percentBase = savedBase;
    return items;
  }

  /**
   * Decides, once a line's main sizes are final, which items are
   * relayout boundaries. An item that was shrunk below its hypothetical
   * size had its automatic minimum — its content — consulted, so its
   * content matters from now on; every boundary below it is cleared,
   * because those were decided while it did not.
   */
  private markFlexBoundaries(lines: FlexLine[]): void {
    for (const line of lines) {
      for (const item of line.items) {
        const shrunk = item.finalMain < item.hypotheticalMain - 1e-6;
        if (shrunk && !item.rec.contentMatters) {
          item.rec.contentMatters = true;
          this.clearBoundaries(item.child);
        }
        item.rec.relayoutBoundary = item.sizeFree && !shrunk && !item.rec.contentMatters;
      }
    }
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
    // The items' own percentages resolve against this container's
    // content box, as they did when the items were collected. Without
    // this the second measure of a grown item saw the base left over
    // from measuring the container itself, its parent's box, and a
    // `width: percent(100)` item in a column came out the width of the
    // grandparent.
    const mainBase = this.definiteAxis(content, row ? 'width' : 'height');
    const crossBase = this.definiteAxis(content, row ? 'height' : 'width');
    const savedBase = this.percentBase;
    this.percentBase = row ? { width: mainBase, height: crossBase } : { width: crossBase, height: mainBase };
    for (const item of items) {
      const measuredMain = row ? item.rec.measuredWidth : item.rec.measuredHeight;
      // A stretched item of a single-line container whose cross size is
      // known is measured at that size here, so the stretch pass finds
      // it measured already: two constraint sets per item, not three.
      const stretched =
        item.align === CrossAxisAlignment.Stretch &&
        crossAvailable !== undefined &&
        !item.marginCrossStartAuto &&
        !item.marginCrossEndAuto;
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
    this.percentBase = savedBase;
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
   *
   * A scroll container contributes nothing it does not ask for: its
   * content scrolls rather than widening it. An editable is the same
   * kind of box — a field whose text scrolls or wraps inside it, not a
   * label that must be shown whole — so it passes nothing up either.
   * Without that, an unwrapped field's whole line would become its
   * parent's minimum, and a row would push its siblings narrower with
   * every character typed.
   */
  private minContentContribution(child: UiNode, cRec: LayoutRecord): number {
    if (child.type === UiNodeType.ScrollView || child.type === UiNodeType.EditableText) {
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
    const definiteWidth = this.definiteAxis(content, 'width');
    const definiteHeight = this.definiteAxis(content, 'height');
    this.percentBase = { width: definiteWidth, height: definiteHeight };
    const stackX = parseCrossAxisAlignment(node.properties.get('x')) ?? CrossAxisAlignment.Start;
    const stackY = parseCrossAxisAlignment(node.properties.get('y')) ?? CrossAxisAlignment.Start;
    this.forEachLayoutChild(node, child => {
      const cRec = this.record(child);
      this.resolveLayoutProps(child, cRec);
      // A stretched child of a definite stack is measured at the size
      // it will be placed in, as a stretched flex item is; the loose
      // measurement would only be repeated tight at placement.
      const explicitWidth = this.lengthProp(child, 'width', definiteWidth) !== undefined;
      const explicitHeight = this.lengthProp(child, 'height', definiteHeight) !== undefined;
      const stretchX =
        definiteWidth !== undefined &&
        this.stackAlignment(child, 'selfX', 'width', stackX) === CrossAxisAlignment.Stretch;
      const stretchY =
        definiteHeight !== undefined &&
        this.stackAlignment(child, 'selfY', 'height', stackY) === CrossAxisAlignment.Stretch;
      const availableWidth = Math.max(0, content.maxWidth - cRec.marginLeft - cRec.marginRight);
      const availableHeight = Math.max(0, content.maxHeight - cRec.marginTop - cRec.marginBottom);
      // The stack passes its first child's baseline and every child's
      // min-content on to its own parent.
      cRec.contentMatters = rec.contentMatters;
      this.measure(
        child,
        new Constraints(
          stretchX ? availableWidth : 0,
          stretchX ? availableWidth : content.maxWidth,
          stretchY ? availableHeight : 0,
          stretchY ? availableHeight : content.maxHeight
        )
      );
      cRec.relayoutBoundary =
        (explicitWidth || stretchX) &&
        (explicitHeight || stretchY) &&
        cRec.aspectRatio === undefined &&
        !cRec.positioned &&
        !cRec.contentMatters;
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
    const definiteWidth = this.definiteAxis(content, 'width');
    const definiteHeight = this.definiteAxis(content, 'height');
    this.percentBase = { width: definiteWidth, height: definiteHeight };
    const crossDefinite = vertical ? definiteWidth : definiteHeight;
    const crossAlign = parseCrossAxisAlignment(node.properties.get(vertical ? 'x' : 'y')) ?? CrossAxisAlignment.Stretch;
    this.forEachLayoutChild(node, child => {
      const cRec = this.record(child);
      this.resolveLayoutProps(child, cRec);
      const explicitMain = this.lengthProp(
        child,
        vertical ? 'height' : 'width',
        vertical ? definiteHeight : definiteWidth
      );
      const explicitCross = this.lengthProp(child, vertical ? 'width' : 'height', crossDefinite) !== undefined;
      const align = parseCrossAxisAlignment(child.properties.get(vertical ? 'selfX' : 'selfY')) ?? crossAlign;
      // A stretched child of a definite scroller is measured at the
      // cross size placement gives it; placeFlex then finds it measured.
      const crossTight = crossDefinite !== undefined && align === CrossAxisAlignment.Stretch && !explicitCross;
      const childMarginCross = vertical ? cRec.marginLeft + cRec.marginRight : cRec.marginTop + cRec.marginBottom;
      const crossLimit = Math.max(0, (vertical ? content.maxWidth : content.maxHeight) - childMarginCross);
      const childBase = vertical
        ? new Constraints(crossTight ? crossLimit : 0, crossLimit, 0, Infinity)
        : new Constraints(0, Infinity, crossTight ? crossLimit : 0, crossLimit);
      // Scrollable content pushes on nothing outside the scroller.
      cRec.contentMatters = false;
      this.measure(child, childBase);
      cRec.relayoutBoundary =
        explicitMain !== undefined &&
        (explicitCross || crossTight) &&
        cRec.aspectRatio === undefined &&
        !cRec.positioned;
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
    const editable = node.type === UiNodeType.EditableText;
    if (node.type === UiNodeType.Text || node.type === UiNodeType.Button || editable) {
      // An editable's text is the user's, held by its model rather than
      // a property; its placeholder sizes it while it is empty, so an
      // empty field is as wide as the hint it shows.
      const text = editable ? editorFor(node).text : String(node.properties.get('text') ?? '');
      const placeholderProp = node.properties.get('placeholder');
      const placeholder =
        editable && text.length === 0 && typeof placeholderProp === 'string' ? placeholderProp : undefined;
      // The same resolution paint uses, so the line box measured here is
      // the one the glyphs are drawn in.
      const font = resolveFont(node);
      const maxLines = editable ? undefined : this.numberProp(node, 'maxLines');
      const request = {
        text,
        fontSize: font.fontSize,
        fontFamily: font.fontFamily,
        fontWeight: font.fontWeight,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
        maxWidth: isFinite(effective.maxWidth) ? Math.max(0, effective.maxWidth - paddingH) : undefined,
        wrap: this.textWrapProp(node),
        maxLines: maxLines !== undefined && maxLines >= 1 ? Math.floor(maxLines) : undefined,
        overflow: editable ? ('clip' as const) : this.textOverflowProp(node)
      };
      const paragraph = this.textMeasurer.layout(request);
      let width = paragraph.width;
      let minContentWidth = paragraph.minContentWidth;
      let maxContentWidth = paragraph.maxContentWidth;
      if (placeholder !== undefined && placeholder.length > 0) {
        const hint = this.textMeasurer.layout({ ...request, text: placeholder });
        width = Math.max(width, hint.width);
        minContentWidth = Math.max(minContentWidth, hint.minContentWidth);
        maxContentWidth = Math.max(maxContentWidth, hint.maxContentWidth);
      }
      rec.hasBaseline = true;
      rec.baseline = rec.paddingTop + paragraph.firstBaseline;
      rec.minContentWidth = minContentWidth + paddingH;
      rec.maxContentWidth = maxContentWidth + paddingH;
      if (editable) {
        // The field's scrollable extent. A wrapped field's paragraph is
        // no wider than the box and only its height can overflow; an
        // unwrapped one keeps its whole line here, which is what the
        // caret scrolls along. `applyScroll` clamps the offset to it,
        // so a field that grows short again scrolls back on its own.
        rec.contentWidth = width + paddingH;
        rec.contentHeight = paragraph.height + paddingV;
        this.textScrollNodes.add(node);
      }
      return { width: width + paddingH, height: paragraph.height + paddingV };
    }
    if (node.type === UiNodeType.Paint) {
      // A painter may declare the size it wants when nothing else
      // gives the node one, which is how a sparkline in a row of text
      // gets a box without the caller restating its dimensions. It is
      // the leaf equivalent of a paragraph's measured width, and like
      // one it is only a preference: an explicit width, a flex or a
      // stretch still wins.
      const paint = node.properties.get('paint') as { intrinsicWidth?: number; intrinsicHeight?: number } | undefined;
      const intrinsicWidth = paint?.intrinsicWidth ?? 0;
      rec.minContentWidth = intrinsicWidth + paddingH;
      rec.maxContentWidth = intrinsicWidth + paddingH;
      return { width: intrinsicWidth + paddingH, height: (paint?.intrinsicHeight ?? 0) + paddingV };
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
    this.stats.placed++;
    rec.placeDirty = false;
    if (!node.hasChildren()) {
      return;
    }
    if (node.type === UiNodeType.Row || node.type === UiNodeType.Column) {
      this.placeFlex(node, rec, node.type === UiNodeType.Row ? FlexDirection.Row : FlexDirection.Column);
    } else if (node.type === UiNodeType.ScrollView) {
      this.placeFlex(node, rec, this.scrollDirection(node));
    } else if (node.type === UiNodeType.Grid) {
      this.placeGrid(node, rec);
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
        this.trackAnchor(child, anchor as UiNode);
        const anchorRec = this.records.get(anchor as UiNode);
        if (anchorRec !== undefined) {
          this.placeAnchored(child, cRec, anchorRec, anchor as UiNode, block);
          return;
        }
      } else {
        this.anchoredNodes.delete(child);
        this.trackAnchor(child, null);
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

    // Anchor box in the child's coordinate space: where each of the two
    // is seen, which is its box less the scrolling above it and plus the
    // sticky shifts holding it, brought back into the child's own frame.
    const scrollAnchor = this.scrollOffsetOf(anchor);
    const scrollChild = this.scrollOffsetOf(child);
    const stickyAnchor = this.stickyOffsetOf(anchor);
    const stickyChild = this.stickyOffsetOf(child);
    const ax = anchorRec.x + stickyAnchor.x - scrollAnchor.x + scrollChild.x - stickyChild.x;
    const ay = anchorRec.y + stickyAnchor.y - scrollAnchor.y + scrollChild.y - stickyChild.y;
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

  /**
   * Records which anchor an anchored node is placed against, in both
   * directions, so a moved anchor can name its dependents. Passing
   * `null` forgets the node, which is what a child that lost its
   * `anchor` property does.
   */
  private trackAnchor(child: UiNode, anchor: UiNode | null): void {
    const previous = this.anchorOf.get(child);
    if (previous === (anchor ?? undefined)) {
      return;
    }
    if (previous !== undefined) {
      const siblings = this.anchorDependents.get(previous);
      siblings?.delete(child);
      if (siblings !== undefined && siblings.size === 0) {
        this.anchorDependents.delete(previous);
      }
    }
    if (anchor === null) {
      this.anchorOf.delete(child);
      return;
    }
    this.anchorOf.set(child, anchor);
    let dependents = this.anchorDependents.get(anchor);
    if (dependents === undefined) {
      dependents = new Set<UiNode>();
      this.anchorDependents.set(anchor, dependents);
    }
    dependents.add(child);
  }

  /** Drops a removed node from the anchor index, on both sides of it. */
  private forgetAnchoring(node: UiNode): void {
    this.trackAnchor(node, null);
    const dependents = this.anchorDependents.get(node);
    if (dependents === undefined) {
      return;
    }
    for (const dependent of dependents) {
      this.anchorOf.delete(dependent);
    }
    this.anchorDependents.delete(node);
  }

  /**
   * Re-places the anchored nodes whose anchor moved during this pass.
   * Placement is a single top-down walk, so an overlay may be reached
   * before the anchor it follows; this runs once every box is final,
   * and only over the overlays an actually moved box named. Placing one
   * can move another that is anchored to it, so the queue is drained
   * until it stays empty, up to a depth that stops a cycle.
   */
  private replaceMovedAnchored(): void {
    for (let pass = 0; this.movedAnchored.size > 0 && pass < ANCHOR_CHAIN_LIMIT; pass++) {
      const pending = [...this.movedAnchored];
      this.movedAnchored.clear();
      for (const child of pending) {
        this.replaceAnchored(child);
      }
    }
    this.movedAnchored.clear();
  }

  /** Places one anchored node against the box its anchor now has. */
  private replaceAnchored(child: UiNode): void {
    const cRec = this.records.get(child);
    const anchor = this.anchorOf.get(child);
    const anchorRec = anchor === undefined ? undefined : this.records.get(anchor);
    if (cRec === undefined || anchor === undefined || anchorRec === undefined) {
      return;
    }
    const savedBase = this.percentBase;
    const block = this.containingBlockOf(child);
    this.percentBase = { width: block.width, height: block.height };
    this.resolveLayoutProps(child, cRec);
    this.placeAnchored(child, cRec, anchorRec, anchor, block);
    this.percentBase = savedBase;
    // Only a node that came out somewhere new has anything to re-place
    // inside it; assignBox left the flag set if it did.
    if (cRec.placeDirty) {
      this.place(child);
    }
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

  /**
   * Sum of the sticky shifts holding a node where it is seen: its own,
   * and every ancestor's, since a sticky node carries its whole subtree
   * with it. A tree with nothing sticky in it answers without walking.
   */
  private stickyOffsetOf(node: UiNode): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.stickyNodes.size === 0) {
      return { x, y };
    }
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      const rec = this.records.get(current);
      if (rec !== undefined) {
        x += rec.stickyOffsetX;
        y += rec.stickyOffsetY;
      }
    }
    return { x, y };
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
      this.measureFlexedItems(line.items, content, direction, config.wrap ? undefined : contentCross);
      line.cross = this.flexLineCross(line.items, row);
    }
    this.markFlexBoundaries(lines);

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
    // As in `measureFlexedItems`: the items' percentages are this
    // container's, not the base left over from measuring the container.
    const mainBase = this.definiteAxis(content, row ? 'width' : 'height');
    const crossBase = this.definiteAxis(content, row ? 'height' : 'width');
    const savedBase = this.percentBase;
    this.percentBase = row ? { width: mainBase, height: crossBase } : { width: crossBase, height: mainBase };
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
    this.percentBase = savedBase;
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

  /**
   * Marks a node and its ancestors for re-measure and re-place, up to
   * the first relayout boundary — a node whose parent cannot be
   * affected by anything inside it — or the root. The node itself may
   * be that boundary only when `selfCanBound` says its own size is
   * not in question.
   */
  private markLayoutDirty(node: UiNode, selfCanBound = false): void {
    let current: UiNode = node;
    for (;;) {
      // Only nodes that have been laid out have records. Fragments never
      // do — measure and place look through them to their children —
      // and must not get one here: renderers treat a record as a box
      // to cull against, and a fragment's would be empty.
      const rec = this.records.get(current);
      if (rec !== undefined) {
        rec.measureDirty = true;
        rec.placeDirty = true;
      }
      if (current === this.layoutRoot || current.parent === null) {
        this.relayoutRoots.add(this.layoutRoot ?? current);
        return;
      }
      if (rec?.relayoutBoundary && !rec.positioned && (current !== node || selfCanBound)) {
        this.relayoutRoots.add(current);
        return;
      }
      current = current.parent;
    }
  }

  private applyScroll(): void {
    for (const node of this.scrollNodes) {
      this.applyScrollOffset(node, false);
    }
    // A field has no scrollbars, so nothing lingers after it scrolls;
    // it does keep room for the caret past the end of its text.
    for (const node of this.textScrollNodes) {
      this.applyScrollOffset(node, true);
    }
    this.applySticky();
  }

  /**
   * Brings a record's scroll offset up to date with its `scrollX` and
   * `scrollY` properties, clamped to what there is to scroll. This runs
   * every pass, so an offset written against a larger content — a field
   * whose text has since been deleted, a list that lost rows — comes
   * back into range on its own.
   *
   * A field that scrolls may go one caret width further than its text,
   * so that a caret at the very end is inside the box and not on its
   * edge, where the clip would take it. A field wide enough for its
   * text does not: the allowance would shift the line by a pixel the
   * moment the caret reached the end.
   */
  private applyScrollOffset(node: UiNode, field: boolean): void {
    const rec = this.record(node);
    const rawX = this.numberProp(node, 'scrollX') ?? 0;
    const rawY = this.numberProp(node, 'scrollY') ?? 0;
    const caret = field ? CARET_WIDTH : 0;
    const overflowX = rec.contentWidth - rec.width;
    const overflowY = rec.contentHeight - rec.height;
    const maxX = overflowX > 0 ? overflowX + caret : 0;
    const maxY = overflowY > 0 ? overflowY + caret : 0;
    const scrollX = this.clamp(rawX, 0, maxX);
    const scrollY = this.clamp(rawY, 0, maxY);
    if (scrollX !== rec.scrollX || scrollY !== rec.scrollY) {
      rec.scrollX = scrollX;
      rec.scrollY = scrollY;
      if (!field) {
        // Overlay scrollbars show while the user scrolls and linger a
        // moment after; the host repaints when they fade.
        rec.scrollbarVisibleUntil = this.now() + SCROLLBAR_LINGER_MS;
      }
    }
    rec.transformDirty = false;
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
    this.stickyShifted.clear();
    for (const node of this.stickyNodes) {
      const rec = this.records.get(node);
      if (rec === undefined) {
        continue;
      }
      const wasX = rec.stickyOffsetX;
      const wasY = rec.stickyOffsetY;
      this.resolveStickyOffset(node, rec);
      if (rec.stickyOffsetX !== wasX || rec.stickyOffsetY !== wasY) {
        this.stickyShifted.add(node);
      }
    }
    if (this.stickyShifted.size > 0) {
      // A shift moves a node, and everything under it, without moving
      // a box, so nothing else here would tell the subtree bounds that
      // the tree they summarise has changed shape.
      this.layoutVersion++;
      if (this.anchorOf.size > 0) {
        this.followStickyShifts();
      }
    }
  }

  /**
   * The shift for one sticky node, written onto its record. Zero is the
   * answer for a node with nothing to stick inside, or with no inset to
   * hold it at an edge.
   */
  private resolveStickyOffset(node: UiNode, rec: LayoutRecord): void {
    rec.stickyOffsetX = 0;
    rec.stickyOffsetY = 0;
    const scroller = this.scrollAncestorOf(node);
    const parent = this.flowParentOf(node);
    if (scroller === null || parent === null) {
      return;
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

  /**
   * Queues the overlays a sticky shift moved. A sticky node carries its
   * whole subtree, so an overlay anchored to the node, or to anything
   * inside it, is now beside where its anchor used to be, and one that
   * lives inside a shifted node has been carried away from an anchor
   * that has not moved. Both are placed again once the pass settles.
   *
   * The question is asked of the anchored nodes, of which a screen has
   * a handful, rather than of the shifted subtrees, which are as large
   * as a header's contents; and only on a pass where a shift changed.
   */
  private followStickyShifts(): void {
    for (const [child, anchor] of this.anchorOf) {
      if (this.carriedBySticky(anchor) || this.carriedBySticky(child)) {
        this.movedAnchored.add(child);
      }
    }
  }

  /** Whether a sticky node that shifted this pass is carrying `node`. */
  private carriedBySticky(node: UiNode): boolean {
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      if (this.stickyShifted.has(current)) {
        return true;
      }
    }
    return false;
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
      // A full pass in progress has the previous pass's records here;
      // outside one the map is empty and this is a miss on nothing.
      rec = this.retiredRecords.get(node);
      if (rec === undefined) {
        rec = new LayoutRecord(node);
      } else {
        // Left where it is rather than deleted: the record is in the
        // live map from here on, so nothing looks for it here again,
        // and the whole map is dropped when the pass ends. Five
        // thousand deletes a pass is not a cost worth paying for
        // tidiness the caller cannot see.
        rec.reset();
      }
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

  /**
   * Folds the node's layout properties onto its record: sizes, minima
   * and maxima, padding, margins, positioning, the insets, and the
   * flags the walks read off the record rather than off the property
   * map.
   *
   * Ten places call this, because a node is measured by one container
   * and then placed by another and each wants the record current
   * before it reads it. On a list of five thousand nodes that came to
   * five full re-resolutions per node per pass, each one about thirty
   * property lookups with a length resolution on most of them, which
   * was a tenth of the time a full pass took and a good deal of the
   * garbage it made. So the result is memoized, but only for the
   * duration of one pass.
   *
   * Only for one pass, deliberately. A cache that outlived a pass
   * would have to be invalidated whenever any layout property changed,
   * and would be silently wrong the first time some path wrote a
   * property without marking the node layout-dirty. Within a pass the
   * question does not arise: nothing writes node properties while a
   * pass is running, so the second through fifth resolutions provably
   * produce exactly what the first one did, and the memo cannot be
   * stale because there is nothing to go stale against. The stamp is
   * thrown away between frames on purpose; it is not a bug that the
   * work is done again next frame.
   *
   * The percentage base is part of the key rather than assumed
   * constant, because it is not. The engine reassigns `percentBase` as
   * it descends, and on the benchmark list two fifths of the nodes
   * (the text inside each row's column) are first resolved while their
   * container's content width is still unknown and again once it is
   * known, against a base of `undefined` and then of a number. Those
   * must resolve twice or a percentage would keep the answer it got
   * when there was nothing to be a percentage of.
   *
   * `setLifted` is the one thing here that writes engine state rather
   * than record state, and skipping it on a repeat call is safe for
   * the same reason the rest is: `lift` cannot change mid-pass, so the
   * first call already put the node in or out of `liftedNodes` and a
   * later call would find `rec.lifted` equal and return.
   */
  private resolveLayoutProps(node: UiNode, rec: LayoutRecord): void {
    const props = node.properties;
    const base = this.percentBase;
    if (rec.propsPass === this.layoutPass && rec.propsBaseWidth === base.width && rec.propsBaseHeight === base.height) {
      return;
    }
    rec.propsPass = this.layoutPass;
    rec.propsBaseWidth = base.width;
    rec.propsBaseHeight = base.height;
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
    rec.paddingLeft = this.spacingProp(props, 'paddingLeft', 'paddingX');
    rec.paddingRight = this.spacingProp(props, 'paddingRight', 'paddingX');
    rec.paddingTop = this.spacingProp(props, 'paddingTop', 'paddingY');
    rec.paddingBottom = this.spacingProp(props, 'paddingBottom', 'paddingY');
    const marginLeft = this.marginProp(props, 'marginLeft', 'marginX');
    const marginRight = this.marginProp(props, 'marginRight', 'marginX');
    const marginTop = this.marginProp(props, 'marginTop', 'marginY');
    const marginBottom = this.marginProp(props, 'marginBottom', 'marginY');
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
    // An editable clips like a form control: its box is a window on the
    // text, which scrolls behind it (see `measureLeaf`). Without this a
    // field narrower than its line would paint the overflow across
    // whatever sits beside it.
    rec.clips = rec.scrollable || overflow === 'hidden' || node.type === UiNodeType.EditableText;
    const insetH = this.lengthProp(node, 'inset', base.width);
    const insetV = this.lengthProp(node, 'inset', base.height);
    rec.top = this.lengthProp(node, 'top', base.height) ?? insetV;
    rec.right = this.lengthProp(node, 'right', base.width) ?? insetH;
    rec.bottom = this.lengthProp(node, 'bottom', base.height) ?? insetV;
    rec.left = this.lengthProp(node, 'left', base.width) ?? insetH;
    rec.zIndex = this.numberProp(node, 'zIndex') ?? 0;
    this.setLifted(node, rec, node.properties.get('lift') === true);
    rec.liftBoundary = node.properties.get('liftBoundary') === true;
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
   *
   * `rec` is the node's record when its properties have just been
   * folded onto it against the same percentage base, and undefined
   * when they have not. It is only an optimisation: the four minimums
   * and maximums this needs are the four `resolveLayoutProps` has
   * already resolved from the same properties against the same base
   * (`minWidth` resolves through `lengthPropOrAuto`, whose `'auto'`
   * lands on the record as zero exactly as `?? 0` does here), so
   * passing the record turns six length resolutions per measured node
   * into two. A pass over the benchmark list did 173,018 of them and
   * 66,006 were these four.
   *
   * The one caller that passes undefined is `explain`, which reads a
   * record it did not resolve, under a percentage base it worked out
   * for itself; it asks the properties instead rather than trusting
   * that the two bases agree.
   */
  private effectiveConstraints(node: UiNode, constraints: Constraints, rec: LayoutRecord | undefined): Constraints {
    const base = this.percentBase;
    this.axisConstraints(
      constraints.minWidth,
      constraints.maxWidth,
      this.lengthProp(node, 'width', base.width),
      rec !== undefined ? rec.minWidth : (this.lengthProp(node, 'minWidth', base.width) ?? 0),
      rec !== undefined ? rec.maxWidth : (this.lengthProp(node, 'maxWidth', base.width) ?? Infinity)
    );
    const minWidth = this.axisMin;
    const maxWidth = this.axisMax;
    this.axisConstraints(
      constraints.minHeight,
      constraints.maxHeight,
      this.lengthProp(node, 'height', base.height),
      rec !== undefined ? rec.minHeight : (this.lengthProp(node, 'minHeight', base.height) ?? 0),
      rec !== undefined ? rec.maxHeight : (this.lengthProp(node, 'maxHeight', base.height) ?? Infinity)
    );
    return new Constraints(minWidth, maxWidth, this.axisMin, this.axisMax);
  }

  /**
   * The lower and upper bound `axisConstraints` last worked out.
   *
   * It returned them as a two-element tuple, which allocated an array
   * per axis per measured node, 22,002 of them in a pass over the
   * benchmark list. Two fields cannot be misread across a nested call
   * because there is no nested call: `axisConstraints` is arithmetic
   * over its arguments and reaches nothing that could measure anything,
   * so the only code that runs between writing these and reading them
   * is the read itself.
   */
  private axisMin = 0;
  private axisMax = 0;

  private axisConstraints(
    parentMin: number,
    parentMax: number,
    own: number | undefined,
    ownMin: number,
    ownMax: number
  ): void {
    const min = Math.max(0, ownMin);
    // Like CSS, a min bound wins over a conflicting max bound.
    const max = Math.max(min, ownMax);
    if (parentMin === parentMax) {
      // A stretched or flexed size is still clamped by the node's own
      // min/max, as CSS clamps a stretched cross size.
      const size = this.clamp(parentMin, min, max);
      this.axisMin = size;
      this.axisMax = size;
      return;
    }
    if (own !== undefined) {
      const size = this.clamp(own, min, max);
      this.axisMin = size;
      this.axisMax = size;
      return;
    }
    const lower = Math.max(parentMin, min);
    this.axisMin = lower;
    this.axisMax = Math.max(lower, Math.min(parentMax, max));
  }

  /**
   * Constraints for measuring a child of a stack or scroll container:
   * the container's available space with a zero minimum, so a tight
   * parent never forces a child to fill it. The child applies its own
   * size properties itself, in measure().
   */
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
      // Subtree bounds are a summary of these four numbers, so this is
      // the one place that can promise they are never stale: a box
      // written after a pass has ended, by an overlay following the
      // anchor it hangs off, invalidates them just as one written
      // inside the pass does.
      this.layoutVersion++;
      // Anything anchored to this node was placed against the box it
      // had a moment ago and has to be placed again. A box that did not
      // move asks nothing, and a tree with no anchored node at all does
      // not even look.
      if (this.anchorDependents.size > 0) {
        const dependents = this.anchorDependents.get(node);
        if (dependents !== undefined) {
          for (const dependent of dependents) {
            this.movedAnchored.add(dependent);
          }
        }
      }
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
   *
   * The two questions are asked inline here and in the two iterators
   * below rather than through named predicates, which read better. A
   * pass over the benchmark list asked the pair 80,002 times, 48,000
   * of them from these three loops, and the profile put the two at
   * 5.4% of the pass between them. The callback differs at every call
   * site, so nothing about this loop is inlined into anything, and a
   * predicate call per child per iterator is a real fraction of a walk
   * that does very little else. The absolute test had no caller
   * outside these loops and is gone; `isFragment` stayed, because
   * everywhere else it is asked once for a node rather than once per
   * sibling.
   */
  private forEachLayoutChild(node: UiNode, callback: (child: UiNode) => void): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (child.type === UiNodeType.Fragment) {
        this.forEachLayoutChild(child, callback);
      } else if (child.properties.get('position') !== 'absolute') {
        callback(child);
      }
    }
  }

  /** The absolutely positioned children, fragments expanded. */
  private forEachAbsoluteChild(node: UiNode, callback: (child: UiNode) => void): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (child.type === UiNodeType.Fragment) {
        this.forEachAbsoluteChild(child, callback);
      } else if (child.properties.get('position') === 'absolute') {
        callback(child);
      }
    }
  }

  /** Every child, in flow or not, fragments expanded, in tree order. */
  private forEachChild(node: UiNode, callback: (child: UiNode) => void): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (child.type === UiNodeType.Fragment) {
        this.forEachChild(child, callback);
      } else {
        callback(child);
      }
    }
  }

  private isFragment(node: UiNode): boolean {
    return node.type === UiNodeType.Fragment;
  }

  /**
   * Records whether a node is lifted, keeping the index in step.
   *
   * The set is the index and the record field is the answer to "is
   * this one lifted", because the renderers ask that of every node
   * they walk and a set lookup per node per frame is a cost the walk
   * does not need to pay.
   */
  private setLifted(node: UiNode, rec: LayoutRecord, lifted: boolean): void {
    if (rec.lifted === lifted) {
      return;
    }
    rec.lifted = lifted;
    if (lifted) {
      this.liftedNodes.add(node);
    } else {
      this.liftedNodes.delete(node);
    }
  }

  /**
   * The nodes painted in the top layer, in the order they were lifted.
   *
   * Hit testing tries them last-first, so the most recently lifted
   * wins a point two of them cover. Two lifted elements overlapping at
   * all is already unusual: this exists so a morph can escape a clip,
   * and one thing morphs at a time.
   */
  get lifted(): ReadonlySet<UiNode> {
    return this.liftedNodes;
  }

  private numberProp(node: UiNode, property: string): number | undefined {
    const value = node.properties.get(property);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  }

  /**
   * A length property in pixels; percentages resolve against `base`.
   *
   * The two cases answered here rather than in `resolveLength` are the
   * two a tree is almost entirely made of: a property nobody set, and
   * a plain number of pixels. A pass over the benchmark list asks this
   * 129,014 times and never once reaches a percentage or an `auto`,
   * because an application writes its sizes as numbers and only
   * reaches for a tagged length where it means one. So the call, its
   * default argument and its chain of type tests were most of what
   * every resolution cost. Anything that is not a finite number still
   * goes to `resolveLength`, which is where the rules and the errors
   * live.
   */
  private lengthProp(node: UiNode, property: string, base: number | undefined): number | undefined {
    const raw = node.properties.get(property);
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    const value = resolveLength(raw, base, property);
    return value === 'auto' ? undefined : value;
  }

  private lengthPropOrAuto(node: UiNode, property: string, base: number | undefined): number | undefined | 'auto' {
    const raw = node.properties.get(property);
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    return resolveLength(raw, base, property, true);
  }

  /** A margin side: the side's own value, else its axis, else the shorthand; may be auto. */
  private marginProp(props: ReadonlyMap<string, unknown>, side: string, axis: string): number | 'auto' {
    const value = props.get(side) ?? props.get(axis) ?? props.get('margin');
    if (value === undefined) {
      return 0;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return resolveLength(value, undefined, side, true) ?? 0;
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

  /**
   * A padding side: the side's own value, else its axis, else the
   * shorthand.
   *
   * Three steps rather than two since `paddingX` and `paddingY`
   * arrived. Most specific wins, as in CSS, so `padding={8}
   * paddingX={16} paddingLeft={0}` is 0 left, 16 right, 8 top and
   * bottom. `props.get` on a name nothing wrote costs a miss on a Map,
   * which is what the two-step version cost per side already.
   */
  private spacingProp(props: ReadonlyMap<string, unknown>, side: string, axis: string): number {
    const explicit = props.get(side);
    if (explicit !== undefined) {
      return this.toNumber(explicit) ?? 0;
    }
    const onAxis = props.get(axis);
    if (onAxis !== undefined) {
      return this.toNumber(onAxis) ?? 0;
    }
    const shorthand = props.get('padding');
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
