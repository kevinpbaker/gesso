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

interface PaintedSlot {
  picture: UiImage | null;
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
  readonly stats: PaintStats = { recorded: 0, rasterized: 0, resolved: 0 };

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
    const paint = node.properties.get('paint') as UiPaint | undefined;
    const path = node.properties.get('path') as UiPath | undefined;
    if (paint === undefined && path === undefined) {
      return undefined;
    }
    if (!(rec.width > 0) || !(rec.height > 0)) {
      return undefined;
    }
    const clipPath = node.properties.get('clipPath') as string | undefined;
    const blur = node.properties.get('blur') as number | undefined;
    const slot = this.slots.get(node);
    if (
      slot !== undefined &&
      slot.picture !== null &&
      slot.width === rec.width &&
      slot.height === rec.height &&
      slot.scale === scale &&
      slot.environment === node.environment &&
      slot.clipPath === clipPath &&
      slot.blur === blur &&
      paintValuesEqual(slot.paint, paint) &&
      pathValuesEqual(slot.path, path)
    ) {
      return slot.picture;
    }

    const box: PaintBox = {
      width: rec.width,
      height: rec.height,
      paddingTop: rec.paddingTop,
      paddingRight: rec.paddingRight,
      paddingBottom: rec.paddingBottom,
      paddingLeft: rec.paddingLeft,
      scale
    };
    const recording = this.record(paint, path, clipPath, blur, box);
    const picture = this.rasterize(node, recording, box);
    // The old bitmap is released now rather than when the collector
    // gets to it: a chart repainting on a stream would otherwise hold
    // every frame it has ever drawn until it did.
    slot?.picture?.close?.();
    this.slots.set(node, {
      picture,
      recording,
      paint,
      path,
      clipPath,
      blur,
      environment: node.environment,
      width: rec.width,
      height: rec.height,
      scale
    });
    return picture ?? undefined;
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
