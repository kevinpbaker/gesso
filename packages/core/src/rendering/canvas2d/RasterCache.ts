import { DirtyFlags } from '../../graph/DirtyFlags';
import type { UiNode } from '../../graph/UiNode';
import type { LayoutRecord } from '../../layout/LayoutRecord';
import type { RenderChanges } from '../RenderContext';
import type { Canvas2DContext } from './Canvas2DContext';
import type { CanvasHost } from './CanvasSurface';
import { PreciseContext } from './PreciseContext';
import type { LayerCanvasFactory } from './ScrollLayers';

/**
 * Subtrees kept as pixels, for a node marked `rasterize`, and copied
 * onto the frame while only what is above them moves or scales.
 *
 * **Why.** A design tool's board is a camera over a few dozen frames,
 * each a whole screen of photographs, vector logos and text. Zooming
 * it changes nothing inside any frame, yet a full traversal draws every
 * one of them again on every step: in Atelier, twenty frames cost 10 to
 * 50 ms a step, most of it resampling the photographs and filling the
 * logos' paths at a scale they had not been drawn at before. Copied, a
 * frame is one `drawImage`.
 *
 * **What is kept.** What the node and its subtree paint, drawn once into
 * a canvas of its own at the device scale it is drawn at, over the
 * area its subtree may paint (its record's extent), relative to its own
 * corner: a node that moves without changing is copied where it is.
 *
 * **When it is drawn again.**
 *
 *   - At once, when what it shows may have changed: anything in the
 *     subtree was dirtied, an ancestor changed what it passes down, the
 *     node changed size, or the frame was not vouched for.
 *   - Once a zoom has settled, when the scale it is drawn at is not the
 *     one it was kept at. While the scale keeps changing the pixels it
 *     has are stretched, which is blurred or soft for a moment and keeps
 *     the frame rate; when the scale has held for `SETTLE_MS` it is
 *     drawn again, sharp, a few a frame, and `nextRepaint` asks the
 *     runtime for the frame that does it, since nothing else would.
 *   - Mid-zoom, when the stretch is past what still reads as the picture
 *     (`MAX_STRETCH`) and the frame has the time left for it, by what it
 *     took the last time; one that would drop the frame waits to settle.
 *
 * **When it is drawn directly instead.** A context that rotates or
 * skews; a node with a transform or a sticky shift of its own; a
 * subtree that would not fit in `MAX_RASTER_PIXELS` at the scale it is
 * drawn at (zoomed far into it, where only a part is on screen and
 * culling draws just that part); one whose pixels change without its
 * changes saying so (a caret, a fading scrollbar, a video) or which lifts
 * something to the top layer; and one drawn again on most of its recent
 * frames, which a cache would only draw twice.
 */
export class RasterCache {
  private readonly entries = new Map<UiNode, Raster>();
  private frame = 0;
  private pixels = 0;
  private open = false;
  /** Pixels drawn again this frame for a sharper scale. */
  private spent = 0;
  /** The frame's own size in device pixels; nothing larger is kept. */
  private surfacePixels = Infinity;
  private wanted: number | undefined = undefined;
  /** Copies, draws into the cache, and draws left to the frame, since the last reset. For budget specs. */
  readonly stats = { copied: 0, drawn: 0, direct: 0 };

  constructor(
    private readonly createCanvas: LayerCanvasFactory,
    private readonly settleMs: number = SETTLE_MS
  ) {}

  /**
   * Marks what the frame's changes leave out of date, before anything is
   * drawn. A frame the caller could not vouch for, or one after a frame
   * that never finished, leaves everything out of date.
   */
  beginFrame(changes: RenderChanges | undefined, surfacePixels = Infinity): void {
    this.surfacePixels = surfacePixels;
    const interrupted = this.open;
    this.open = true;
    this.frame++;
    this.spent = 0;
    this.wanted = undefined;
    if (this.entries.size === 0) {
      return;
    }
    if (interrupted || changes === undefined) {
      for (const entry of this.entries.values()) {
        entry.stale = true;
      }
      return;
    }
    const frame = changes.frame;
    // Anything dirtied inside a kept subtree, the node itself included,
    // may show in it: a scroll inside it, a colour, a child added.
    for (const [node] of frame.entries()) {
      for (let at: UiNode | null = node; at !== null; at = at.parent) {
        const entry = this.entries.get(at);
        if (entry !== undefined) {
          entry.stale = true;
        }
      }
    }
    // What an ancestor passes down reaches the subtree without dirtying
    // it. An ancestor that only moved or scaled (a camera) changes
    // nothing kept: that is what the cache is for.
    for (const [node, entry] of this.entries) {
      for (let ancestor = node.parent; ancestor !== null && !entry.stale; ancestor = ancestor.parent) {
        if ((frame.dirtyFlagsFor(ancestor) & INHERITED) !== 0) {
          entry.stale = true;
        }
      }
    }
  }

  /** Lets go of what was not drawn lately: removed, culled for a while, or hidden. */
  endFrame(): void {
    this.open = false;
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
   * When the frame just drawn would like another though nothing changes:
   * a zoom settling, whose kept pixels are then drawn again at the scale
   * it stopped at. Undefined when nothing waits.
   */
  get nextRepaint(): number | undefined {
    return this.wanted;
  }

  /**
   * Draws a node and its subtree from the cache, drawing them into it
   * first when what it holds is out of date. `paint` draws them into the
   * context it is handed, already placed, and answers whether what it
   * drew may be kept (see the class comment). False when the node should
   * be drawn directly.
   */
  draw(
    ctx: Canvas2DContext,
    node: UiNode,
    rec: LayoutRecord,
    now: number,
    paint: (target: Canvas2DContext, width: number, height: number) => boolean
  ): boolean {
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
    // The area the subtree may paint, from the node's corner, with a
    // pixel spare for antialiasing past it.
    const left = rec.extentMinX - rec.x - SPARE;
    const top = rec.extentMinY - rec.y - SPARE;
    const width = rec.extentMaxX - rec.extentMinX + 2 * SPARE;
    const height = rec.extentMaxY - rec.extentMinY + 2 * SPARE;
    const fits = (scaleX: number, scaleY: number): boolean => {
      const canvasWidth = Math.ceil(width * scaleX) + 1;
      const canvasHeight = Math.ceil(height * scaleY) + 1;
      const pixels = canvasWidth * canvasHeight;
      // Larger than the frame, most of it is off screen, which a direct
      // draw culls; and what it would hold is drawn again at every step
      // of the zoom that made it so large.
      return (
        canvasWidth <= MAX_SIDE &&
        canvasHeight <= MAX_SIDE &&
        pixels <= MAX_RASTER_PIXELS &&
        pixels <= this.surfacePixels
      );
    };
    if (!(width > 0) || !(height > 0) || !fits(m.a, m.d)) {
      // What it kept at a smaller scale stays, to be stretched when the
      // zoom comes back out: drawn anew, every frame it holds would be
      // drawn on one step.
      if (entry !== undefined) {
        entry.used = this.frame;
      }
      this.stats.direct++;
      return false;
    }
    // Where the area's corner lands on the frame, in device pixels.
    const x = m.a * (rec.x + left) + m.e;
    const y = m.d * (rec.y + top) + m.f;
    const changed =
      entry === undefined ||
      entry.stale ||
      entry.width !== width ||
      entry.height !== height ||
      entry.left !== left ||
      entry.top !== top;
    if (changed) {
      if (entry !== undefined) {
        // Out of date within a few frames of the last time, often: a
        // subtree that changes as fast as it is drawn.
        entry.churn = this.frame - entry.changedAt <= CHURN_FRAMES ? entry.churn + 1 : 0;
        if (entry.churn >= CHURN_LIMIT) {
          entry.churn = 0;
          entry.directUntil = this.frame + DIRECT_FRAMES;
          entry.used = this.frame;
          this.stats.direct++;
          return false;
        }
      }
      const drawn = this.redraw(
        node,
        entry,
        m.a,
        m.d,
        x,
        y,
        rec.x + left,
        rec.y + top,
        left,
        top,
        width,
        height,
        paint
      );
      if (drawn === null) {
        this.stats.direct++;
        return false;
      }
      drawn.changedAt = this.frame;
      entry = drawn;
    } else if (entry!.scaleX !== m.a || entry!.scaleY !== m.d) {
      entry = this.resharpen(node, entry!, m.a, m.d, x, y, rec.x + left, rec.y + top, now, paint);
    }
    const raster = entry!;
    raster.used = this.frame;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (raster.scaleX === m.a && raster.scaleY === m.d) {
      // One pixel to one, on whole device pixels: the pixels a direct
      // draw at the fraction they were kept at would have made, moved by
      // under half a pixel at most.
      ctx.drawImage(
        raster.host as unknown as OffscreenCanvas,
        Math.round(x - raster.fractionX),
        Math.round(y - raster.fractionY),
        raster.canvasWidth,
        raster.canvasHeight
      );
    } else {
      const stretchX = m.a / raster.scaleX;
      const stretchY = m.d / raster.scaleY;
      ctx.drawImage(
        raster.host as unknown as OffscreenCanvas,
        x - raster.fractionX * stretchX,
        y - raster.fractionY * stretchY,
        raster.canvasWidth * stretchX,
        raster.canvasHeight * stretchY
      );
    }
    ctx.restore();
    this.stats.copied++;
    return true;
  }

  /**
   * A subtree kept at another scale than it is drawn at: stretched while
   * the scale is moving, drawn again once it has settled or when it is
   * stretched too far, as the frame's budget allows.
   */
  private resharpen(
    node: UiNode,
    entry: Raster,
    scaleX: number,
    scaleY: number,
    x: number,
    y: number,
    cornerX: number,
    cornerY: number,
    now: number,
    paint: (target: Canvas2DContext, width: number, height: number) => boolean
  ): Raster {
    if (entry.seenX !== scaleX || entry.seenY !== scaleY) {
      entry.seenX = scaleX;
      entry.seenY = scaleY;
      entry.seenAt = now;
    }
    const stretch = Math.max(
      scaleX / entry.scaleX,
      scaleY / entry.scaleY,
      entry.scaleX / scaleX,
      entry.scaleY / scaleY
    );
    const settled = now - entry.seenAt >= this.settleMs;
    // Counted in pixels, not time: an engine that defers a canvas's
    // drawing (WebKit) does it when the copy reaches the frame, so the
    // draw itself takes no time to measure. Settled, the zoom has
    // stopped and a long frame is not seen, so a frame's worth at a
    // time; while it moves, only a little, since one dropped frame is a
    // stutter, and the rest is stretched until it settles.
    const pixels = (Math.ceil(entry.width * scaleX) + 1) * (Math.ceil(entry.height * scaleY) + 1);
    const sharpen = settled
      ? this.spent === 0 || this.spent + pixels <= SETTLED_PIXELS
      : stretch > MAX_STRETCH && this.spent + pixels <= MOVING_PIXELS;
    if (sharpen) {
      this.spent += pixels;
      const drawn = this.redraw(
        node,
        entry,
        scaleX,
        scaleY,
        x,
        y,
        cornerX,
        cornerY,
        entry.left,
        entry.top,
        entry.width,
        entry.height,
        paint
      );
      if (drawn !== null) {
        return drawn;
      }
      return this.entries.get(node) ?? entry;
    }
    // Not yet, or not this frame: asked for when it will be.
    this.want(settled ? now + 1 : entry.seenAt + this.settleMs);
    return entry;
  }

  private want(at: number): void {
    this.wanted = this.wanted === undefined ? at : Math.min(this.wanted, at);
  }

  /**
   * Draws the subtree into the node's canvas at a scale, its area's
   * corner at (`cornerX`, `cornerY`) in layout pixels, with the
   * fraction of a device pixel its corner lands on, so a copy at that
   * scale is the direct draw's pixels. Null when no canvas could be had,
   * or when what `paint` drew may not be kept; the entry then draws
   * directly for a while, and this frame copies what was drawn.
   */
  private redraw(
    node: UiNode,
    previous: Raster | undefined,
    scaleX: number,
    scaleY: number,
    x: number,
    y: number,
    cornerX: number,
    cornerY: number,
    left: number,
    top: number,
    width: number,
    height: number,
    paint: (target: Canvas2DContext, width: number, height: number) => boolean
  ): Raster | null {
    const canvasWidth = Math.ceil(width * scaleX) + 1;
    const canvasHeight = Math.ceil(height * scaleY) + 1;
    let entry = previous;
    if (entry !== undefined) {
      // Not the least recently drawn while room is made for it.
      entry.used = this.frame;
    }
    if (entry === undefined || entry.canvasWidth !== canvasWidth || entry.canvasHeight !== canvasHeight) {
      const growth = canvasWidth * canvasHeight - (entry === undefined ? 0 : entry.canvasWidth * entry.canvasHeight);
      if (!this.make(growth)) {
        return null;
      }
      if (entry === undefined) {
        const host = this.createCanvas(canvasWidth, canvasHeight);
        const raw = host?.getContext('2d') as Canvas2DContext | null | undefined;
        if (host === null || raw === null || raw === undefined) {
          return null;
        }
        entry = new Raster(host, raw);
        this.entries.set(node, entry);
      }
      // Sizing a canvas clears it, and frees what it held beyond the new size.
      entry.host.width = canvasWidth;
      entry.host.height = canvasHeight;
      this.pixels += growth;
      entry.canvasWidth = canvasWidth;
      entry.canvasHeight = canvasHeight;
    } else {
      entry.raw.setTransform(1, 0, 0, 1, 0, 0);
      entry.raw.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    const fractionX = x - Math.floor(x);
    const fractionY = y - Math.floor(y);
    const target = entry.ctx.reset(entry.raw);
    // `paint` draws in layout coordinates; the area's corner lands on
    // the canvas's, at the fraction it lands at on the frame.
    target.setTransform(scaleX, 0, 0, scaleY, fractionX - scaleX * cornerX, fractionY - scaleY * cornerY);
    target.globalAlpha = 1;
    const kept = paint(target, canvasWidth, canvasHeight);
    entry.scaleX = entry.seenX = scaleX;
    entry.scaleY = entry.seenY = scaleY;
    entry.fractionX = fractionX;
    entry.fractionY = fractionY;
    entry.left = left;
    entry.top = top;
    entry.width = width;
    entry.height = height;
    entry.stale = false;
    this.stats.drawn++;
    if (!kept) {
      entry.directUntil = this.frame + DIRECT_FRAMES;
      entry.stale = true;
    }
    return entry;
  }

  /** Makes room for `needed` more pixels, letting go of what was drawn least recently; false when it cannot. */
  private make(needed: number): boolean {
    if (this.pixels + needed <= MAX_PIXELS) {
      return true;
    }
    const byAge = [...this.entries].sort((a, b) => a[1].used - b[1].used);
    for (const [node, entry] of byAge) {
      if (this.pixels + needed <= MAX_PIXELS || entry.used === this.frame) {
        break;
      }
      this.drop(node, entry);
    }
    return this.pixels + needed <= MAX_PIXELS;
  }

  private drop(node: UiNode, entry: Raster): void {
    this.entries.delete(node);
    this.pixels -= entry.canvasWidth * entry.canvasHeight;
    // A canvas's pixels are freed with it; shrinking it first frees them now.
    entry.host.width = 0;
    entry.host.height = 0;
  }
}

/** One subtree as pixels, and what they were drawn for. */
class Raster {
  readonly ctx: PreciseContext;
  canvasWidth = 0;
  canvasHeight = 0;
  /** The device scale it was drawn at, and the fraction of a pixel its corner sat at. */
  scaleX = 0;
  scaleY = 0;
  fractionX = 0;
  fractionY = 0;
  /** The area kept, from the node's corner, in layout pixels. */
  left = 0;
  top = 0;
  width = 0;
  height = 0;
  /** The scale it was last drawn at on the frame, and since when. */
  seenX = 0;
  seenY = 0;
  seenAt = 0;
  stale = false;
  used = 0;
  changedAt = 0;
  churn = 0;
  directUntil = 0;

  constructor(
    readonly host: CanvasHost,
    readonly raw: Canvas2DContext
  ) {
    this.ctx = new PreciseContext(raw);
  }
}

/** What an ancestor's dirt can say about how its descendants look. */
const INHERITED = DirtyFlags.Properties | DirtyFlags.Environment;

/** How long a scale must hold before what was kept at another is drawn again, sharp. */
export const SETTLE_MS = 120;

/** How far kept pixels are stretched, either way, before they are drawn again mid-zoom. */
const MAX_STRETCH = 3;

/** How many pixels a frame draws again for sharpness while a zoom moves: a phone frame or two. */
const MOVING_PIXELS = 500_000;

/** The same once it has settled: about a screen's worth, and the rest the next frame. */
const SETTLED_PIXELS = 8_000_000;

/** Layout pixels kept past the extent on each side, for antialiasing. */
const SPARE = 2;

/** The most one subtree is kept at: 4096², 64 MB. */
const MAX_RASTER_PIXELS = 16_777_216;

/** The longest side a canvas is made with; engines refuse longer. */
const MAX_SIDE = 8192;

/** The most all of them are kept at: 192 MB. */
const MAX_PIXELS = 50_331_648;

/**
 * Frames an entry is kept without being drawn: long, since a zoom in
 * culls what a zoom back out shows again, and drawing all of that anew
 * on its way back is the stutter the cache is for. \`MAX_PIXELS\` is
 * what bounds the memory.
 */
const IDLE_FRAMES = 3600;

/** Out of date this many frames apart, `CHURN_LIMIT` times running, and it is drawn directly. */
const CHURN_FRAMES = 3;
const CHURN_LIMIT = 3;

/** How long a subtree that churned, or that cannot be kept, is drawn directly. */
const DIRECT_FRAMES = 60;
