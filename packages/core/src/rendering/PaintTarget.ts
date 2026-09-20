import type { UiColor } from '../properties/UiColor';
import type { UiColorValue } from '../properties/UiPropertyValues';
import type { ResolvedGradient, UiGradient } from '../properties/UiGradient';
import { gradientPaint } from '../properties/UiGradient';
import type { UiImage } from '../properties/UiImage';
import { colorToCss, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_FONT_WEIGHT } from './PaintState';
import { fontStackFor } from './FontStacks';
import { tracePathData } from './PaintPathData';
import type { PaintFillRule, PaintLineCap, PaintLineJoin, PaintSurface, PaintTextStyle } from './PaintSurface';

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
  fillStyle: string | PaintGradient;
  strokeStyle: string | PaintGradient;
  font: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'alphabetic';
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

  constructor(
    private readonly ctx: PaintContext2D,
    private readonly resolver: PaintResolver
  ) {}

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

  blur(radius: number): void {
    this.blurRadius = Math.max(0, radius);
    if (this.ctx.filter !== undefined || this.blurRadius > 0) {
      this.ctx.filter = this.blurRadius > 0 ? `blur(${this.blurRadius}px)` : 'none';
    }
  }

  fill(rule: PaintFillRule = 'nonzero'): void {
    this.ctx.fill(rule);
  }

  stroke(): void {
    this.ctx.stroke();
  }

  clip(rule: PaintFillRule = 'nonzero'): void {
    this.ctx.clip(rule);
  }

  text(value: string, x: number, y: number, style?: PaintTextStyle): void {
    const size = style?.fontSize ?? DEFAULT_FONT_SIZE;
    const weight = style?.fontWeight ?? DEFAULT_FONT_WEIGHT;
    const family = fontStackFor(style?.fontFamily ?? DEFAULT_FONT_FAMILY);
    this.ctx.font = `${String(weight)} ${size}px ${family}`;
    this.ctx.textAlign = style?.align ?? 'left';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(value, x, y);
  }

  image(image: UiImage, x: number, y: number, width: number, height: number): void {
    this.ctx.drawImage(image, x, y, width, height);
  }
}
