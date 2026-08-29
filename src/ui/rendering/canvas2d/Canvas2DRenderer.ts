import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import type { LayoutRecord } from '../../layout/LayoutRecord';
import type { Canvas2DContext } from './Canvas2DContext';
import type { CanvasSurface } from './CanvasSurface';
import { colorToCss, computeObjectFitRect, createPaintState, resolvePaintState } from '../PaintState';
import type { PaintState } from '../PaintState';
import { borderRadiusIsZero, uniformBorderRadius } from '../../properties/UiBorderRadius';
import type { RenderContext } from '../RenderContext';
import { buildFontString, drawText, drawTextLines } from '../TextRenderer';
import { EditableLayout } from '../../editing/EditableLayout';
import { lineIndexForOffset } from '../../editing/TextGeometry';
import { caretVisibleAt } from '../../editing/UiEditable';

/** Logical width of the caret, as a textarea's. */
export const CARET_WIDTH = 1;
import { SCROLLBAR_FADE_MS } from '../../layout/LayoutEngine';
import { SCROLLBAR_THICKNESS, scrollbarThumbs } from '../../layout/Scrollbars';
import type { LayoutBox } from '../../layout/LayoutTypes';
import type { RendererBackend, UiRenderer } from '../UiRenderer';
import { drawOverlayShapes } from '../OverlayShapes';

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
  readonly backend: RendererBackend = 'canvas2d';
  private disposed = false;

  /** Scratch for the padded box text is drawn in; reused across nodes. */
  private readonly contentBox: LayoutBox = { x: 0, y: 0, width: 0, height: 0 };
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

  /** A 2D context needs no asynchronous setup. */
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  get isReady(): boolean {
    return !this.disposed;
  }

  resize(width: number, height: number, dpr: number): void {
    this.surface.setLogicalSize(width, height, dpr);
  }

  dispose(): void {
    this.disposed = true;
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
    if (context.overlay !== undefined && context.overlay.length > 0) {
      drawOverlayShapes(ctx, context.overlay);
    }
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
    const sticky = rec.stickyOffsetX !== 0 || rec.stickyOffsetY !== 0;
    if (cull && !this.intersectsCull(rec.x + rec.stickyOffsetX, rec.y + rec.stickyOffsetY, rec.width, rec.height)) {
      return;
    }

    // Captured before children reuse the shared scratch below.
    const hasText = paint.text !== undefined;

    let saves = 0;
    if (paint.opacity < 1 || paint.hasTransform || sticky) {
      ctx.save();
      saves++;
      if (sticky) {
        // A sticky node is drawn shifted to its scroll container's edge,
        // children included; its record keeps the flow position.
        ctx.translate(rec.stickyOffsetX, rec.stickyOffsetY);
      }
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

    if (rec.clips) {
      // overflow hidden/scroll/auto and ScrollView: children and the
      // node's own text are clipped to the box (following its corner
      // radius); for a scroll container the children are also
      // translated by the scroll offset.
      ctx.save();
      if (!borderRadiusIsZero(paint.borderRadius)) {
        traceRoundedRect(ctx, rec.x, rec.y, rec.width, rec.height, uniformBorderRadius(paint.borderRadius));
      } else {
        ctx.beginPath();
        ctx.rect(rec.x, rec.y, rec.width, rec.height);
      }
      ctx.clip();
      this.pushCull(rec);
    }
    if (rec.scrollable) {
      ctx.save();
      ctx.translate(-rec.scrollX, -rec.scrollY);
    }

    // Culling works in record coordinates; a transform or a sticky shift
    // moves what is drawn away from them, so descendants are not culled.
    this.renderChildren(node, context, ctx, cull && !paint.hasTransform && !sticky);

    if (rec.scrollable) {
      ctx.restore();
    }
    if (rec.clips) {
      this.popCull();
    }

    if (hasText) {
      // Foreground text is painted after children, inside the node's
      // own clip and in its own (unscrolled) space. Children have
      // reused the shared PaintState scratch, so re-resolve this node's
      // style so the text renders with its own color/size/alignment.
      resolvePaintState(node, this.paint);
      this.paintContent(ctx, rec, this.paint, context);
    }

    if (rec.clips) {
      ctx.restore();
    }
    if (rec.scrollable) {
      this.paintScrollbars(ctx, rec, context.now ?? performance.now());
    }

    while (saves > 0) {
      ctx.restore();
      saves--;
    }
  }

  private renderChildren(node: UiNode, context: RenderContext, ctx: Canvas2DContext, cull: boolean): void {
    // zIndex reordered these children: layout recorded the order (with
    // fragments already expanded) so paint and hit testing agree.
    const order = context.layout.recordFor(node)?.paintOrder;
    if (order !== null && order !== undefined) {
      for (const child of order) {
        this.renderNode(child, context, ctx, cull);
      }
      return;
    }
    let child = node.firstChild;
    while (child !== null) {
      if (child.type === UiNodeType.Fragment) {
        this.renderChildren(child, context, ctx, cull);
      } else {
        this.renderNode(child, context, ctx, cull);
      }
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
    ctx.fillStyle = colorToCss(paint.backgroundColor);
    if (!borderRadiusIsZero(paint.borderRadius)) {
      traceRoundedRect(ctx, rec.x, rec.y, rec.width, rec.height, uniformBorderRadius(paint.borderRadius));
      ctx.fill();
    } else {
      ctx.fillRect(rec.x, rec.y, rec.width, rec.height);
    }
  }

  /**
   * The image is clipped to the node's (rounded) box, as CSS clips
   * `object-fit`: `cover` and `none` produce a rectangle larger than
   * the box, and only the box shows.
   */
  private paintImage(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState): void {
    if (paint.image === undefined) {
      return;
    }
    const rect = computeObjectFitRect(paint.objectFit, paint.image.width, paint.image.height, rec);
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const overflows =
      rect.x < rec.x ||
      rect.y < rec.y ||
      rect.x + rect.width > rec.x + rec.width ||
      rect.y + rect.height > rec.y + rec.height;
    const rounded = !borderRadiusIsZero(paint.borderRadius);
    if (!overflows && !rounded) {
      ctx.drawImage(paint.image, rect.x, rect.y, rect.width, rect.height);
      return;
    }
    ctx.save();
    traceRoundedRect(ctx, rec.x, rec.y, rec.width, rec.height, rounded ? uniformBorderRadius(paint.borderRadius) : 0);
    ctx.clip();
    ctx.drawImage(paint.image, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  /**
   * Borders lie inside the box, as CSS draws them and as the WebGPU
   * backend's border band does: the stroke is centred on a path inset
   * by half its width, so its outer edge is the box edge.
   */
  private paintBorder(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState): void {
    if (paint.borderWidth <= 0) {
      return;
    }
    const inset = paint.borderWidth / 2;
    const x = rec.x + inset;
    const y = rec.y + inset;
    const width = Math.max(0, rec.width - paint.borderWidth);
    const height = Math.max(0, rec.height - paint.borderWidth);
    ctx.strokeStyle = paint.borderColor !== undefined ? colorToCss(paint.borderColor) : '#000';
    ctx.lineWidth = paint.borderWidth;
    ctx.lineJoin = 'round';
    if (!borderRadiusIsZero(paint.borderRadius)) {
      traceRoundedRect(ctx, x, y, width, height, Math.max(0, uniformBorderRadius(paint.borderRadius) - inset));
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, width, height);
    }
  }

  private paintContent(ctx: Canvas2DContext, rec: LayoutRecord, paint: PaintState, context: RenderContext): void {
    if (paint.text !== undefined) {
      // Text lives in the content box: layout sized the paragraph inside
      // the padding, so paint must place it there too.
      this.contentBox.x = rec.x + rec.paddingLeft;
      this.contentBox.y = rec.y + rec.paddingTop;
      this.contentBox.width = Math.max(0, rec.width - rec.paddingLeft - rec.paddingRight);
      this.contentBox.height = Math.max(0, rec.height - rec.paddingTop - rec.paddingBottom);
      if (paint.editor !== undefined) {
        this.paintEditable(ctx, paint, context);
        return;
      }
      drawText(ctx, this.contentBox, paint, context.text);
    }
  }

  /**
   * An editable: the selection behind the text, the text (or the
   * placeholder while it is empty), the underline of an IME composition,
   * and the caret — only while focused, and in the lit half of its
   * blink. The geometry is `EditableLayout`'s, the same the input
   * layer places the caret with.
   */
  private paintEditable(ctx: Canvas2DContext, paint: PaintState, context: RenderContext): void {
    const model = paint.editor!;
    const layout = new EditableLayout(model, this.contentBox, paint, context.text);
    if (model.focused && !model.collapsed) {
      ctx.fillStyle = colorToCss(paint.selectionColor);
      for (const box of layout.selectionBoxes()) {
        ctx.fillRect(box.x, box.y, box.width, box.height);
      }
    }
    if (layout.placeholderLines.length > 0) {
      drawTextLines(ctx, layout.placeholderLines, buildFontString(paint), colorToCss(paint.placeholderColor));
    } else {
      drawTextLines(ctx, layout.lines, buildFontString(paint), colorToCss(paint.textColor));
    }
    if (model.composing) {
      ctx.fillStyle = colorToCss(paint.textColor);
      for (const box of layout.compositionBoxes()) {
        const line = layout.lines[lineIndexForOffset(layout.lines, model.composition!.start)];
        const underlineY = Math.round(line.baselineY + 1);
        ctx.fillRect(box.x, underlineY, box.width, 1);
      }
    }
    if (model.focused && model.collapsed && caretVisibleAt(model, context.now ?? performance.now())) {
      const caret = layout.caretRect();
      ctx.fillStyle = colorToCss(paint.caretColor);
      ctx.fillRect(Math.round(caret.x), caret.y, CARET_WIDTH, caret.height);
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
  /**
   * Overlay scrollbars: a thin rounded thumb along the end edge of each
   * overflowing axis, sized by viewport/content and placed by the
   * scroll offset. Shown while scrolling and for a moment after, fading
   * out over the last part of that time.
   */
  private paintScrollbars(ctx: Canvas2DContext, rec: LayoutRecord, now: number): void {
    const remaining = rec.scrollbarVisibleUntil - now;
    if (remaining <= 0) {
      return;
    }
    const alpha = Math.min(1, remaining / SCROLLBAR_FADE_MS) * 0.55;
    ctx.fillStyle = `rgba(128,128,128,${alpha.toFixed(3)})`;
    const { vertical, horizontal } = scrollbarThumbs(rec);
    for (const bar of [vertical, horizontal]) {
      if (bar === null) {
        continue;
      }
      const { x, y, width, height } = bar.thumb;
      traceRoundedRect(ctx, x, y, width, height, SCROLLBAR_THICKNESS / 2);
      ctx.fill();
    }
  }

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
