import type { UiNode } from '../graph/UiNode';
import type { LayoutEngine } from '../layout/LayoutEngine';
import { formatExplanation, formatNumber, labelNode } from '../layout/LayoutExplanation';
import type { LayoutExplanation } from '../layout/LayoutExplanation';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { Canvas2DContext } from './canvas2d/Canvas2DContext';

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
const LABEL_FILL = 'rgba(13, 17, 23, 0.92)';
const LABEL_TEXT = '#e6edf3';
const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
const LABEL_HEIGHT = 16;

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
export class LayoutInspector {
  private enabled = false;
  private hovered: UiNode | null = null;
  /** When each node was last measured, for the heatmap. */
  private readonly heat = new Map<UiNode, number>();

  constructor(private readonly engine: LayoutEngine) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  get hoveredNode(): UiNode | null {
    return this.hovered;
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
   * Paints the overlay over a finished frame. The context is expected
   * in logical pixels, as the renderer leaves it. Returns how many
   * milliseconds until the heatmap next changes (a node cooling from
   * hot to warm, or expiring), or undefined when nothing is warm.
   */
  paint(ctx: Canvas2DContext, now: number): number | undefined {
    if (!this.enabled) {
      return undefined;
    }
    const nextChange = this.paintHeat(ctx, now);
    if (this.hovered !== null) {
      this.paintHovered(ctx, this.hovered);
    }
    return nextChange;
  }

  private paintHeat(ctx: Canvas2DContext, now: number): number | undefined {
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
        ctx.fillStyle = hot ? HEAT_HOT_FILL : HEAT_WARM_FILL;
        ctx.fillRect(box.x, box.y, box.width, box.height);
      }
      ctx.strokeStyle = hot ? HEAT_HOT_STROKE : HEAT_WARM_STROKE;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.width - 1), Math.max(0, box.height - 1));
    }
    return nextChange;
  }

  private paintHovered(ctx: Canvas2DContext, node: UiNode): void {
    const rec = this.engine.recordFor(node);
    if (rec === undefined) {
      return;
    }
    const explanation = this.engine.explain(node);
    const relayoutRoot = explanation.relayout.root;
    if (relayoutRoot !== node) {
      const rootBox = this.clippedVisibleBox(relayoutRoot);
      if (rootBox !== null) {
        ctx.strokeStyle = RELAYOUT_STROKE;
        ctx.lineWidth = 2;
        ctx.strokeRect(rootBox.x + 1, rootBox.y + 1, Math.max(0, rootBox.width - 2), Math.max(0, rootBox.height - 2));
      }
    }

    const box = this.engine.visibleBox(node);
    // Margin strips around the border box.
    ctx.fillStyle = MARGIN_FILL;
    strip(
      ctx,
      box.x - rec.marginLeft,
      box.y - rec.marginTop,
      box.width + rec.marginLeft + rec.marginRight,
      rec.marginTop
    );
    strip(
      ctx,
      box.x - rec.marginLeft,
      box.y + box.height,
      box.width + rec.marginLeft + rec.marginRight,
      rec.marginBottom
    );
    strip(ctx, box.x - rec.marginLeft, box.y, rec.marginLeft, box.height);
    strip(ctx, box.x + box.width, box.y, rec.marginRight, box.height);
    // Padding strips inside it.
    ctx.fillStyle = PADDING_FILL;
    strip(ctx, box.x, box.y, box.width, rec.paddingTop);
    strip(ctx, box.x, box.y + box.height - rec.paddingBottom, box.width, rec.paddingBottom);
    strip(ctx, box.x, box.y + rec.paddingTop, rec.paddingLeft, box.height - rec.paddingTop - rec.paddingBottom);
    strip(
      ctx,
      box.x + box.width - rec.paddingRight,
      box.y + rec.paddingTop,
      rec.paddingRight,
      box.height - rec.paddingTop - rec.paddingBottom
    );
    // Content box.
    ctx.fillStyle = CONTENT_FILL;
    strip(
      ctx,
      box.x + rec.paddingLeft,
      box.y + rec.paddingTop,
      box.width - rec.paddingLeft - rec.paddingRight,
      box.height - rec.paddingTop - rec.paddingBottom
    );
    // Border box outline, drawn even for a zero-sized node so it can be found.
    ctx.strokeStyle = HOVER_STROKE;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.width - 1), Math.max(0, box.height - 1));

    this.paintLabel(ctx, box, `${labelNode(node)} ${formatNumber(box.width)}×${formatNumber(box.height)}`);
  }

  private paintLabel(ctx: Canvas2DContext, box: LayoutBox, text: string): void {
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const width = ctx.measureText(text).width + 8;
    // Above the box when there is room, else just inside its top edge.
    const y = box.y >= LABEL_HEIGHT ? box.y - LABEL_HEIGHT : box.y;
    const x = Math.max(0, box.x);
    ctx.fillStyle = LABEL_FILL;
    ctx.fillRect(x, y, width, LABEL_HEIGHT);
    ctx.fillStyle = LABEL_TEXT;
    ctx.fillText(text, x + 4, y + 12);
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

function strip(ctx: Canvas2DContext, x: number, y: number, width: number, height: number): void {
  if (width > 0 && height > 0) {
    ctx.fillRect(x, y, width, height);
  }
}
