import type { UiNode } from '../graph/UiNode';
import type { UiEnvironment } from '../environment/UiEnvironment';
import type { LayoutRecord } from '../layout/LayoutRecord';
import type { UiImage } from '../properties/UiImage';
import { resolveColorValue, resolveGradient } from '../properties/UiThemeColor';
import { EMPTY_RECORDING, PaintRecorder, replayPaint, type PaintRecording } from './PaintRecording';
import { PaintTarget, type PaintContext2D, type PaintResolver } from './PaintTarget';
import { paintValuesEqual, pathValuesEqual, type PaintBox, type UiPaint, type UiPath } from './PaintSurface';

/**
 * The canvas a picture is drawn into, and the bitmap it becomes.
 *
 * `IconCanvas`'s sibling, and injectable for the same two reasons: the
 * suite has no `OffscreenCanvas`, and a host that lacks one should
 * fail by drawing nothing rather than by throwing in a frame.
 *
 * `take()` is synchronous, which is the whole reason the default is
 * `transferToImageBitmap` and not `createImageBitmap`. An asynchronous
 * raster would put the picture a frame behind its inputs and would
 * need a way to ask for another frame from inside a renderer, which no
 * renderer has and none should.
 */
export interface PaintCanvas {
  context(): PaintContext2D | null;
  take(): UiImage;
}

export type PaintCanvasFactory = (width: number, height: number) => PaintCanvas | null;

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
  private createCanvas: PaintCanvasFactory;
  readonly stats: PaintStats = { recorded: 0, rasterized: 0, resolved: 0, direct: 0 };

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
   * Canvas2D only. WebGPU has no path pipeline to replay onto, which is
   * the reason the cache exists (see the class comment), and asks
   * `pictureFor`. The two backends then differ only in when the pixels
   * of a changing picture are made, not in which: both come from the
   * same recording through the same `PaintTarget`.
   */
  draw(node: UiNode, rec: LayoutRecord, scale: number, ctx: PaintContext2D): void {
    this.stats.resolved++;
    const key = keyFor(node, rec, scale);
    if (key === null) {
      return;
    }
    const slot = this.slots.get(node);
    if (slot !== undefined && matches(slot, key)) {
      if (!slot.rasterized && slot.settling > 0) {
        // Unchanged, but it was changing a moment ago; it has to hold
        // still a little longer before a bitmap is worth making.
        slot.settling--;
        this.replay(node, slot.recording, rec, ctx);
        return;
      }
      const picture = this.pictureOf(node, slot, key.box);
      if (picture !== null) {
        ctx.drawImage(picture, rec.x, rec.y, rec.width, rec.height);
      }
      return;
    }
    const recording = this.record(key.paint, key.path, key.clipPath, key.blur, key.box);
    const next = this.remember(node, slot, key, recording);
    if (recording.ops.length === 0) {
      return;
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
        ctx.drawImage(picture, rec.x, rec.y, rec.width, rec.height);
      }
      return;
    }
    next.settling = SETTLE_FRAMES - 1;
    this.replay(node, recording, rec, ctx);
  }

  /** A recording drawn straight onto the frame, clipped to the box its bitmap would fill. */
  private replay(node: UiNode, recording: PaintRecording, rec: LayoutRecord, ctx: PaintContext2D): void {
    this.stats.direct++;
    ctx.save();
    ctx.translate(rec.x, rec.y);
    ctx.beginPath();
    ctx.rect(0, 0, rec.width, rec.height);
    ctx.clip();
    replayPaint(recording, new PaintTarget(ctx, resolverFor(node)));
    ctx.restore();
  }

  /** A slot's bitmap, made now if it has not been. */
  private pictureOf(node: UiNode, slot: PaintedSlot, box: PaintBox): UiImage | null {
    if (!slot.rasterized) {
      slot.picture = this.rasterize(node, slot.recording, box);
      slot.rasterized = true;
    }
    return slot.picture;
  }

  private remember(
    node: UiNode,
    previous: PaintedSlot | undefined,
    key: SlotKey,
    recording: PaintRecording
  ): PaintedSlot {
    // The old bitmap is released now rather than when the collector
    // gets to it: a chart repainting on a stream would otherwise hold
    // every frame it has ever drawn until it did.
    previous?.picture?.close?.();
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
      scale: key.box.scale
    };
    this.slots.set(node, slot);
    return slot;
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
    replayPaint(recording, new PaintTarget(ctx, resolverFor(node)));
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

/** A painter's colour values, against the node's own theme. */
function resolverFor(node: UiNode): PaintResolver {
  return {
    color: value => resolveColorValue(node, value),
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
