import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { Canvas2DContext } from './Canvas2DContext';
import type { CanvasSurface } from './CanvasSurface';
import { computeObjectFitRect, createPaintState, resolvePaintState } from './PaintState';
import type { PaintState } from './PaintState';
import type { RenderContext } from './RenderContext';
import { drawText } from './TextRenderer';
import type { UiRenderer } from './UiRenderer';

export interface Canvas2DRendererOptions {
  /**
   * The canvas surface this renderer draws into.
   *
   * Owns the backing store, device pixel ratio and resize; the
   * renderer only reads it per frame. Passed at construction so the
   * renderer can be swapped (e.g. for a WebGPU surface) without the
   * runtime knowing.
   */
  surface: CanvasSurface;
}

/**
 * Canvas2D rendering backend.
 *
 * Consumes the retained UiNode tree plus LayoutRecords produced by
 * the layout engine and turns them into canvas operations. It owns
 * none of: composition, bindings, layout, scheduling, or dirty
 * state - those live upstream and are the only reason a frame runs.
 *
 * Painting per node (in order):
 *
 *   1. background fill   (backgroundColor, rounded rect when radius > 0)
 *   2. background image  (image + objectFit)
 *   3. border            (borderWidth/borderColor)
 *   4. children          (tree order)
 *   5. foreground text   (text + text style)
 *
 * All geometry is absolute layout-root coordinates. Scroll
 * containers clip to their viewport and translate by
 * (-scrollX, -scrollY); node transforms compose on the current CTM.
 *
 * State isolation: save()/restore() are used exactly when a node
 * introduces opacity, a transform, or a scroll viewport. Flat style
 * fields (fillStyle, font, lineWidth, ...) are assigned before each
 * draw and cannot leak between nodes.
 *
 * The frame strategy is a full clear + full traversal. Off-screen
 * subtrees are culled (while no ancestor transform is active) so
 * scrolling large lists only issues draws for the visible window.
 */
export class Canvas2DRenderer implements UiRenderer {
  private readonly paint = createPaintState();
  private cullX = 0;
  private cullY = 0;
  private cullWidth = 0;
  private cullHeight = 0;
  private readonly cullStack: number[] = [];

  constructor(private readonly options: Canvas2DRendererOptions) {}

  private get surface(): CanvasSurface {
    return this.options.surface;
  }

  render(root: UiNode, context: RenderContext): void {
    const ctx = this.surface.getContext2D();
    this.beginFrame(ctx);
    this.cullStack.length = 0;
    this.cullX = 0;
    this.cullY = 0;
    this.cullWidth = this.surface.logicalWidth;
    this.cullHeight = this.surface.logicalHeight;
    this.renderNode(root, context, ctx, true);
  }

  // -------------------------------------------------------------------------
  // Frame setup
  // -------------------------------------------------------------------------

  private beginFrame(ctx: Canvas2DContext): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.surface.physicalWidth, this.surface.physicalHeight);
    if (this.surface.dpr !== 1) {
      // All drawing stays in logical pixels; the backing store is
      // physical = logical × dpr.
      ctx.setTransform(this.surface.dpr, 0, 0, this.surface.dpr, 0, 0);
    }
  }

  // -------------------------------------------------------------------------
  // Traversal
  // -------------------------------------------------------------------------

  private renderNode(node: UiNode, context: RenderContext, ctx: Canvas2DContext, cull: boolean): void {
    const paint = resolvePaintState(node, this.paint);
    if (!paint.visible || paint.opacity === 0) {
      return;
    }
    const rec = context.layout.recordFor(node);
    if (rec === undefined) {
      return;
    }
    if (cull && !this.intersectsCull(rec.x, rec.y, rec.width, rec.height)) {
      return;
    }

    // Captured before children reuse the shared scratch below.
    const hasText = paint.text !== undefined;

    let saves = 0;
    if (paint.opacity < 1 || paint.hasTransform) {
      ctx.save();
      saves++;
      if (paint.opacity < 1) {
        ctx.globalAlpha *= paint.opacity;
      }
      if (paint.hasTransform) {
        this.applyTransform(ctx, rec, paint);
      }
    }

    this.paintBackground(ctx, rec, paint);
    this.paintImage(ctx, rec, paint);
    this.paintBorder(ctx, rec, paint);

    const isScroll = node.type === UiNodeType.ScrollView;
    if (isScroll) {
      ctx.save();
      saves++;
      ctx.beginPath();
      ctx.rect(rec.x, rec.y, rec.width, rec.height);
      ctx.clip();
      ctx.translate(-rec.scrollX, -rec.scrollY);
      this.pushCull(rec);
    }

    this.renderChildren(node, context, ctx, cull && !paint.hasTransform);

    if (isScroll) {
      this.popCull();
    }

    if (hasText) {
      // Foreground text is painted after children, but children have
      // reused the shared PaintState scratch. Re-resolve this node's
      // style so the text renders with its own color/size/alignment.
      resolvePaintState(node, this.paint);
      this.paintContent(ctx, rec, this.paint, context);
    }

    while (saves > 0) {
      ctx.restore();
      saves--;
    }
  }

  private renderChildren(node: UiNode, context: RenderContext, ctx: Canvas2DContext, cull: boolean): void {
    let child = node.firstChild;
    while (child !== null) {
      this.renderNode(child, context, ctx, cull);
      child = child.nextSibling;
    }
  }

  // -------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------

  private paintBackground(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState): void {
    if (paint.backgroundColor === undefined) {
      return;
    }
    ctx.fillStyle = paint.backgroundColor;
    if (paint.borderRadius > 0) {
      traceRoundedRect(ctx, rec.x, rec.y, rec.width, rec.height, paint.borderRadius);
      ctx.fill();
    } else {
      ctx.fillRect(rec.x, rec.y, rec.width, rec.height);
    }
  }

  private paintImage(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState): void {
    if (paint.image === undefined) {
      return;
    }
    const rect = computeObjectFitRect(paint.objectFit, paint.image.width, paint.image.height, rec);
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    ctx.drawImage(paint.image, rect.x, rect.y, rect.width, rect.height);
  }

  private paintBorder(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState): void {
    if (paint.borderWidth <= 0) {
      return;
    }
    ctx.strokeStyle = paint.borderColor ?? '#000';
    ctx.lineWidth = paint.borderWidth;
    ctx.lineJoin = 'round';
    if (paint.borderRadius > 0) {
      traceRoundedRect(ctx, rec.x, rec.y, rec.width, rec.height, paint.borderRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(rec.x, rec.y, rec.width, rec.height);
    }
  }

  private paintContent(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState, context: RenderContext): void {
    if (paint.text !== undefined) {
      drawText(ctx, rec, paint, context.text);
    }
  }

  private applyTransform(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState): void {
    const transform = paint.transform;
    const originX = rec.x + transform.x;
    const originY = rec.y + transform.y;
    ctx.translate(originX, originY);
    if (transform.rotation !== 0) {
      ctx.rotate(transform.rotation);
    }
    if (transform.scaleX !== 1 || transform.scaleY !== 1) {
      ctx.scale(transform.scaleX, transform.scaleY);
    }
    ctx.translate(-originX, -originY);
  }

  // -------------------------------------------------------------------------
  // Bounds culling
  // -------------------------------------------------------------------------

  private intersectsCull(x: number, y: number, width: number, height: number): boolean {
    if (this.cullWidth <= 0 || this.cullHeight <= 0) {
      return false;
    }
    return (
      x < this.cullX + this.cullWidth &&
      this.cullX < x + width &&
      y < this.cullY + this.cullHeight &&
      this.cullY < y + height
    );
  }

  /**
   * Intersects the visible region with a scroll viewport and shifts
   * by its scroll offset, so child boxes (absolute, pre-scroll) can
   * be tested against the region their screen pixels occupy.
   */
  private pushCull(rec: LayoutRecord): void {
    const right = Math.min(this.cullX + this.cullWidth, rec.x + rec.width);
    const bottom = Math.min(this.cullY + this.cullHeight, rec.y + rec.height);
    const left = Math.max(this.cullX, rec.x);
    const top = Math.max(this.cullY, rec.y);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    this.cullStack.push(this.cullX, this.cullY, this.cullWidth, this.cullHeight);
    this.cullX = left + rec.scrollX;
    this.cullY = top + rec.scrollY;
    this.cullWidth = width;
    this.cullHeight = height;
  }

  private popCull(): void {
    this.cullHeight = this.cullStack.pop() ?? 0;
    this.cullWidth = this.cullStack.pop() ?? 0;
    this.cullY = this.cullStack.pop() ?? 0;
    this.cullX = this.cullStack.pop() ?? 0;
  }
}

/**
 * Emits a rounded-rectangle path (clamped radius) onto a context.
 *
 * Uses arcTo instead of roundRect so the renderer does not depend
 * on the newer roundRect API. The radius is clamped to half the
 * smaller box dimension; radius <= 0 falls back to a plain rect.
 */
export function traceRoundedRect(
  ctx: Canvas2DContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0) {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
