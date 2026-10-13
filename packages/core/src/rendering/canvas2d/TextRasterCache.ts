import type { UiNode } from '../../graph/UiNode';
import type { LayoutBox } from '../../layout/LayoutTypes';
import type { TextMeasurer } from '../../layout/TextMeasurer';
import { colorToCss, type PaintState } from '../PaintState';
import { drawText, layoutTextLines } from '../TextRenderer';
import type { Canvas2DContext } from './Canvas2DContext';
import type { LayerCanvasFactory } from './ScrollLayers';

/**
 * Text kept as pixels, so a frame that only moved it copies it rather
 * than drawing its glyphs again.
 *
 * **Why.** Drawing glyphs is most of what a frame of text costs:
 * profiled while flicking through a file in Easel, `fillText` was 1,064
 * of the renderer's 1,985 ms. A scroll moves every line on screen and
 * changes none of them, so every one of those glyphs was drawn again
 * only to land a few pixels from where it was. In WKWebView a frame of
 * that cost 4 to 7 ms, which is more than a 165 Hz refresh holds.
 *
 * **What is kept.** What `drawText` draws for one node, drawn once into
 * a canvas of its own at the device scale and fraction of a pixel it
 * lands on, and copied onto the frame from then on. The copy lands on
 * whole device pixels, so the pixels are the ones a direct draw at that
 * fraction would have made, and a scroll, which moves by whole device
 * pixels, keeps the fraction.
 *
 * **When it is drawn again.** When anything `drawText` reads changes:
 * the text, its runs, its font, its colour, its box, the scale, or the
 * fraction of a pixel it sits at. Each is compared every frame, which is
 * a few comparisons; a run list or a colour that has not changed is the
 * same object it was.
 *
 * **What it is not for.** Text that changes on most frames (a clock, a
 * counter, an animated colour) would be drawn twice a frame, into the
 * cache and out of it. A node redrawn on most of its recent frames is
 * drawn directly instead, until it has been still for a while.
 */
export class TextRasterCache {
  private readonly entries = new Map<UiNode, TextRaster>();
  private frame = 0;
  private pixels = 0;
  /** Draws served from the cache and drawn into it, since the last reset. For budget specs. */
  readonly stats = { copied: 0, drawn: 0, direct: 0 };

  constructor(private readonly createCanvas: LayerCanvasFactory) {}

  beginFrame(): void {
    this.frame++;
  }

  /** Lets go of text not drawn lately: removed, scrolled far away, or hidden. */
  endFrame(): void {
    for (const [node, entry] of this.entries) {
      if (this.frame - entry.used > IDLE_FRAMES) {
        this.drop(node, entry);
      }
    }
  }

  dropAll(): void {
    for (const [node, entry] of this.entries) {
      this.drop(node, entry);
    }
  }

  resetStats(): void {
    this.stats.copied = 0;
    this.stats.drawn = 0;
    this.stats.direct = 0;
  }

  /**
   * Draws a node's text from the cache, drawing it into the cache first
   * when what it holds is out of date. False when the text should be
   * drawn directly: a context that cannot say where it draws, one that
   * rotates or skews, text too large to keep, or text that changes too
   * often to be worth keeping.
   */
  draw(ctx: Canvas2DContext, node: UiNode, box: LayoutBox, paint: PaintState, measurer: TextMeasurer): boolean {
    const m = ctx.getTransform?.();
    if (m === undefined || m.b !== 0 || m.c !== 0 || !(m.a > 0) || !(m.d > 0)) {
      return false;
    }
    let entry = this.entries.get(node);
    if (entry !== undefined && entry.directUntil > this.frame) {
      entry.used = this.frame;
      this.stats.direct++;
      return false;
    }
    // The ink's extent, from its box's corner. Kept with the pixels, since
    // it changes only with what they were drawn from: a scroll reuses it
    // without laying the text out again.
    let extent = entry !== undefined && entry.drawnFrom(paint, box, m.a, m.d) ? entry.extent : null;
    if (extent === null) {
      extent = inkExtent(box, paint, measurer);
      if (extent === null) {
        return false;
      }
    }
    const left = m.a * (box.x + extent.left) + m.e;
    const top = m.d * (box.y + extent.top) + m.f;
    const x = Math.floor(left);
    const y = Math.floor(top);
    const width = Math.ceil(m.a * (extent.right - extent.left) + (left - x)) + 1;
    const height = Math.ceil(m.d * (extent.bottom - extent.top) + (top - y)) + 1;
    if (width * height > MAX_ENTRY_PIXELS) {
      return false;
    }
    // Where the text sits, measured from the canvas's own top left, in
    // device pixels: the same text drawn at the same fraction of a pixel
    // is the same pixels, wherever on the frame they are copied.
    const offsetX = m.e - x;
    const offsetY = m.f - y;
    let raster: TextRaster | null = entry ?? null;
    if (raster === null || !raster.holds(paint, box, m.a, m.d, offsetX, offsetY, width, height)) {
      raster = this.redraw(node, entry, paint, box, measurer, m.a, m.d, offsetX, offsetY, width, height, extent);
      if (raster === null) {
        return false;
      }
    }
    raster.used = this.frame;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The whole canvas, which is clear past what this text drew in it.
    ctx.drawImage(raster.canvas as unknown as OffscreenCanvas, x, y, raster.canvasWidth, raster.canvasHeight);
    ctx.restore();
    this.stats.copied++;
    return true;
  }

  private redraw(
    node: UiNode,
    previous: TextRaster | undefined,
    paint: PaintState,
    box: LayoutBox,
    measurer: TextMeasurer,
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    extent: InkExtent
  ): TextRaster | null {
    let entry = previous;
    if (entry !== undefined) {
      // Drawn again within a few frames of the last time, often: text that
      // changes as fast as it is drawn, which is better drawn directly.
      entry.churn = this.frame - entry.drawnAt <= CHURN_FRAMES ? entry.churn + 1 : 0;
      if (entry.churn >= CHURN_LIMIT) {
        entry.churn = 0;
        entry.directUntil = this.frame + DIRECT_FRAMES;
        entry.used = this.frame;
        this.stats.direct++;
        return null;
      }
    }
    if (entry === undefined || entry.canvasWidth < width || entry.canvasHeight < height) {
      const canvasWidth = Math.max(width, entry?.canvasWidth ?? 0);
      const canvasHeight = Math.max(height, entry?.canvasHeight ?? 0);
      const canvas = this.createCanvas(canvasWidth, canvasHeight);
      const context = canvas?.getContext('2d') as Canvas2DContext | null | undefined;
      if (canvas === null || !context) {
        return null;
      }
      this.make(canvasWidth * canvasHeight);
      if (entry !== undefined) {
        this.pixels -= entry.canvasWidth * entry.canvasHeight;
        entry.canvas = canvas;
        entry.context = context;
        entry.canvasWidth = canvasWidth;
        entry.canvasHeight = canvasHeight;
      } else {
        entry = new TextRaster(canvas, context, canvasWidth, canvasHeight);
        this.entries.set(node, entry);
      }
      this.pixels += canvasWidth * canvasHeight;
    }
    const context = entry.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, entry.canvasWidth, entry.canvasHeight);
    context.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    // The frame's clip is not this canvas's, but the text a node draws is
    // inside its own box, which the copy is clipped by on the frame.
    context.globalAlpha = 1;
    drawText(context, box, paint, measurer);
    entry.remember(paint, box, scaleX, scaleY, offsetX, offsetY, width, height);
    entry.extent = extent;
    entry.drawnAt = this.frame;
    this.stats.drawn++;
    return entry;
  }

  /** Makes room for `needed` more pixels, letting go of what was drawn least recently. */
  private make(needed: number): void {
    if (this.pixels + needed <= MAX_PIXELS) {
      return;
    }
    const byAge = [...this.entries].sort((a, b) => a[1].used - b[1].used);
    for (const [node, entry] of byAge) {
      if (this.pixels + needed <= MAX_PIXELS || entry.used === this.frame) {
        break;
      }
      this.drop(node, entry);
    }
  }

  private drop(node: UiNode, entry: TextRaster): void {
    this.entries.delete(node);
    this.pixels -= entry.canvasWidth * entry.canvasHeight;
    // A canvas's pixels are freed with it; shrinking it first frees them now.
    entry.canvas.width = 0;
    entry.canvas.height = 0;
  }
}

/** One node's text as pixels, and what it was drawn from. */
class TextRaster {
  used = 0;
  drawnAt = 0;
  churn = 0;
  directUntil = 0;

  /** Where the ink reaches, from the box's corner, in layout pixels. */
  extent: InkExtent | null = null;

  private text: string | undefined;
  private spans: PaintState['spans'];
  private font = '';
  private color = '';
  private style = '';
  private linkHover = 0;
  private boxWidth = 0;
  private boxHeight = 0;
  private scaleX = 0;
  private scaleY = 0;
  private offsetX = 0;
  private offsetY = 0;
  private width = 0;
  private height = 0;

  constructor(
    public canvas: { width: number; height: number },
    public context: Canvas2DContext,
    public canvasWidth: number,
    public canvasHeight: number
  ) {}

  holds(
    paint: PaintState,
    box: LayoutBox,
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number
  ): boolean {
    return (
      this.drawnFrom(paint, box, scaleX, scaleY) &&
      Math.abs(this.offsetX - offsetX) < SAME_PLACE &&
      Math.abs(this.offsetY - offsetY) < SAME_PLACE &&
      this.width === width &&
      this.height === height
    );
  }

  /** Whether the pixels are of this text, in this style, at this size and scale, wherever they are. */
  drawnFrom(paint: PaintState, box: LayoutBox, scaleX: number, scaleY: number): boolean {
    return (
      this.text === paint.text &&
      this.spans === paint.spans &&
      this.linkHover === paint.linkHover &&
      this.boxWidth === box.width &&
      this.boxHeight === box.height &&
      this.scaleX === scaleX &&
      this.scaleY === scaleY &&
      this.font === fontOf(paint) &&
      this.color === colorToCss(paint.textColor) &&
      this.style === styleOf(paint)
    );
  }

  remember(
    paint: PaintState,
    box: LayoutBox,
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number
  ): void {
    this.text = paint.text;
    this.spans = paint.spans;
    this.linkHover = paint.linkHover;
    this.boxWidth = box.width;
    this.boxHeight = box.height;
    this.scaleX = scaleX;
    this.scaleY = scaleY;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.width = width;
    this.height = height;
    this.font = fontOf(paint);
    this.color = colorToCss(paint.textColor);
    this.style = styleOf(paint);
  }
}

/** How far the ink reaches from a box's corner, in layout pixels. */
interface InkExtent {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The lines' extent, and a margin for what glyphs reach past their line
 * box (an italic's lean, a descender below a tight line height, an
 * underline). Null for text that draws nothing.
 */
function inkExtent(box: LayoutBox, paint: PaintState, measurer: TextMeasurer): InkExtent | null {
  const placements = layoutTextLines(box, paint, measurer);
  if (placements.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const line of placements) {
    left = Math.min(left, line.x);
    top = Math.min(top, line.y);
    right = Math.max(right, line.x + line.width);
    bottom = Math.max(bottom, line.y + line.height);
  }
  const margin = Math.ceil(paint.fontSize * INK_MARGIN) + 2;
  return {
    left: left - box.x - margin,
    top: top - box.y - margin,
    right: right - box.x + margin,
    bottom: bottom - box.y + margin
  };
}

function fontOf(paint: PaintState): string {
  return `${paint.fontStyle} ${paint.fontVariant} ${paint.fontWeight} ${paint.fontStretch} ${paint.fontSize}/${paint.lineHeight} ${paint.fontFamily}`;
}

/** Everything else `drawText` reads that places or decorates the glyphs. */
function styleOf(paint: PaintState): string {
  return `${paint.letterSpacing}|${paint.fontKerning}|${paint.textDecoration}|${paint.textAlign}|${paint.verticalAlign}|${paint.textWrap}|${paint.maxLines}|${paint.textOverflow}|${paint.rtl}`;
}

/** How far past its line box, as a share of the font size, a glyph's ink may reach. */
const INK_MARGIN = 0.5;
/** Within this much of a device pixel, text is at the same place. */
const SAME_PLACE = 1 / 256;
/** The largest single piece of text kept: a few screens of a long paragraph. */
const MAX_ENTRY_PIXELS = 4_000_000;
/** Everything kept, at most: about 128 MB. */
const MAX_PIXELS = 32_000_000;
/** Frames text is kept for without being drawn: about two seconds at 60 Hz. */
const IDLE_FRAMES = 120;
/** Drawn again within this many frames of the last time counts toward churn. */
const CHURN_FRAMES = 2;
/** Times in a row text may churn before it is drawn directly. */
const CHURN_LIMIT = 3;
/** Frames churning text is drawn directly for before the cache tries it again. */
const DIRECT_FRAMES = 60;
