import type { UiNode } from '../graph/UiNode';
import type { UiEnvironment } from '../environment/UiEnvironment';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { UiImage } from '../properties/UiImage';
import { UiProperties } from '../properties/UiProperty';
import { resolveColor, resolveColorValue, resolveGradient } from '../properties/UiThemeColor';
import { EMPTY_RECORDING, PaintRecorder, replayPaint, type PaintRecording } from './PaintRecording';
import {
  PaintTarget,
  type PaintCanvas,
  type PaintCanvasFactory,
  type PaintContext2D,
  type PaintDeviceRect,
  type PaintMatrix,
  type PaintResolver
} from './PaintTarget';
import { paintValuesEqual, pathValuesEqual, type PaintBox, type UiPaint, type UiPath } from './PaintSurface';

export type { PaintCanvas, PaintCanvasFactory } from './PaintTarget';

/**
 * The largest picture that will be rasterised, per side, in physical
 * pixels.
 *
 * A painted node is sized by the layout, so a full-width waveform on a
 * wide display at two device pixels is already four thousand across,
 * and a node that a bug sized at a hundred thousand would ask for a
 * forty gigabyte bitmap. The cap turns that into a picture that is
 * merely wrong instead of a tab that dies.
 */
const MAX_PICTURE_SIDE = 8192;

/**
 * How many frames a picture that was changing must hold still before it
 * is rasterised on Canvas2D; until then it is replayed as it was while
 * it changed.
 *
 * One was the first value, and it is the bug this constant records. A
 * frame is not only drawn when a picture's inputs change: anything else
 * on screen changing draws one too. gessologic's live wires change on
 * every publish from the application worker, and its readout's frame
 * counter changes on every frame, so between two publishes there is
 * usually a frame in which the wires have not moved. One still frame
 * was taken as "settled", and each such frame rasterised a bitmap that
 * the next publish threw away — about 1.4 a frame at full speed, each a
 * fresh canvas. That is waste anywhere, and in software compositing it
 * was worse: allocating a canvas's pixels can wait on the page's main
 * thread, so while the page was blocked the render worker stalled on
 * the first such canvas and drew nothing for as long as the block
 * lasted.
 *
 * Four is about sixty-six milliseconds at 60Hz: longer than the gap
 * between publishes of anything animating, and short enough that a
 * picture which has truly stopped is a bitmap before anyone could tell.
 */
const SETTLE_FRAMES = 4;

/**
 * How long, in milliseconds, the scale a picture is drawn at must hold
 * before its bitmap is made again at that scale.
 *
 * A picture under a zoom is drawn at the whole transform's scale, so
 * text and lines in it stay sharp at 300% on a 2x display. While the
 * scale moves (a pinch, a zoom animation, a morph), the bitmap it has
 * is stretched instead, which is soft for a moment and keeps every step
 * of the zoom one `drawImage`. The same as `RasterCache`'s, so a kept
 * subtree and the pictures in it go sharp on the same frame.
 */
export const PICTURE_SETTLE_MS = 120;

/**
 * The most device pixels one zoomed picture is kept in: 16 MB.
 *
 * Above the device scale a bitmap grows with the square of the zoom: a
 * page-sized painter at 300% on a 2x display would be 31 million
 * pixels, almost all of it off screen. A picture that would be larger
 * than this, or than the surface, is replayed from its recording onto
 * every frame instead, which is sharp at any zoom, holds no pixels, and
 * costs what the painter's calls cost. At the device scale nothing
 * changes: the picture is a bitmap as it always was.
 */
const MAX_ZOOMED_PICTURE_PIXELS = 4_194_304;

/**
 * The device pixels all zoomed bitmaps together may hold, as a multiple
 * of the surface's. What is on screen fits in one surface, since
 * pictures seldom overlap: 59 MB on a 5K display at 2x. Past it, the
 * bitmaps drawn longest ago are let go, and made again if they are
 * drawn again; none drawn on the frame is.
 */
const ZOOMED_SURFACES = 1;

/** The least the zoomed bitmaps may hold, for a small surface: 32 MB. */
const MIN_ZOOMED_PIXELS = 8_388_608;

/** Frames a zoomed bitmap is kept without being drawn. */
const ZOOMED_IDLE_FRAMES = 600;

/** Pixels made sharp in one frame once a zoom settles; the rest the next frame. */
const SETTLED_PIXELS = 8_000_000;

interface PaintedSlot {
  picture: UiImage | null;
  /**
   * Whether `recording` has been turned into `picture` yet. A recording
   * drawn straight onto a Canvas2D context has not: it gets its bitmap
   * on the first frame its inputs stay put. See `draw`.
   */
  rasterized: boolean;
  /**
   * Frames left to replay before rasterising, after the recording was
   * replayed because its content changed. See `SETTLE_FRAMES`.
   */
  settling: number;
  recording: PaintRecording;
  paint: UiPaint | undefined;
  path: UiPath | undefined;
  clipPath: string | undefined;
  blur: number | undefined;
  environment: UiEnvironment | null;
  width: number;
  height: number;
  scale: number;
  /**
   * The scale the picture was last asked for, and when that started:
   * what a zoom settling is judged by. See `PICTURE_SETTLE_MS`.
   */
  seenScale: number;
  seenAt: number;
  /**
   * Replayed onto the frame rather than kept as a bitmap, because at
   * this scale it would be too large. See `MAX_ZOOMED_PICTURE_PIXELS`.
   */
  direct: boolean;
  /** The device scale it was drawn on: a bitmap above it counts against the zoomed budget. */
  base: number;
  /** The device pixels its bitmap holds, while it counts against that budget. */
  pixels: number;
  /** The frame it was last drawn in, for letting go of zoomed bitmaps. */
  used: number;
}

/** What a painted frame did, for `PaintPicture.budget.spec.ts`. */
export interface PaintStats {
  /** How many times a painter's `draw` ran. */
  recorded: number;
  /** How many times a recording was turned into a bitmap. */
  rasterized: number;
  /** How many times a renderer asked for a node's picture. */
  resolved: number;
  /**
   * How many times a new recording was replayed straight onto the
   * frame's context instead of into a bitmap. See `draw`.
   */
  direct: number;
  /**
   * How many bitmaps were made again at a new scale once a zoom
   * settled, and how many zoomed pictures were replayed onto the frame
   * because a bitmap of them would be too large.
   */
  resharpened: number;
  replayed: number;
}

/** The device pixels the zoomed bitmaps hold, for specs and for measuring. */
export interface ZoomedPictureMemory {
  pictures: number;
  pixels: number;
}

/**
 * The pictures painted nodes have produced, keyed by node.
 *
 * **One cache, shared by both backends, and that is the design.** The
 * obvious alternative is for each renderer to replay the recording in
 * its own vocabulary, which this declines: WebGPU has no path
 * pipeline, so a native replay there would mean tessellation, a second
 * rasteriser and two implementations of every fill rule to keep in
 * step. Rasterising once and handing the same bitmap to both means the
 * two backends cannot disagree about a painted node, because there is
 * nothing for them to disagree about. What the parity gate then checks
 * is what remains: that both place the same picture in the same box,
 * at the same point in paint order, under the same clip and opacity.
 *
 * **A picture that changes every frame is the exception**, on Canvas2D:
 * `draw` replays its new recording straight onto the frame and makes a
 * bitmap only on the first frame its inputs hold still. The parity
 * claim is kept where it is made — both backends draw the same bitmap of
 * a settled picture, and a changing one is the same recording through
 * the same `PaintTarget` — and a canvas whose layers move every frame
 * stops paying for a bitmap per layer per frame that nobody draws twice.
 *
 * **The cost follows the change.** A frame that draws a painted node
 * whose inputs, box, scale and theme are unchanged makes no recording
 * and no bitmap; it draws the one already here. The key holds the
 * `paint` and `path` values (compared as the property registry
 * compares them), the box, the device scale, and the node's
 * environment, which a theme swap replaces, so the light and dark
 * toggle repaints a picture without a painter knowing there was a
 * theme.
 *
 * A `WeakMap` rather than a `Map`: a node removed from the tree takes
 * its slot and its bitmap with it, without the graph having to know
 * that pictures exist.
 */
export class PaintPictureCache {
  private readonly slots = new WeakMap<UiNode, PaintedSlot>();
  /**
   * The slots whose bitmap is above the device scale they were drawn
   * at, by node, oldest drawn first: the only ones that count against
   * the zoomed budget, and the only ones let go. A `Map` rather than
   * the `WeakMap`, so it can be walked; a removed node leaves it when
   * it has not been drawn for `ZOOMED_IDLE_FRAMES` or the budget is met.
   */
  private readonly zoomed = new Map<UiNode, PaintedSlot>();
  private zoomedPixels = 0;
  private frame = 0;
  private surfacePixels = Infinity;
  /** Pixels made sharp this frame; see `SETTLED_PIXELS`. */
  private spent = 0;
  private wanted: number | undefined = undefined;
  private createCanvas: PaintCanvasFactory;
  readonly stats: PaintStats = { recorded: 0, rasterized: 0, resolved: 0, direct: 0, resharpened: 0, replayed: 0 };

  constructor(createCanvas: PaintCanvasFactory = offscreenPaintCanvas) {
    this.createCanvas = createCanvas;
  }

  /** Swaps the canvas the rasteriser draws into. For specs and for a host without one. */
  setCanvasFactory(factory: PaintCanvasFactory): void {
    this.createCanvas = factory;
  }

  resetStats(): void {
    this.stats.recorded = 0;
    this.stats.rasterized = 0;
    this.stats.resolved = 0;
    this.stats.direct = 0;
    this.stats.resharpened = 0;
    this.stats.replayed = 0;
  }

  /**
   * Starts a Canvas2D frame: what the zoom budget is measured against,
   * and when the next settled picture is due.
   */
  beginFrame(surfacePixels = Infinity): void {
    this.frame++;
    this.spent = 0;
    this.wanted = undefined;
    this.surfacePixels = surfacePixels;
  }

  /**
   * Ends a Canvas2D frame: lets go of the zoomed bitmaps not drawn for
   * a while, then of the ones drawn longest ago while they hold more
   * than the budget. None drawn this frame is let go.
   */
  endFrame(): void {
    if (this.zoomed.size === 0) {
      return;
    }
    for (const [node, slot] of this.zoomed) {
      if (this.frame - slot.used > ZOOMED_IDLE_FRAMES) {
        this.release(node, slot);
      }
    }
    const budget = Math.max(MIN_ZOOMED_PIXELS, ZOOMED_SURFACES * this.surfacePixels);
    if (this.zoomedPixels <= budget) {
      return;
    }
    const oldest = [...this.zoomed].filter(([, slot]) => slot.used < this.frame).sort((a, b) => a[1].used - b[1].used);
    for (const [node, slot] of oldest) {
      if (this.zoomedPixels <= budget) {
        break;
      }
      this.release(node, slot);
    }
  }

  /**
   * When the frame just drawn would like another though nothing
   * changes: a zoom settling, whose pictures are then made sharp at the
   * scale it stopped at. Undefined when nothing waits.
   */
  get nextRepaint(): number | undefined {
    return this.wanted;
  }

  /** What the zoomed bitmaps hold now. */
  get zoomedMemory(): ZoomedPictureMemory {
    return { pictures: this.zoomed.size, pixels: this.zoomedPixels };
  }

  /**
   * The node's picture at this box and device scale, made if the
   * inputs have moved and reused if they have not.
   *
   * Undefined when the node paints nothing, when the box has no area,
   * or when the host could not give the rasteriser a context, which is
   * how a picture degrades: the rest of the node still draws.
   */
  pictureFor(node: UiNode, rec: LayoutRecord, scale: number): UiImage | undefined {
    this.stats.resolved++;
    const key = keyFor(node, rec, scale);
    if (key === null) {
      return undefined;
    }
    const slot = this.slots.get(node);
    if (slot !== undefined && matches(slot, key)) {
      return this.pictureOf(node, slot, key.box) ?? undefined;
    }
    const recording = this.record(key.paint, key.path, key.clipPath, key.blur, key.box);
    const next = this.remember(node, slot, key, recording);
    return this.pictureOf(node, next, key.box) ?? undefined;
  }

  /**
   * Draws a node's picture onto a Canvas2D frame, making a bitmap only
   * when one will be drawn more than once.
   *
   * `pictureFor` rasterises every new recording into a bitmap, which
   * pays for itself when the picture is drawn again — a chart that
   * changed once and is panned for a minute. It does not when the
   * picture changes every frame: the bitmap is drawn once and thrown
   * away, and the frame has paid for a canvas cleared, a separate
   * flush, and a composite of every pixel of it. gessologic's canvas
   * redraws a layer of live wires per tile per frame, and in software
   * rendering `transferToImageBitmap` alone was a quarter of the render
   * worker's time.
   *
   * So a recording made because the painter's inputs changed is
   * replayed straight onto the frame's context, clipped to the node's
   * box, and no bitmap is made. Once it has held still for
   * `SETTLE_FRAMES` frames it makes the bitmap and draws that from there
   * on, exactly as `pictureFor` would. A picture that changes every
   * frame, or nearly every frame, is never rasterised; one that settles
   * is rasterised once, a few frames late.
   * A picture seen for the first time, or at a new size, is rasterised
   * at once, because it most likely holds still.
   *
   * **At the scale it lands at.** The bitmap is made at the whole
   * transform's scale, not the device's alone, so a picture under a
   * zoom is as sharp at 300% as at 100%. While that scale moves, the
   * bitmap it has is stretched (see `PICTURE_SETTLE_MS`), and the answer
   * is true: the frame is not one a scroll layer should keep. Once it
   * has held, the bitmap is made again, a frame's worth at a time, and
   * `nextRepaint` asks for the frame that does it. A picture that would
   * be too large at that scale is replayed onto every frame instead
   * (see `MAX_ZOOMED_PICTURE_PIXELS`), and the zoomed bitmaps together
   * are held to a budget (`ZOOMED_SURFACES`).
   *
   * `now` is the frame's clock; `settled` says the scale is final
   * already, as it is inside a subtree `RasterCache` is drawing again
   * once its own zoom settled.
   *
   * Canvas2D only. WebGPU has no path pipeline to replay onto, which is
   * the reason the cache exists (see the class comment), and asks
   * `pictureFor`, at the device scale. The two backends then differ
   * only in when the pixels of a changing picture are made, and in how
   * sharp a zoomed one is, not in what it shows: both come from the
   * same recording through the same `PaintTarget`.
   */
  draw(node: UiNode, rec: LayoutRecord, deviceScale: number, ctx: PaintContext2D, now = 0, settled = false): boolean {
    this.stats.resolved++;
    const m = ctx.getTransform?.();
    const target = m === undefined ? deviceScale : pictureScale(m, deviceScale);
    const slot = this.slots.get(node);
    const scale = settled ? target : this.scaleToDraw(node, slot, rec, target, now);
    const key = keyFor(node, rec, scale);
    if (key === null) {
      return false;
    }
    const stretched = scale !== target;
    if (slot !== undefined && matches(slot, key)) {
      slot.used = this.frame;
      if (slot.direct) {
        this.stats.replayed++;
        this.replay(node, slot.recording, rec, ctx);
        return stretched;
      }
      if (!slot.rasterized && slot.settling > 0) {
        // Unchanged, but it was changing a moment ago; it has to hold
        // still a little longer before a bitmap is worth making.
        slot.settling--;
        this.replay(node, slot.recording, rec, ctx);
        return stretched;
      }
      const picture = this.pictureOf(node, slot, key.box);
      if (picture !== null) {
        place(ctx, picture, rec, m, stretched ? undefined : scale, deviceScale);
      }
      return stretched;
    }
    const recording = this.record(key.paint, key.path, key.clipPath, key.blur, key.box);
    const next = this.remember(node, slot, key, recording, deviceScale, target, now);
    if (recording.ops.length === 0) {
      return false;
    }
    if (next.direct) {
      this.stats.replayed++;
      this.replay(node, recording, rec, ctx);
      return false;
    }
    // Only a change of what the painter draws is taken as a sign the
    // picture moves every frame. A node seen for the first time, or
    // resized, or re-themed, most likely holds still from here, so its
    // bitmap is made now — replaying it this frame and rasterising it
    // the next would draw it twice. gessologic's zoom found this: every
    // tile a new grid brought in had its static layers drawn twice.
    if (slot === undefined || !contentChanged(slot, key)) {
      const picture = this.pictureOf(node, next, key.box);
      if (picture !== null) {
        place(ctx, picture, rec, m, scale, deviceScale);
      }
      return false;
    }
    next.settling = SETTLE_FRAMES - 1;
    this.replay(node, recording, rec, ctx);
    return false;
  }

  /**
   * The scale to draw a picture at this frame: the one it lands at,
   * unless the picture is unchanged but for that and the scale is still
   * moving, when it is the one its bitmap was made at, to be stretched.
   */
  private scaleToDraw(
    node: UiNode,
    slot: PaintedSlot | undefined,
    rec: LayoutRecord,
    target: number,
    now: number
  ): number {
    if (slot === undefined || slot.scale === target) {
      return target;
    }
    const held = keyFor(node, rec, slot.scale);
    if (held === null || !matches(slot, held)) {
      // Made again anyway, so at the scale it lands at.
      return target;
    }
    if (slot.seenScale !== target) {
      slot.seenScale = target;
      slot.seenAt = now;
    }
    if (now - slot.seenAt < PICTURE_SETTLE_MS) {
      this.want(slot.seenAt + PICTURE_SETTLE_MS);
      return slot.scale;
    }
    // Settled. A frame's worth at a time, so the frame the zoom stops on
    // is not the one that makes every picture on screen again.
    const pixels = Math.round(rec.width * target) * Math.round(rec.height * target);
    if (this.spent === 0 || this.spent + pixels <= SETTLED_PIXELS) {
      this.spent += pixels;
      this.stats.resharpened++;
      return target;
    }
    this.want(now + 1);
    return slot.scale;
  }

  private want(at: number): void {
    this.wanted = this.wanted === undefined ? at : Math.min(this.wanted, at);
  }

  /** A recording drawn straight onto the frame, clipped to the box its bitmap would fill. */
  private replay(node: UiNode, recording: PaintRecording, rec: LayoutRecord, ctx: PaintContext2D): void {
    this.stats.direct++;
    ctx.save();
    ctx.translate(rec.x, rec.y);
    ctx.beginPath();
    ctx.rect(0, 0, rec.width, rec.height);
    ctx.clip();
    // A masked layer is cut to the box on the frame, as the bitmap would be.
    const m = ctx.getTransform?.();
    const layers =
      m === undefined ? undefined : { create: this.createCanvas, bounds: deviceBox(m, rec.width, rec.height) };
    replayPaint(recording, new PaintTarget(ctx, resolverFor(node), layers));
    ctx.restore();
  }

  /** A slot's bitmap, made now if it has not been. */
  private pictureOf(node: UiNode, slot: PaintedSlot, box: PaintBox): UiImage | null {
    if (!slot.rasterized) {
      slot.picture = this.rasterize(node, slot.recording, box);
      slot.rasterized = true;
      if (slot.picture !== null && slot.scale > slot.base) {
        slot.pixels = slot.picture.width * slot.picture.height;
        this.zoomed.set(node, slot);
        this.zoomedPixels += slot.pixels;
      }
    }
    return slot.picture;
  }

  private remember(
    node: UiNode,
    previous: PaintedSlot | undefined,
    key: SlotKey,
    recording: PaintRecording,
    deviceScale: number = key.box.scale,
    target: number = key.box.scale,
    now: number = 0
  ): PaintedSlot {
    // The old bitmap is released now rather than when the collector
    // gets to it: a chart repainting on a stream would otherwise hold
    // every frame it has ever drawn until it did.
    if (previous !== undefined) {
      this.release(node, previous);
    }
    const scale = key.box.scale;
    const pixels = Math.round(key.box.width * scale) * Math.round(key.box.height * scale);
    const slot: PaintedSlot = {
      picture: null,
      rasterized: false,
      settling: 0,
      recording,
      paint: key.paint,
      path: key.path,
      clipPath: key.clipPath,
      blur: key.blur,
      environment: node.environment,
      width: key.box.width,
      height: key.box.height,
      scale,
      seenScale: target,
      seenAt: now,
      direct: scale > deviceScale && pixels > Math.min(MAX_ZOOMED_PICTURE_PIXELS, this.surfacePixels),
      base: deviceScale,
      pixels: 0,
      used: this.frame
    };
    this.slots.set(node, slot);
    return slot;
  }

  /** Lets go of a slot's bitmap, and of what it counted against the zoomed budget. */
  private release(node: UiNode, slot: PaintedSlot): void {
    slot.picture?.close?.();
    slot.picture = null;
    slot.rasterized = false;
    if (this.zoomed.get(node) === slot) {
      this.zoomed.delete(node);
      this.zoomedPixels -= slot.pixels;
    }
    slot.pixels = 0;
  }

  /**
   * The recording a node's picture was made from.
   *
   * The parity gate and the inspector both want to ask what a painted
   * node actually drew, and a bitmap cannot answer. Empty for a node
   * that has not been painted yet.
   */
  recordingFor(node: UiNode): PaintRecording {
    return this.slots.get(node)?.recording ?? EMPTY_RECORDING;
  }

  private record(
    paint: UiPaint | undefined,
    path: UiPath | undefined,
    clipPath: string | undefined,
    blur: number | undefined,
    box: PaintBox
  ): PaintRecording {
    this.stats.recorded++;
    const recorder = new PaintRecorder();
    // `clipPath` and `blur` are properties of the node rather than
    // calls a painter makes, so they wrap everything the node draws:
    // the rounded mask and the frosted panel a design asks for first,
    // without the painter restating them.
    if (clipPath !== undefined) {
      recorder.beginPath();
      recorder.path(clipPath);
      recorder.clip();
    }
    if (blur !== undefined && blur > 0) {
      recorder.blur(blur);
    }
    if (path !== undefined) {
      drawPath(recorder, path, box);
    }
    paint?.draw(recorder, box);
    return recorder.finish();
  }

  private rasterize(node: UiNode, recording: PaintRecording, box: PaintBox): UiImage | null {
    if (recording.ops.length === 0) {
      return null;
    }
    const width = Math.min(MAX_PICTURE_SIDE, Math.max(1, Math.round(box.width * box.scale)));
    const height = Math.min(MAX_PICTURE_SIDE, Math.max(1, Math.round(box.height * box.scale)));
    const canvas = this.createCanvas(width, height);
    const ctx = canvas?.context() ?? null;
    if (canvas === null || ctx === null) {
      return null;
    }
    this.stats.rasterized++;
    // The picture is drawn in logical pixels and the one transform
    // here puts it in the bitmap's physical ones, which is the same
    // trick `IconRasterizer` plays with the viewBox: nothing below
    // this line has to know what a device pixel ratio is.
    ctx.scale(box.scale, box.scale);
    replayPaint(
      recording,
      new PaintTarget(ctx, resolverFor(node), { create: this.createCanvas, bounds: { x: 0, y: 0, width, height } })
    );
    return canvas.take();
  }
}

/**
 * The cache the renderers use.
 *
 * Module level, like `FontStacks`, and for the same reason: two
 * backends drawing the same tree have to reach the same one, and
 * threading a cache through `render()` and `buildRenderList()` would
 * make it possible for them not to.
 */
export const paintPictures = new PaintPictureCache();

/** The device pixels a box at the origin covers under a transform. */
function deviceBox(
  m: { a: number; b: number; c: number; d: number; e: number; f: number },
  width: number,
  height: number
): PaintDeviceRect {
  const xs = [m.e, m.a * width + m.e, m.c * height + m.e, m.a * width + m.c * height + m.e];
  const ys = [m.f, m.b * width + m.f, m.d * height + m.f, m.b * width + m.d * height + m.f];
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, width: Math.ceil(Math.max(...xs)) - x, height: Math.ceil(Math.max(...ys)) - y };
}

/** Everything a slot's picture depends on, read off the node and its box. */
interface SlotKey {
  readonly paint: UiPaint | undefined;
  readonly path: UiPath | undefined;
  readonly clipPath: string | undefined;
  readonly blur: number | undefined;
  readonly environment: UiEnvironment | null;
  readonly box: PaintBox;
}

/** The key for a node's picture, or null when it paints nothing or its box has no area. */
function keyFor(node: UiNode, rec: LayoutRecord, scale: number): SlotKey | null {
  const paint = node.properties.get('paint') as UiPaint | undefined;
  const path = node.properties.get('path') as UiPath | undefined;
  if (paint === undefined && path === undefined) {
    return null;
  }
  if (!(rec.width > 0) || !(rec.height > 0)) {
    return null;
  }
  return {
    paint,
    path,
    clipPath: node.properties.get('clipPath') as string | undefined,
    blur: node.properties.get('blur') as number | undefined,
    environment: node.environment,
    box: {
      width: rec.width,
      height: rec.height,
      paddingTop: rec.paddingTop,
      paddingRight: rec.paddingRight,
      paddingBottom: rec.paddingBottom,
      paddingLeft: rec.paddingLeft,
      scale
    }
  };
}

/** Whether what the painter draws changed, as against where or at what size it is drawn. */
function contentChanged(slot: PaintedSlot, key: SlotKey): boolean {
  return (
    slot.clipPath !== key.clipPath ||
    slot.blur !== key.blur ||
    !paintValuesEqual(slot.paint, key.paint) ||
    !pathValuesEqual(slot.path, key.path)
  );
}

function matches(slot: PaintedSlot, key: SlotKey): boolean {
  return (
    slot.width === key.box.width &&
    slot.height === key.box.height &&
    slot.scale === key.box.scale &&
    slot.environment === key.environment &&
    slot.clipPath === key.clipPath &&
    slot.blur === key.blur &&
    paintValuesEqual(slot.paint, key.paint) &&
    pathValuesEqual(slot.path, key.path)
  );
}

/**
 * A painter's colour values, against the node's own theme. \`currentColor\`
 * is the node's text colour, inherited as CSS's is, so an icon drawn in
 * it takes the colour of the label beside it: white on a selected row.
 */
function resolverFor(node: UiNode): PaintResolver {
  return {
    color: value =>
      value === 'currentColor'
        ? (resolveColor(node, UiProperties.color) ?? resolveColorValue(node, 'text'))
        : resolveColorValue(node, value),
    gradient: value => resolveGradient(node, value)
  };
}

/**
 * A `path` property, as calls on a surface.
 *
 * The viewBox is fitted as `object-fit: contain` fits an image, which
 * is what an icon grid expects and what makes a 24-unit path land
 * correctly in a box of any size. Stroke width is in viewBox units
 * too, so a path scaled up keeps its proportions rather than growing a
 * hairline.
 */
function drawPath(surface: PaintRecorder, path: UiPath, box: PaintBox): void {
  const inner = {
    width: Math.max(0, box.width - box.paddingLeft - box.paddingRight),
    height: Math.max(0, box.height - box.paddingTop - box.paddingBottom)
  };
  if (!(inner.width > 0) || !(inner.height > 0)) {
    return;
  }
  surface.save();
  surface.translate(box.paddingLeft, box.paddingTop);
  if (path.viewBox !== undefined && path.viewBox > 0) {
    const unit = Math.min(inner.width / path.viewBox, inner.height / path.viewBox);
    surface.translate((inner.width - path.viewBox * unit) / 2, (inner.height - path.viewBox * unit) / 2);
    surface.scale(unit, unit);
  }
  surface.beginPath();
  surface.path(path.d);
  if (path.fill !== undefined) {
    surface.fillColor(path.fill);
    surface.fill(path.fillRule ?? 'nonzero');
  }
  const strokeWidth = path.strokeWidth ?? 0;
  if (path.stroke !== undefined && strokeWidth > 0) {
    surface.strokeColor(path.stroke);
    surface.lineWidth(strokeWidth);
    surface.lineCap(path.lineCap ?? 'butt');
    surface.lineJoin(path.lineJoin ?? 'miter');
    if (path.miterLimit !== undefined) {
      surface.miterLimit(path.miterLimit);
    }
    if (path.dash !== undefined && path.dash.length > 0) {
      surface.lineDash(path.dash, path.dashOffset ?? 0);
    }
    surface.stroke();
  }
  surface.restore();
}

/**
 * `OffscreenCanvas` on the main thread and in a worker, which is what
 * lets a picture be made wherever the runtime lives. The same property
 * `IconRasterizer` relies on, and the reason `UiImage` is an
 * `ImageBitmap`: both backends already know how to draw one.
 */
function offscreenPaintCanvas(width: number, height: number): PaintCanvas | null {
  if (typeof OffscreenCanvas !== 'function') {
    return null;
  }
  const canvas = new OffscreenCanvas(width, height);
  return {
    context: () => canvas.getContext('2d') as unknown as PaintContext2D | null,
    // Transferring rather than copying: it hands back the bitmap the
    // canvas already holds and leaves the canvas blank, so a picture
    // costs one allocation instead of two, and costs nothing at all
    // asynchronously.
    take: () => canvas.transferToImageBitmap()
  };
}

/**
 * Physical pixels per logical pixel under a transform: the device scale
 * times any zoom or scale above the node. The device scale itself when
 * that is all there is, so a picture at 100% is made exactly as it
 * always was; otherwise to a 256th, so a zoom of 110% on a 2x display
 * is one scale and not a rounding error a frame.
 */
export function pictureScale(m: { a: number; b: number; c: number; d: number }, deviceScale: number): number {
  const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  if (!(scale > 0) || !Number.isFinite(scale) || Math.abs(scale - deviceScale) < 1e-6) {
    return deviceScale;
  }
  return Math.round(scale * 256) / 256;
}

/**
 * Draws a picture in its box. A zoomed one made at the scale it lands
 * at, under no rotation or skew, is copied one pixel to one onto whole
 * device pixels, so it is as sharp as it was drawn; the box's corner
 * moves by under half a device pixel. At the device scale, or
 * stretched, it is drawn into its box as it always was.
 */
function place(
  ctx: PaintContext2D,
  picture: UiImage,
  rec: LayoutRecord,
  m: PaintMatrix | undefined,
  scale: number | undefined,
  deviceScale: number
): void {
  if (
    scale === undefined ||
    scale === deviceScale ||
    m === undefined ||
    ctx.setTransform === undefined ||
    m.b !== 0 ||
    m.c !== 0 ||
    Math.abs(m.a - scale) > 1e-3 ||
    Math.abs(m.d - scale) > 1e-3
  ) {
    ctx.drawImage(picture, rec.x, rec.y, rec.width, rec.height);
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(picture, Math.round(m.a * rec.x + m.e), Math.round(m.d * rec.y + m.f), picture.width, picture.height);
  ctx.restore();
}
