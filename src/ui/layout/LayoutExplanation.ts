import type { UiNode } from '../graph/UiNode';
import type { Constraints, LayoutBox, Size } from './LayoutTypes';
import { isAutoLength, isPercentLength } from './UiLength';

/**
 * Why a node has the size it has. Produced by `LayoutEngine.explain`.
 *
 * Everything here is read from the layout record and the node's
 * properties after the fact; nothing is computed that layout did not
 * already compute. The per-axis `reasons` are sentences a developer
 * can read in order, and `decidedBy` is the one rule that fixed the
 * measured size, so a tool can colour or group by it.
 */
export interface LayoutExplanation {
  readonly node: UiNode;
  /** False when the node has never been laid out; the axes are then empty. */
  readonly laidOut: boolean;
  /** Why there is no record, when `laidOut` is false. */
  readonly notLaidOutReason?: string;
  /** The node whose measure handed this node its constraints; null for the layout root. */
  readonly parent: UiNode | null;
  /** Border box in layout-root coordinates, before scrolling. */
  readonly box: LayoutBox;
  /** What the content asked for on each axis, before any clamp. */
  readonly content: Size;
  /** The size the node reported to its parent. */
  readonly measured: Size;
  /** Constraints the parent handed down on the last measurement. */
  readonly constraints: Constraints;
  /** Those constraints after the node's own width/height/min/max. */
  readonly effective: Constraints;
  readonly padding: Edges;
  readonly margin: Edges;
  readonly width: AxisExplanation;
  readonly height: AxisExplanation;
  readonly relayout: RelayoutExplanation;
  readonly state: LayoutStateExplanation;
  /** Scroll container facts, when the node is one. */
  readonly scroll?: { scrollX: number; scrollY: number; contentWidth: number; contentHeight: number };
}

export interface Edges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * The single rule that fixed a node's measured size on one axis.
 *
 *  - `viewport`: the layout root filling bounded constraints
 *  - `explicit`: the node's own `width`/`height`
 *  - `flex`: flexed by a Row or Column (grew, shrank, or held at a clamp)
 *  - `stretch`: stretched across a container's cross axis or a grid area
 *  - `inset`: an absolute node with both edges set
 *  - `parent`: a tight size from the parent for another reason
 *  - `content`: what the content needed
 *  - `min` / `max`: content, then raised or capped by a minimum or maximum
 *  - `aspect-ratio`: derived from the other axis
 */
export type SizeDecision =
  | 'viewport'
  | 'explicit'
  | 'flex'
  | 'stretch'
  | 'inset'
  | 'parent'
  | 'content'
  | 'min'
  | 'max'
  | 'aspect-ratio';

export interface AxisExplanation {
  readonly axis: 'width' | 'height';
  readonly content: number;
  readonly measured: number;
  /** The final box size; differs from `measured` only when placement overrode it. */
  readonly final: number;
  readonly decidedBy: SizeDecision;
  /** Sentences, in the order the rules applied. */
  readonly reasons: readonly string[];
}

export interface RelayoutExplanation {
  /** A change inside this node cannot change its parent's layout. */
  readonly boundary: boolean;
  /** Something outside reads a content-derived size of this node. */
  readonly contentMatters: boolean;
  /**
   * Where a change to this node's layout properties is laid out from:
   * the nearest ancestor that is a relayout boundary, else the layout
   * root. The node itself only when it is the layout root.
   */
  readonly root: UiNode;
  readonly rootIsLayoutRoot: boolean;
  /** How many ancestors the dirty walk climbs to reach `root`. */
  readonly depth: number;
}

export interface LayoutStateExplanation {
  readonly measureDirty: boolean;
  readonly placeDirty: boolean;
  /** Whether the last layout pass measured this node; undefined when the engine is not tracing. */
  readonly measuredLastPass: boolean | undefined;
  readonly position: 'static' | 'relative' | 'absolute' | 'sticky';
  readonly clips: boolean;
}

/**
 * How one axis was sized, gathered by the engine from the record, the
 * node's properties and the parent's type. `buildAxisExplanation`
 * turns these into sentences.
 */
export interface AxisFacts {
  readonly axis: 'width' | 'height';
  readonly isRoot: boolean;
  readonly parentLabel: string;
  /** Constraints the parent handed down. */
  readonly parentMin: number;
  readonly parentMax: number;
  /** Constraints after the node's own size properties. */
  readonly effectiveMin: number;
  readonly effectiveMax: number;
  /** The node's own `width`/`height`, resolved, and as written. */
  readonly explicit: number | undefined;
  readonly explicitRaw: unknown;
  /** The node's own minimum/maximum, resolved; undefined when unset. */
  readonly ownMin: number | undefined;
  readonly ownMax: number | undefined;
  readonly content: number;
  readonly measured: number;
  readonly final: number;
  /** The content's minimum on this axis (min-content width, intrinsic height). */
  readonly contentMin: number;
  readonly padding: number;
  readonly aspectRatio: number | undefined;
  /** Set when a Row/Column flexed the node along this axis. */
  readonly flex?: FlexFacts;
  /** The parent made the axis tight to stretch the node across it. */
  readonly stretched: boolean;
  /** An absolute node with both edges set along this axis. */
  readonly inset: boolean;
  /** A grid item filling its area along this axis. */
  readonly gridArea: boolean;
  /** Content that clips (a scroll container, ellipsised or clamped text) has no automatic minimum. */
  readonly clipsContent: boolean;
  readonly isText: boolean;
  readonly childCount: number;
}

export interface FlexFacts {
  readonly base: number;
  readonly min: number;
  readonly max: number;
  readonly minAuto: boolean;
  readonly grow: number;
  readonly shrink: number;
  readonly basis: number | undefined;
  readonly containerLabel: string;
  /** A ScrollView lays its children out as a column/row but never flexes them. */
  readonly scroller: boolean;
}

const EPSILON = 1e-6;

/**
 * Turns the facts about one axis into the rule that decided it and the
 * sentences that say so.
 */
export function buildAxisExplanation(f: AxisFacts): AxisExplanation {
  const reasons: string[] = [];
  let decidedBy: SizeDecision = 'content';
  const px = (value: number): string => formatNumber(value);
  const minProp = f.axis === 'width' ? 'minWidth' : 'minHeight';
  const maxProp = f.axis === 'width' ? 'maxWidth' : 'maxHeight';
  const parentTight = f.parentMin === f.parentMax && isFinite(f.parentMax);

  if (f.isRoot) {
    if (f.explicit !== undefined) {
      decidedBy = 'explicit';
      reasons.push(`${f.axis}: ${describeLength(f.explicitRaw)} (explicit) → ${px(f.explicit)}`);
    } else if (isFinite(f.parentMax)) {
      decidedBy = 'viewport';
      reasons.push(`the layout root fills its viewport: ${px(f.parentMax)}`);
    } else {
      reasons.push(`the layout root is unbounded here and takes its content ${f.axis}: ${px(f.content)}`);
    }
  } else if (parentTight) {
    if (f.flex !== undefined && !f.flex.scroller) {
      decidedBy = flexReasons(f, f.flex, reasons);
    } else if (f.inset) {
      decidedBy = 'inset';
      const edges = f.axis === 'width' ? 'left and right' : 'top and bottom';
      reasons.push(`both ${edges} are set, so the containing block decides the ${f.axis}: ${px(f.parentMin)}`);
    } else if (f.gridArea) {
      decidedBy = 'stretch';
      reasons.push(`stretched across its grid area: ${px(f.parentMin)}`);
    } else if (f.stretched) {
      decidedBy = 'stretch';
      reasons.push(`stretched across ${f.parentLabel}: ${px(f.parentMin)}`);
    } else {
      decidedBy = 'parent';
      reasons.push(`${f.parentLabel} fixed the ${f.axis} at ${px(f.parentMin)}`);
    }
    if (f.effectiveMin !== f.parentMin) {
      const clamp = f.effectiveMin > f.parentMin ? minProp : maxProp;
      const to = f.effectiveMin > f.parentMin ? f.ownMin : f.ownMax;
      reasons.push(`clamped by its own ${clamp} ${px(to ?? f.effectiveMin)} → ${px(f.effectiveMin)}`);
    }
    if (f.content > f.effectiveMin + EPSILON) {
      reasons.push(
        `its content would need ${px(f.content)}; the extra ${px(f.content - f.effectiveMin)} ${
          f.clipsContent ? 'is clipped' : 'overflows'
        }`
      );
    }
  } else if (f.explicit !== undefined) {
    decidedBy = 'explicit';
    reasons.push(`${f.axis}: ${describeLength(f.explicitRaw)} (explicit) → ${px(f.explicit)}`);
    if (f.flex !== undefined && !f.flex.scroller) {
      reasons.push(unflexedReason(f.flex));
    }
    if (f.effectiveMin !== f.explicit) {
      const clamp = f.effectiveMin > f.explicit ? minProp : maxProp;
      const to = f.effectiveMin > f.explicit ? f.ownMin : f.ownMax;
      reasons.push(`clamped by ${clamp} ${px(to ?? f.effectiveMin)} → ${px(f.effectiveMin)}`);
    }
    if (isFinite(f.parentMax) && f.effectiveMin > f.parentMax + EPSILON) {
      reasons.push(`wider than the ${px(f.parentMax)} available: it overflows ${f.parentLabel}`);
    }
  } else {
    reasons.push(contentReason(f));
    if (f.flex !== undefined && !f.flex.scroller) {
      reasons.push(unflexedReason(f.flex));
    }
    if (f.aspectRatio !== undefined && Math.abs(f.content - f.measured) > EPSILON) {
      decidedBy = 'aspect-ratio';
      reasons.push(`aspectRatio ${formatNumber(f.aspectRatio)} derives it from the other axis → ${px(f.measured)}`);
    }
    if (f.content < f.effectiveMin - EPSILON) {
      if (f.ownMin !== undefined && f.ownMin >= f.effectiveMin - EPSILON) {
        decidedBy = 'min';
        reasons.push(`raised to ${minProp} ${px(f.ownMin)}`);
      } else {
        decidedBy = 'min';
        reasons.push(`raised to the minimum ${f.parentLabel} asked for: ${px(f.parentMin)}`);
      }
    } else if (f.ownMax !== undefined && f.content > f.ownMax + EPSILON && f.measured <= f.ownMax + EPSILON) {
      decidedBy = 'max';
      reasons.push(`capped by ${maxProp} ${px(f.ownMax)}`);
    }
    if (isFinite(f.parentMax) && f.measured > f.parentMax + EPSILON) {
      reasons.push(
        `the ${px(f.parentMax)} available was only a bound, not a size: the extra ${px(f.measured - f.parentMax)} ${
          f.clipsContent ? 'is clipped' : 'overflows'
        } ${f.parentLabel}`
      );
    }
  }

  if (Math.abs(f.final - f.measured) > EPSILON) {
    reasons.push(`placed at ${px(f.final)} by ${f.parentLabel} (measured ${px(f.measured)})`);
  }

  return {
    axis: f.axis,
    content: f.content,
    measured: f.measured,
    final: f.final,
    decidedBy,
    reasons
  };
}

/**
 * A flex item whose main axis the container made tight. Appends the
 * sentences and returns the rule: `flex` when the item grew or shrank,
 * otherwise whatever gave it the base size it kept.
 */
function flexReasons(f: AxisFacts, flex: FlexFacts, reasons: string[]): SizeDecision {
  const px = formatNumber;
  const final = f.parentMin;
  const grew = final > flex.base + EPSILON;
  const shrank = final < flex.base - EPSILON;
  if (!grew && !shrank) {
    if (f.explicit !== undefined) {
      reasons.push(`${f.axis}: ${describeLength(f.explicitRaw)} (explicit) → ${px(f.explicit)}`);
      reasons.push(unflexedReason(flex));
      return 'explicit';
    }
    if (flex.basis !== undefined) {
      reasons.push(`flexBasis ${px(flex.basis)} → ${px(flex.base)}`);
      reasons.push(unflexedReason(flex));
      return 'flex';
    }
    reasons.push(`its max-content ${f.axis} is ${px(flex.base)}`);
    reasons.push(unflexedReason(flex));
    return 'content';
  }
  const baseSource =
    f.explicit !== undefined
      ? `${f.axis}: ${describeLength(f.explicitRaw)}`
      : flex.basis !== undefined
        ? `flexBasis ${px(flex.basis)}`
        : `its max-content ${f.axis}`;
  reasons.push(`flex item of ${flex.containerLabel}: base ${px(flex.base)} from ${baseSource}`);
  if (grew) {
    reasons.push(`grew to ${px(final)} (flexGrow ${px(flex.grow)} takes a share of the free space)`);
    if (Math.abs(final - flex.max) < EPSILON && isFinite(flex.max)) {
      reasons.push(`stopped at ${f.axis === 'width' ? 'maxWidth' : 'maxHeight'} ${px(flex.max)}`);
    }
  } else {
    reasons.push(
      `shrank to ${px(final)} (flexShrink ${px(flex.shrink)}: the items' base sizes exceed the content box of ${
        flex.containerLabel
      }, so they give up space)`
    );
    if (Math.abs(final - flex.min) < EPSILON) {
      reasons.push(minimumReason(f, flex));
    }
  }
  return 'flex';
}

/** A flex item whose main axis stayed loose: the container never resized it. */
function unflexedReason(flex: FlexFacts): string {
  const note = flex.grow === 0 ? ' (flexGrow 0, so free space goes to others)' : ' (no free space to take)';
  return `flex item of ${flex.containerLabel}: kept its base ${formatNumber(flex.base)}${note}`;
}

/**
 * Why a shrinking item stopped where it did (CSS `min-width: auto`).
 */
function minimumReason(f: AxisFacts, flex: FlexFacts): string {
  const px = formatNumber;
  const minProp = f.axis === 'width' ? 'minWidth' : 'minHeight';
  if (!flex.minAuto) {
    return `stopped at ${minProp} ${px(flex.min)}`;
  }
  if (flex.min === 0 && f.clipsContent) {
    return `its automatic minimum is 0: a scroll container or clipped text has none, so it may shrink to nothing`;
  }
  if (flex.min === 0 && f.contentMin === 0) {
    return `its automatic minimum is 0: the content has no minimum ${f.axis}`;
  }
  if (f.explicit !== undefined && Math.abs(flex.min - f.explicit) < EPSILON) {
    return `stopped at its automatic minimum ${px(flex.min)}, its explicit ${f.axis} (set ${minProp}: 0 to allow smaller)`;
  }
  return `stopped at its automatic minimum ${px(flex.min)} (the content's min-content ${f.axis}; set ${minProp}: 0 to allow smaller)`;
}

function contentReason(f: AxisFacts): string {
  const px = formatNumber;
  const inner = Math.max(0, f.content - f.padding);
  const paddingNote = f.padding > 0 ? ` + padding ${px(f.padding)}` : '';
  if (f.isText) {
    return `text needs ${px(inner)}${paddingNote} → ${px(f.content)}`;
  }
  if (f.childCount === 0) {
    return f.content === 0 ? `no content and no ${f.axis}: 0` : `no children${paddingNote} → ${px(f.content)}`;
  }
  return `${f.childCount} child${f.childCount === 1 ? '' : 'ren'} need ${px(inner)}${paddingNote} → ${px(f.content)}`;
}

/** A length as written: a number, `50%`, `auto`, or its JSON. */
export function describeLength(raw: unknown): string {
  if (typeof raw === 'number') {
    return formatNumber(raw);
  }
  if (isPercentLength(raw)) {
    return `${formatNumber(raw.value)}%`;
  }
  if (isAutoLength(raw)) {
    return 'auto';
  }
  if (raw === undefined) {
    return 'unset';
  }
  return JSON.stringify(raw);
}

export function formatNumber(value: number): string {
  if (!isFinite(value)) {
    return value > 0 ? '∞' : '-∞';
  }
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function formatConstraints(constraints: Constraints): string {
  return `width ${formatRange(constraints.minWidth, constraints.maxWidth)} · height ${formatRange(
    constraints.minHeight,
    constraints.maxHeight
  )}`;
}

function formatRange(min: number, max: number): string {
  if (min === max) {
    return `${formatNumber(min)} (tight)`;
  }
  return `[${formatNumber(min)}, ${formatNumber(max)}${isFinite(max) ? ']' : ')'}`;
}

function formatEdges(edges: Edges): string {
  if (edges.top === edges.right && edges.right === edges.bottom && edges.bottom === edges.left) {
    return formatNumber(edges.top);
  }
  return [edges.top, edges.right, edges.bottom, edges.left].map(formatNumber).join(' ');
}

/** A node named the way the explanation names every node: type and id. */
export function labelNode(node: UiNode): string {
  return `${node.type} '${node.id}'`;
}

/**
 * The explanation as text, one fact per line, for a console, a test
 * failure message or the playground's inspector panel.
 */
export function formatExplanation(explanation: LayoutExplanation): string {
  const { node } = explanation;
  if (!explanation.laidOut) {
    return `${labelNode(node)} has no layout: ${explanation.notLaidOutReason ?? 'it has not been measured'}.`;
  }
  const { box, width, height, relayout, state } = explanation;
  const lines: string[] = [];
  lines.push(
    `${labelNode(node)} — ${formatNumber(box.width)} × ${formatNumber(box.height)} at (${formatNumber(
      box.x
    )}, ${formatNumber(box.y)})`
  );
  lines.push(`width  ${formatNumber(width.final).padEnd(7)} ${width.reasons.join('; ')}`);
  lines.push(`height ${formatNumber(height.final).padEnd(7)} ${height.reasons.join('; ')}`);
  const from = explanation.parent === null ? 'the viewport' : labelNode(explanation.parent);
  lines.push(`constraints from ${from}: ${formatConstraints(explanation.constraints)}`);
  if (
    explanation.effective.minWidth !== explanation.constraints.minWidth ||
    explanation.effective.maxWidth !== explanation.constraints.maxWidth ||
    explanation.effective.minHeight !== explanation.constraints.minHeight ||
    explanation.effective.maxHeight !== explanation.constraints.maxHeight
  ) {
    lines.push(`after own size props: ${formatConstraints(explanation.effective)}`);
  }
  const contentWidth = Math.max(0, box.width - explanation.padding.left - explanation.padding.right);
  const contentHeight = Math.max(0, box.height - explanation.padding.top - explanation.padding.bottom);
  lines.push(
    `padding ${formatEdges(explanation.padding)} · margin ${formatEdges(explanation.margin)} · content box ${formatNumber(
      contentWidth
    )} × ${formatNumber(contentHeight)}`
  );
  if (explanation.scroll !== undefined) {
    const s = explanation.scroll;
    lines.push(
      `scroll (${formatNumber(s.scrollX)}, ${formatNumber(s.scrollY)}) of content ${formatNumber(
        s.contentWidth
      )} × ${formatNumber(s.contentHeight)}`
    );
  }
  const rootLabel =
    relayout.root === node
      ? 'itself (it is the layout root)'
      : `${relayout.rootIsLayoutRoot ? 'the layout root ' : ''}${labelNode(relayout.root)} (${
          relayout.depth
        } level${relayout.depth === 1 ? '' : 's'} up)`;
  lines.push(
    `relayout: ${relayout.boundary ? 'boundary' : 'not a boundary'} · content ${
      relayout.contentMatters ? 'matters to the parent' : 'stays inside'
    } · a change here is laid out from ${rootLabel}`
  );
  const measuredNote =
    state.measuredLastPass === undefined
      ? ''
      : state.measuredLastPass
        ? ' · measured in the last pass'
        : ' · not measured in the last pass';
  lines.push(
    `state: ${state.measureDirty ? 'measure dirty' : 'measured'} · ${
      state.placeDirty ? 'place dirty' : 'placed'
    } · position ${state.position}${state.clips ? ' · clips' : ''}${measuredNote}`
  );
  return lines.join('\n');
}
