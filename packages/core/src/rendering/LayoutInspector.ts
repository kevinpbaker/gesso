import type { UiNode } from '../graph/UiNode';
import type { LayoutEngine } from '../layout/LayoutEngine';
import { formatExplanation, formatNumber, labelNode } from '../layout/LayoutExplanation';
import type { LayoutExplanation } from '../layout/LayoutExplanation';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { Canvas2DContext } from './canvas2d/Canvas2DContext';
import { drawOverlayShapes, type OverlayShape } from './OverlayShapes';

/** How long a measured node stays warm in the heatmap. */
export const INSPECTOR_HEAT_MS = 1500;
/** For this long after being measured a node is drawn hot; then warm until it expires. */
export const INSPECTOR_HOT_MS = 500;

const HEAT_HOT_FILL = 'rgba(229, 83, 75, 0.35)';
const HEAT_WARM_FILL = 'rgba(229, 83, 75, 0.14)';
const HEAT_HOT_STROKE = 'rgba(229, 83, 75, 0.9)';
const HEAT_WARM_STROKE = 'rgba(229, 83, 75, 0.45)';

const HOVER_STROKE = 'rgba(76, 141, 255, 0.95)';
const CONTENT_FILL = 'rgba(76, 141, 255, 0.18)';
const PADDING_FILL = 'rgba(46, 168, 138, 0.35)';
const MARGIN_FILL = 'rgba(217, 155, 58, 0.3)';
const RELAYOUT_STROKE = 'rgba(168, 85, 247, 0.9)';
const DECORATION_STROKE = 'rgba(46, 168, 138, 0.95)';
const LABEL_FILL = 'rgba(13, 17, 23, 0.92)';
const LABEL_TEXT = '#e6edf3';
const LABEL_FONT_SIZE = 10;
const LABEL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const LABEL_FONT = `${LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}`;
const LABEL_HEIGHT = 16;

/** The overlay for one frame: its shapes, and when the heatmap next changes. */
export interface InspectorOverlay {
  shapes: OverlayShape[];
  /** Milliseconds until a node cools or expires, or undefined when nothing is warm. */
  nextChange: number | undefined;
}

/**
 * The layout inspector (roadmap L8): what a developer sees when they
 * hover a node with inspection on.
 *
 * It keeps two things and paints them over a finished frame, on the
 * same context the scene was drawn to, so it works identically on the
 * main thread and inside a render worker:
 *
 *   - the hovered node's margin, border, padding and content boxes,
 *     with a label, and the outline of the relayout root a change to
 *     it would be laid out from;
 *   - a heatmap of the nodes the recent layout passes measured — hot
 *     for `INSPECTOR_HOT_MS`, warm until `INSPECTOR_HEAT_MS` — which is
 *     the frame-by-frame picture of what the budgets in
 *     `LayoutEngine.budget.spec` count. Leaves are filled; containers
 *     are only outlined, because a container's measure runs whenever
 *     anything inside it changes (a page's scroller is measured on
 *     every tick of an animated child) and filling it would tint the
 *     whole canvas and hide the leaves that actually changed.
 *
 * Heat changes in two steps rather than a continuous fade: a fade needs
 * a repaint every few tens of milliseconds while anything is warm, and
 * a repeatedly re-measured node then pulses as its alpha decays and
 * snaps back — over a large box that reads as flicker. With steps, a
 * repaint is needed only when some node's step is due, and `paint`
 * reports when that is.
 *
 * Enabling it turns on `LayoutEngine.trace`, which is what fills the
 * list of measured nodes; disabling it turns the trace back off so a
 * running app pays nothing for the inspector it is not using.
 *
 * The inspector reads records and never computes geometry: boxes come
 * from `visibleBox`, clipped by the scroll containers above the node,
 * so a heatmap row that scrolled out of its list is not drawn over the
 * content below it.
 */
export interface LayoutInspectorOptions {
  /**
   * The modifiers attached to a node, in list order, so the label can
   * name them.
   *
   * Supplied rather than read, because a node has no backpointer to
   * its modifiers: the set lives in the builder, keyed by node, and
   * `packages/core/src/rendering` must not depend on the builder to
   * paint a debugging label. The runtime passes
   * `node => builder.modifiersFor(node)?.names ?? []`; a caller that
   * does not pass it gets an inspector that says nothing about
   * modifiers, which is what it said before B5.
   */
  readonly modifierNames?: (node: UiNode) => readonly string[];
}

export class LayoutInspector {
  private enabled = false;
  private hovered: UiNode | null = null;
  /**
   * A node picked from outside the canvas — a devtools panel's tree —
   * and outlined here so a person can find it on the screen.
   *
   * Separate from `hovered` and from `enabled`: the panel points at a
   * node without the pointer being anywhere near it, and without the
   * heatmap and the measure trace that the toggle turns on.
   */
  private highlighted: UiNode | null = null;
  /** When each node was last measured, for the heatmap. */
  private readonly heat = new Map<UiNode, number>();

  constructor(
    private readonly engine: LayoutEngine,
    private readonly options: LayoutInspectorOptions = {}
  ) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  get hoveredNode(): UiNode | null {
    return this.hovered;
  }

  get highlightedNode(): UiNode | null {
    return this.highlighted;
  }

  /** Whether `overlay` would draw anything: the toggle is on, or a node is highlighted. */
  get hasOverlay(): boolean {
    return this.enabled || this.highlighted !== null;
  }

  /** Turns the inspector, and the engine's measure trace, on or off. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.engine.trace = enabled;
    if (!enabled) {
      this.heat.clear();
      this.hovered = null;
    }
  }

  /** Sets the node under the pointer. Returns true when it changed. */
  setHovered(node: UiNode | null): boolean {
    if (node === this.hovered) {
      return false;
    }
    this.hovered = node;
    return true;
  }

  /** Sets the node a panel is pointing at. Returns true when it changed. */
  setHighlighted(node: UiNode | null): boolean {
    if (node === this.highlighted) {
      return false;
    }
    this.highlighted = node;
    return true;
  }

  /**
   * Records the nodes the layout pass that just ran measured. Call once
   * after each layout, with the frame's time.
   */
  recordLayout(now: number): void {
    if (!this.enabled) {
      return;
    }
    for (const node of this.engine.stats.measuredNodes) {
      this.heat.set(node, now);
    }
  }

  /** Nodes currently warm in the heatmap. */
  get heatCount(): number {
    return this.heat.size;
  }

  /** The hovered node's explanation, or null with nothing hovered. */
  explainHovered(): LayoutExplanation | null {
    return this.hovered === null ? null : this.engine.explain(this.hovered);
  }

  /** The hovered node's explanation as text, or null with nothing hovered. */
  explainHoveredText(): string | null {
    const explanation = this.explainHovered();
    return explanation === null ? null : formatExplanation(explanation);
  }

  /**
   * The overlay for a finished frame, as shapes either renderer draws
   * after the scene. Returns them with how many milliseconds until the
   * heatmap next changes (a node cooling from hot to warm, or
   * expiring), or undefined when nothing is warm.
   */
  overlay(now: number): InspectorOverlay {
    const shapes: OverlayShape[] = [];
    if (!this.hasOverlay) {
      return { shapes, nextChange: undefined };
    }
    const nextChange = this.enabled ? this.heatShapes(shapes, now) : undefined;
    // The highlighted node is drawn exactly as a hovered one is: the
    // box model is what a person picking a node from a tree wants to
    // see, and a second vocabulary for the same boxes would be one more
    // thing to learn. Once when they coincide.
    if (this.highlighted !== null) {
      this.hoveredShapes(shapes, this.highlighted);
    }
    if (this.enabled && this.hovered !== null && this.hovered !== this.highlighted) {
      this.hoveredShapes(shapes, this.hovered);
    }
    return { shapes, nextChange };
  }

  /**
   * Paints the overlay onto a 2D context left in logical pixels, as the
   * Canvas2D renderer leaves it. Returns what `overlay` reports as the
   * next change.
   */
  paint(ctx: Canvas2DContext, now: number): number | undefined {
    const { shapes, nextChange } = this.overlay(now);
    drawOverlayShapes(ctx, shapes);
    return nextChange;
  }

  private heatShapes(out: OverlayShape[], now: number): number | undefined {
    let nextChange: number | undefined;
    for (const [node, at] of this.heat) {
      const age = now - at;
      if (age >= INSPECTOR_HEAT_MS) {
        this.heat.delete(node);
        continue;
      }
      const hot = age < INSPECTOR_HOT_MS;
      const due = (hot ? INSPECTOR_HOT_MS : INSPECTOR_HEAT_MS) - age;
      nextChange = nextChange === undefined ? due : Math.min(nextChange, due);
      const box = this.clippedVisibleBox(node);
      if (box === null) {
        continue;
      }
      if (!node.hasChildren()) {
        out.push({ kind: 'fill', ...box, color: hot ? HEAT_HOT_FILL : HEAT_WARM_FILL });
      }
      out.push({ kind: 'stroke', ...box, color: hot ? HEAT_HOT_STROKE : HEAT_WARM_STROKE, lineWidth: 1 });
    }
    return nextChange;
  }

  private hoveredShapes(out: OverlayShape[], node: UiNode): void {
    const rec = this.engine.recordFor(node);
    if (rec === undefined) {
      return;
    }
    const explanation = this.engine.explain(node);
    const relayoutRoot = explanation.relayout.root;
    if (relayoutRoot !== node) {
      const rootBox = this.clippedVisibleBox(relayoutRoot);
      if (rootBox !== null) {
        out.push({ kind: 'stroke', ...rootBox, color: RELAYOUT_STROKE, lineWidth: 2 });
      }
    }

    const box = this.engine.visibleBox(node);
    const strip = (x: number, y: number, width: number, height: number, color: string): void => {
      if (width > 0 && height > 0) {
        out.push({ kind: 'fill', x, y, width, height, color });
      }
    };
    // Margin strips around the border box.
    const marginWidth = box.width + rec.marginLeft + rec.marginRight;
    strip(box.x - rec.marginLeft, box.y - rec.marginTop, marginWidth, rec.marginTop, MARGIN_FILL);
    strip(box.x - rec.marginLeft, box.y + box.height, marginWidth, rec.marginBottom, MARGIN_FILL);
    strip(box.x - rec.marginLeft, box.y, rec.marginLeft, box.height, MARGIN_FILL);
    strip(box.x + box.width, box.y, rec.marginRight, box.height, MARGIN_FILL);
    // Padding strips inside it.
    const innerHeight = box.height - rec.paddingTop - rec.paddingBottom;
    strip(box.x, box.y, box.width, rec.paddingTop, PADDING_FILL);
    strip(box.x, box.y + box.height - rec.paddingBottom, box.width, rec.paddingBottom, PADDING_FILL);
    strip(box.x, box.y + rec.paddingTop, rec.paddingLeft, innerHeight, PADDING_FILL);
    strip(box.x + box.width - rec.paddingRight, box.y + rec.paddingTop, rec.paddingRight, innerHeight, PADDING_FILL);
    // Content box.
    strip(
      box.x + rec.paddingLeft,
      box.y + rec.paddingTop,
      box.width - rec.paddingLeft - rec.paddingRight,
      innerHeight,
      CONTENT_FILL
    );
    // Border box outline, drawn even for a zero-sized node so it can be found.
    out.push({ kind: 'stroke', ...box, color: HOVER_STROKE, lineWidth: 1 });
    // Decorations in their own colour, because the whole point of one
    // is that it is not the box: a focus ring sits outside the border
    // box and would otherwise read as the node being bigger than it is.
    for (const shape of node.decorations ?? []) {
      const outset = shape.outset ?? 0;
      out.push({
        kind: 'stroke',
        x: box.x + (shape.x ?? 0) - outset,
        y: box.y + (shape.y ?? 0) - outset,
        width: (shape.width ?? box.width) + outset * 2,
        height: (shape.height ?? box.height) + outset * 2,
        color: DECORATION_STROKE,
        lineWidth: 1
      });
    }

    const modifiers = this.options.modifierNames?.(node) ?? [];
    out.push({
      kind: 'label',
      box,
      text: `${labelNode(node)} ${formatNumber(box.width)}×${formatNumber(box.height)}${
        modifiers.length === 0 ? '' : ` · ${modifiers.join(', ')}`
      }`,
      font: LABEL_FONT,
      fontSize: LABEL_FONT_SIZE,
      fontFamily: LABEL_FONT_FAMILY,
      textColor: LABEL_TEXT,
      background: LABEL_FILL,
      height: LABEL_HEIGHT
    });
  }

  /**
   * Where a node is seen, intersected with every clipping ancestor's
   * visible box; null when nothing of it is visible.
   */
  private clippedVisibleBox(node: UiNode): LayoutBox | null {
    const box = this.engine.visibleBox(node);
    let x = box.x;
    let y = box.y;
    let right = box.x + box.width;
    let bottom = box.y + box.height;
    let clipped = false;
    for (let current = node.parent; current !== null; current = current.parent) {
      const rec = this.engine.recordFor(current);
      if (rec === undefined || !rec.clips) {
        continue;
      }
      const clip = this.engine.visibleBox(current);
      x = Math.max(x, clip.x);
      y = Math.max(y, clip.y);
      right = Math.min(right, clip.x + clip.width);
      bottom = Math.min(bottom, clip.y + clip.height);
      clipped = true;
      if (right <= x || bottom <= y) {
        return null;
      }
    }
    // An unclipped box is returned as is, so its sizes are the record's
    // exactly rather than a sum and a difference of them.
    return clipped ? { x, y, width: right - x, height: bottom - y } : box;
  }
}
