import type { UiColor } from '../properties/UiColor';
import type { UiColorValue } from '../properties/UiPropertyValues';
import type { ResolvedGradient, UiGradient } from '../properties/UiGradient';
import { gradientPaint } from '../properties/UiGradient';
import type { UiImage } from '../properties/UiImage';
import { colorToCss, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_FONT_WEIGHT } from './PaintState';
import { fontStackFor } from './FontStacks';
import { tracePathData } from './PaintPathData';
import type {
  PaintFillRule,
  PaintLineCap,
  PaintLineJoin,
  PaintMaskMode,
  PaintSurface,
  PaintTextStyle
} from './PaintSurface';

/**
 * The 2D context a picture is drawn into.
 *
 * Named separately from `Canvas2DContext` for the reason `IconContext`
 * is: this is the rasteriser's list, not the renderer's, and the two
 * want different things. A picture never draws a paragraph, so nothing
 * here measures text; a picture does draw dashes, curves and blurs,
 * none of which the node renderer has ever needed. Both a real
 * `OffscreenCanvasRenderingContext2D` and a spec double satisfy it
 * structurally.
 */
export interface PaintContext2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  closePath(): void;
  fill(fillRule?: PaintFillRule): void;
  stroke(): void;
  clip(fillRule?: PaintFillRule): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: UiImage, dx: number, dy: number, dw: number, dh: number): void;
  setLineDash(segments: readonly number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): PaintGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): PaintGradient;
  lineDashOffset: number;
  lineWidth: number;
  lineCap: PaintLineCap;
  lineJoin: PaintLineJoin;
  miterLimit: number;
  globalAlpha: number;
  /**
   * A CSS filter list. Blur is the only one used, and it is a context
   * property rather than a draw argument, so `save` and `restore`
   * scope it exactly as `PaintSurface.blur` promises.
   *
   * Optional because a double has no reason to carry it, and because
   * a host without filter support should draw an unblurred picture
   * rather than none.
   */
  filter?: string;
  /**
   * What a masked layer needs of a context, all optional for the reason
   * `filter` is: a host or a double without them draws the layer's
   * content unmasked. The context drawn into reads and sets its whole
   * transform, to place a layer in device pixels; a layer's own canvas
   * also composites and reads its pixels back.
   */
  getTransform?(): PaintMatrix;
  setTransform?(a: number, b: number, c: number, d: number, e: number, f: number): void;
  globalCompositeOperation?: string;
  getImageData?(x: number, y: number, width: number, height: number): PaintPixels;
  putImageData?(pixels: PaintPixels, x: number, y: number): void;
  fillStyle: string | PaintGradient;
  strokeStyle: string | PaintGradient;
  font: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'alphabetic';
}

/** An affine matrix to device pixels, `a b c d e f`, as `getTransform` reports one. */
export interface PaintMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/** A context's pixels, unpremultiplied RGBA, as `getImageData` reads them. */
export interface PaintPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

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
 * Where a target's masked layers come from: a canvas per layer, and the
 * rectangle of the context drawn into, in its device pixels, that a
 * layer is cut to. Without one a target draws a layer's content
 * unmasked.
 */
export interface PaintLayers {
  readonly create: PaintCanvasFactory;
  readonly bounds: PaintDeviceRect;
}

/** A rectangle in device pixels. */
export interface PaintDeviceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The part of a canvas gradient a picture uses. */
export interface PaintGradient {
  addColorStop(offset: number, color: string): void;
}

/** How a painted node's colour values become colours. */
export interface PaintResolver {
  /** A `UiColor`, a CSS string, or a palette name against the node's theme. */
  color(value: UiColorValue): UiColor | undefined;
  gradient(value: UiGradient): ResolvedGradient | undefined;
}

/**
 * A `PaintSurface` that draws, rather than records.
 *
 * The second implementation of the vocabulary and the only one that
 * makes pixels. It is not a backend: it is handed an offscreen 2D
 * context by `PaintPicture.ts`, and the bitmap that comes out is what
 * both renderers draw. So there is one implementation of an even-odd
 * fill and one of a dash pattern in the tree, which is the property
 * the paint hook asks for, and the reason it
 * cannot fork the renderers.
 *
 * Colour values are resolved here rather than at record time, so a
 * painter may name a palette entry and the picture follows the light
 * and dark toggle: the resolver is bound to the node, and a theme
 * change replaces the node's environment, which is part of the
 * picture's cache key.
 */
export class PaintTarget implements PaintSurface {
  /**
   * The pending blur radius per save level.
   *
   * Tracked rather than read back off the context because `filter` is
   * optional here: a context that does not carry one still has to see
   * the rest of the drawing.
   */
  private readonly blurStack: number[] = [];
  private blurRadius = 0;
  /** The context drawn into now: the one given, or a layer's while its content or mask is drawn. */
  private ctx: PaintContext2D;
  /** The masked layers begun and not yet ended, innermost last. */
  private readonly layers: MaskedLayer[] = [];
  /**
   * How many layers are drawing nothing at the moment: one cut to
   * nothing, or a mask a host could not keep apart. Fills, strokes,
   * text and images are dropped while it is above zero.
   */
  private suppressed = 0;

  constructor(
    ctx: PaintContext2D,
    private readonly resolver: PaintResolver,
    private readonly layerSource?: PaintLayers
  ) {
    this.ctx = ctx;
  }

  save(): void {
    this.blurStack.push(this.blurRadius);
    this.ctx.save();
  }

  restore(): void {
    this.blurRadius = this.blurStack.pop() ?? 0;
    this.ctx.restore();
  }

  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  scale(x: number, y: number): void {
    this.ctx.scale(x, y);
  }

  rotate(angle: number): void {
    this.ctx.rotate(angle);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.transform(a, b, c, d, e, f);
  }

  beginPath(): void {
    this.ctx.beginPath();
  }

  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.ctx.quadraticCurveTo(cx, cy, x, y);
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false): void {
    this.ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise);
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.ctx.rect(x, y, width, height);
  }

  /**
   * Traced with `arcTo` rather than the context's own `roundRect`, for
   * the reason `traceRoundedRect` gives: the newer call is not
   * depended on anywhere else in the renderer and there is nothing to
   * gain by depending on it here.
   */
  roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    if (!(r > 0)) {
      this.ctx.rect(x, y, width, height);
      return;
    }
    this.ctx.moveTo(x + r, y);
    this.ctx.arcTo(x + width, y, x + width, y + height, r);
    this.ctx.arcTo(x + width, y + height, x, y + height, r);
    this.ctx.arcTo(x, y + height, x, y, r);
    this.ctx.arcTo(x, y, x + width, y, r);
    this.ctx.closePath();
  }

  closePath(): void {
    this.ctx.closePath();
  }

  path(d: string): void {
    // Path data is expanded by the recorder, so a target only ever
    // sees the calls it names. Kept for the interface, and correct if
    // a caller ever drives a target directly.
    tracePathData(this, d);
  }

  fillColor(color: UiColorValue): void {
    const resolved = this.resolver.color(color);
    this.ctx.fillStyle = resolved === undefined ? 'transparent' : colorToCss(resolved);
  }

  fillGradient(gradient: UiGradient, x: number, y: number, width: number, height: number): void {
    const resolved = this.resolver.gradient(gradient);
    if (resolved === undefined) {
      return;
    }
    // `gradientPaint` places the ramp in the rectangle's own
    // coordinates and the origin is added here, which is exactly what
    // `canvasGradient` in the Canvas2D renderer does. One arithmetic,
    // three callers.
    const placed = gradientPaint(resolved, width, height);
    if (placed.kind === 'radial' && !(placed.radius > 0)) {
      return;
    }
    const style =
      placed.kind === 'linear'
        ? this.ctx.createLinearGradient(x + placed.x0, y + placed.y0, x + placed.x1, y + placed.y1)
        : this.ctx.createRadialGradient(x + placed.x0, y + placed.y0, 0, x + placed.x0, y + placed.y0, placed.radius);
    for (const stop of placed.stops) {
      style.addColorStop(stop.offset, colorToCss(stop.color));
    }
    this.ctx.fillStyle = style;
  }

  strokeColor(color: UiColorValue): void {
    const resolved = this.resolver.color(color);
    this.ctx.strokeStyle = resolved === undefined ? 'transparent' : colorToCss(resolved);
  }

  lineWidth(width: number): void {
    this.ctx.lineWidth = width;
  }

  lineCap(cap: PaintLineCap): void {
    this.ctx.lineCap = cap;
  }

  lineJoin(join: PaintLineJoin): void {
    this.ctx.lineJoin = join;
  }

  miterLimit(limit: number): void {
    this.ctx.miterLimit = limit;
  }

  lineDash(segments: readonly number[], offset = 0): void {
    this.ctx.setLineDash(segments);
    this.ctx.lineDashOffset = offset;
  }

  alpha(value: number): void {
    this.ctx.globalAlpha *= value;
  }

  /**
   * A canvas's filter is measured in device pixels whatever the
   * transform, so the radius is scaled by the transform's here, where
   * there is one to read.
   */
  blur(radius: number): void {
    this.blurRadius = Math.max(0, radius);
    const m = this.ctx.getTransform?.();
    const scale = m === undefined ? 1 : Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    const device = this.blurRadius * scale;
    if (this.ctx.filter !== undefined || device > 0) {
      this.ctx.filter = device > 0 ? `blur(${device}px)` : 'none';
    }
  }

  /**
   * The content is drawn into a canvas of its own, the size of the
   * layer's rectangle in device pixels and cut to the part of the
   * context drawn into that it covers, under the same transform less
   * the canvas's corner. A fresh canvas per layer, sized once: drawing
   * into a canvas just blended from makes Chrome copy it first (see
   * `GroupOpacity.ts`).
   */
  beginMaskedLayer(x: number, y: number, width: number, height: number): void {
    const parent = this.ctx;
    const layer: MaskedLayer = {
      kind: 'unmasked',
      parent,
      blurDepth: this.blurStack.length,
      blurRadius: this.blurRadius,
      rect: { x, y, width, height },
      region: null,
      transform: null,
      content: null,
      mask: null,
      maskMode: 'luminance',
      masking: false
    };
    this.layers.push(layer);
    const m = parent.getTransform?.();
    if (this.layerSource === undefined || m === undefined || parent.setTransform === undefined) {
      parent.save();
      return;
    }
    const region = layerRegion(m, x, y, width, height, this.layerSource.bounds);
    if (region === null || this.suppressed > 0) {
      // Nothing of it lands on the context, or it is inside something
      // drawing nothing, so nothing of it is drawn.
      layer.kind = 'empty';
      parent.save();
      this.suppressed++;
      return;
    }
    const content = this.openLayerCanvas(region, m, layer.rect);
    if (content === null) {
      parent.save();
      return;
    }
    layer.kind = 'layer';
    layer.region = region;
    layer.transform = m;
    layer.content = content;
    this.ctx = content.ctx;
    this.blurRadius = 0;
  }

  layerMask(mode: PaintMaskMode = 'luminance'): void {
    const layer = this.layers.at(-1);
    if (layer === undefined || layer.masking) {
      return;
    }
    layer.masking = true;
    layer.maskMode = mode;
    this.blurStack.length = layer.blurDepth;
    if (layer.kind !== 'layer') {
      // The content went straight onto the context; the mask is drawn
      // nowhere, in the state the layer began in.
      layer.parent.restore();
      layer.parent.save();
      this.blurRadius = layer.blurRadius;
      if (layer.kind === 'unmasked') {
        this.suppressed++;
      }
      return;
    }
    const mask = this.openLayerCanvas(layer.region!, layer.transform!, layer.rect);
    const pixels = mask !== null && (mode === 'alpha' || canReadPixels(mask.ctx));
    this.blurRadius = 0;
    if (mask === null || !pixels) {
      // No canvas for the mask, or none that can turn its brightness
      // into coverage: the content is drawn unmasked.
      this.ctx = layer.content!.ctx;
      this.suppressed++;
      return;
    }
    layer.mask = mask;
    this.ctx = mask.ctx;
  }

  endMaskedLayer(): void {
    const layer = this.layers.pop();
    if (layer === undefined) {
      return;
    }
    this.ctx = layer.parent;
    this.blurStack.length = layer.blurDepth;
    this.blurRadius = layer.blurRadius;
    if (layer.kind !== 'layer') {
      layer.parent.restore();
      if (layer.kind === 'empty' || layer.masking) {
        this.suppressed--;
      }
      return;
    }
    if (layer.masking && layer.mask === null) {
      this.suppressed--;
    }
    const content = layer.content!;
    const region = layer.region!;
    if (layer.mask !== null) {
      if (layer.maskMode === 'luminance') {
        luminanceToAlpha(layer.mask.ctx, region.width, region.height);
      }
      const mask = layer.mask.canvas.take();
      // Kept where the mask covers, by as much as it covers: the
      // content's pixels times the mask's alpha.
      content.ctx.setTransform!(1, 0, 0, 1, 0, 0);
      content.ctx.globalAlpha = 1;
      content.ctx.filter = 'none';
      content.ctx.globalCompositeOperation = 'destination-in';
      content.ctx.drawImage(mask, 0, 0, region.width, region.height);
      mask.close?.();
    }
    const picture = content.canvas.take();
    // One pixel of the layer to one of the context, under the clip,
    // alpha and blur in force where the layer began.
    const parent = layer.parent;
    parent.save();
    parent.setTransform!(1, 0, 0, 1, 0, 0);
    parent.drawImage(picture, region.x, region.y, region.width, region.height);
    parent.restore();
    picture.close?.();
  }

  /** A canvas for a layer's content or mask, placed and cut as the layer is; null where none can be had. */
  private openLayerCanvas(region: PaintDeviceRect, m: PaintMatrix, rect: LayerRect): LayerCanvas | null {
    const canvas = this.layerSource!.create(region.width, region.height);
    const ctx = canvas?.context() ?? null;
    if (canvas === null || ctx === null || ctx.setTransform === undefined) {
      return null;
    }
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e - region.x, m.f - region.y);
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.beginPath();
    return { canvas, ctx };
  }

  fill(rule: PaintFillRule = 'nonzero'): void {
    if (this.suppressed > 0) {
      return;
    }
    this.ctx.fill(rule);
  }

  stroke(): void {
    if (this.suppressed > 0) {
      return;
    }
    this.ctx.stroke();
  }

  clip(rule: PaintFillRule = 'nonzero'): void {
    this.ctx.clip(rule);
  }

  text(value: string, x: number, y: number, style?: PaintTextStyle): void {
    if (this.suppressed > 0) {
      return;
    }
    const size = style?.fontSize ?? DEFAULT_FONT_SIZE;
    const weight = style?.fontWeight ?? DEFAULT_FONT_WEIGHT;
    const family = fontStackFor(style?.fontFamily ?? DEFAULT_FONT_FAMILY);
    this.ctx.font = `${String(weight)} ${size}px ${family}`;
    this.ctx.textAlign = style?.align ?? 'left';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(value, x, y);
  }

  image(image: UiImage, x: number, y: number, width: number, height: number): void {
    if (this.suppressed > 0) {
      return;
    }
    this.ctx.drawImage(image, x, y, width, height);
  }
}

interface LayerRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface LayerCanvas {
  readonly canvas: PaintCanvas;
  readonly ctx: PaintContext2D;
}

/** A masked layer between its begin and its end. */
interface MaskedLayer {
  /**
   * `layer`: drawn apart and composited. `unmasked`: the host could not
   * keep it apart, so its content went straight onto the context and its
   * mask nowhere. `empty`: it covers none of the context.
   */
  kind: 'layer' | 'unmasked' | 'empty';
  readonly parent: PaintContext2D;
  readonly blurDepth: number;
  readonly blurRadius: number;
  readonly rect: LayerRect;
  region: PaintDeviceRect | null;
  transform: PaintMatrix | null;
  content: LayerCanvas | null;
  mask: LayerCanvas | null;
  maskMode: PaintMaskMode;
  /** Whether `layerMask` has been called: the mask, not the content, is being drawn. */
  masking: boolean;
}

/**
 * A rectangle in the coordinates `m` maps to device pixels, as the whole
 * device pixels it covers, cut to `bounds`. Null when that is nothing.
 */
function layerRegion(
  m: PaintMatrix,
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: PaintDeviceRect
): PaintDeviceRect | null {
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height]
  ] as const) {
    const dx = m.a * px + m.c * py + m.e;
    const dy = m.b * px + m.d * py + m.f;
    minX = Math.min(minX, dx);
    minY = Math.min(minY, dy);
    maxX = Math.max(maxX, dx);
    maxY = Math.max(maxY, dy);
  }
  const left = Math.max(bounds.x, Math.floor(minX));
  const top = Math.max(bounds.y, Math.floor(minY));
  const right = Math.min(bounds.x + bounds.width, Math.ceil(maxX));
  const bottom = Math.min(bounds.y + bounds.height, Math.ceil(maxY));
  if (!(right > left) || !(bottom > top)) {
    return null;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function canReadPixels(ctx: PaintContext2D): boolean {
  return ctx.getImageData !== undefined && ctx.putImageData !== undefined;
}

/**
 * Turns a mask's pixels into coverage, as SVG's `luminanceToAlpha`
 * does: each pixel's alpha becomes its brightness, by the coefficients
 * SVG gives, times its alpha. Its colour is left, since only its alpha
 * is composited.
 */
export function luminanceToAlpha(ctx: PaintContext2D, width: number, height: number): void {
  const pixels = ctx.getImageData!(0, 0, width, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]!;
    if (alpha === 0) {
      continue;
    }
    const luminance = 0.2125 * data[i]! + 0.7154 * data[i + 1]! + 0.0721 * data[i + 2]!;
    data[i + 3] = Math.round((luminance * alpha) / 255);
  }
  ctx.putImageData!(pixels, 0, 0);
}
