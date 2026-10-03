import type { PaintFillRule } from '../PaintSurface';
import type { PaintContext2D, PaintGradient } from '../PaintTarget';
import type { Canvas2DContext, Canvas2DGradient } from './Canvas2DContext';

/**
 * A canvas context that keeps large translations in double precision.
 *
 * Skia keeps a canvas's transform, and every coordinate it is handed, in
 * 32-bit floats, which hold about seven significant digits. A scroll
 * container is drawn by translating by minus its scroll offset and then
 * drawing its children where layout put them, so a grid of five million
 * 26-pixel rows, scrolled to the bottom, asks Skia to translate by
 * -129,999,740 and then fill a row at 129,999,766. Each of those is
 * rounded to the nearest eight pixels on its own, and the rows come out
 * up to eight pixels from where they belong, with gaps between some and
 * overlaps between others.
 *
 * This holds such a translation back. Once one is large enough to lose
 * precision, it and every translation after it are added up here, in
 * JavaScript's doubles, and added to each coordinate before the call is
 * passed on, so what Skia receives is the small number the two cancel
 * to. Nothing changes for ordinary drawing: below the threshold every
 * call passes through untouched, which is also what keeps the renderer's
 * recorded-call specs as they were.
 *
 * A held translation is written out for real before anything it does not
 * commute with — a scale, a rotation, an arbitrary transform — and
 * dropped by `setTransform`, which replaces the whole matrix. `save` and
 * `restore` scope it exactly as they scope the canvas's own transform.
 * WebGPU has no need of this: it keeps its transform in JavaScript and
 * applies it before positions become floats.
 */

/** A translation at or beyond this many pixels is held back. Float32 resolves an eighth of a pixel here. */
export const PRECISE_ABOVE = 1 << 20;

type Inner = Canvas2DContext & Partial<PaintContext2D>;

export class PreciseContext implements Canvas2DContext, PaintContext2D {
  private inner: Inner;
  private dx = 0;
  private dy = 0;
  private readonly saved: number[] = [];
  getTransform?: () => { a: number; b: number; c: number; d: number; e: number; f: number };

  constructor(inner: Canvas2DContext) {
    this.inner = inner as Inner;
    this.reset(inner);
  }

  /** Points at a context for a new frame, holding nothing back. Returns itself. */
  reset(inner: Canvas2DContext): this {
    this.inner = inner as Inner;
    this.dx = 0;
    this.dy = 0;
    this.saved.length = 0;
    this.getTransform =
      inner.getTransform === undefined
        ? undefined
        : () => {
            const m = this.inner.getTransform!();
            // The canvas's matrix, then the translation held here.
            return {
              a: m.a,
              b: m.b,
              c: m.c,
              d: m.d,
              e: m.a * this.dx + m.c * this.dy + m.e,
              f: m.b * this.dx + m.d * this.dy + m.f
            };
          };
    return this;
  }

  /** Whether a translation is being held back, for a spec to ask. */
  get holding(): boolean {
    return this.dx !== 0 || this.dy !== 0;
  }

  // ------------------------------------------------------------------ state

  save(): void {
    this.saved.push(this.dx, this.dy);
    this.inner.save();
  }

  restore(): void {
    if (this.saved.length >= 2) {
      this.dy = this.saved.pop()!;
      this.dx = this.saved.pop()!;
    }
    this.inner.restore();
  }

  translate(x: number, y: number): void {
    if (this.holding || Math.abs(x) >= PRECISE_ABOVE || Math.abs(y) >= PRECISE_ABOVE) {
      this.dx += x;
      this.dy += y;
      return;
    }
    this.inner.translate(x, y);
  }

  scale(x: number, y: number): void {
    this.flush();
    this.inner.scale(x, y);
  }

  rotate(angle: number): void {
    this.flush();
    this.inner.rotate(angle);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.flush();
    this.inner.transform!(a, b, c, d, e, f);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.dx = 0;
    this.dy = 0;
    this.inner.setTransform(a, b, c, d, e, f);
  }

  /** Writes a held translation out for real, for a transform it does not commute with. */
  private flush(): void {
    if (this.holding) {
      this.inner.translate(this.dx, this.dy);
      this.dx = 0;
      this.dy = 0;
    }
  }

  // ------------------------------------------------------------------ drawing

  clearRect(x: number, y: number, width: number, height: number): void {
    this.inner.clearRect(x + this.dx, y + this.dy, width, height);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.inner.fillRect(x + this.dx, y + this.dy, width, height);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.inner.strokeRect(x + this.dx, y + this.dy, width, height);
  }

  beginPath(): void {
    this.inner.beginPath();
  }

  closePath(): void {
    this.inner.closePath();
  }

  moveTo(x: number, y: number): void {
    this.inner.moveTo(x + this.dx, y + this.dy);
  }

  lineTo(x: number, y: number): void {
    this.inner.lineTo(x + this.dx, y + this.dy);
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.inner.quadraticCurveTo!(cx + this.dx, cy + this.dy, x + this.dx, y + this.dy);
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.inner.bezierCurveTo!(c1x + this.dx, c1y + this.dy, c2x + this.dx, c2y + this.dy, x + this.dx, y + this.dy);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
    this.inner.arc!(x + this.dx, y + this.dy, radius, startAngle, endAngle, counterclockwise);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.inner.arcTo(x1 + this.dx, y1 + this.dy, x2 + this.dx, y2 + this.dy, radius);
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.inner.rect(x + this.dx, y + this.dy, width, height);
  }

  clip(fillRule?: PaintFillRule): void {
    if (fillRule === undefined) {
      this.inner.clip();
    } else {
      this.inner.clip!(fillRule);
    }
  }

  fill(fillRule?: PaintFillRule): void {
    if (fillRule === undefined) {
      this.inner.fill();
    } else {
      this.inner.fill!(fillRule);
    }
  }

  stroke(): void {
    this.inner.stroke();
  }

  setLineDash(segments: readonly number[]): void {
    this.inner.setLineDash!(segments);
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    if (maxWidth === undefined) {
      this.inner.fillText(text, x + this.dx, y + this.dy);
    } else {
      this.inner.fillText(text, x + this.dx, y + this.dy, maxWidth);
    }
  }

  measureText(text: string): TextMetrics {
    return this.inner.measureText(text);
  }

  drawImage(image: Parameters<Canvas2DContext['drawImage']>[0], dx: number, dy: number, dw: number, dh: number): void {
    this.inner.drawImage(image, dx + this.dx, dy + this.dy, dw, dh);
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Canvas2DGradient & PaintGradient {
    return this.inner.createLinearGradient(x0 + this.dx, y0 + this.dy, x1 + this.dx, y1 + this.dy);
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): Canvas2DGradient & PaintGradient {
    return this.inner.createRadialGradient(x0 + this.dx, y0 + this.dy, r0, x1 + this.dx, y1 + this.dy, r1);
  }

  // ------------------------------------------------------------------ properties, passed through

  get fillStyle(): string {
    return this.inner.fillStyle as string;
  }
  set fillStyle(value: string | Canvas2DGradient | CanvasPattern | PaintGradient) {
    this.inner.fillStyle = value as string;
  }
  get strokeStyle(): string {
    return this.inner.strokeStyle as string;
  }
  set strokeStyle(value: string | Canvas2DGradient | CanvasPattern | PaintGradient) {
    this.inner.strokeStyle = value as string;
  }
  get lineWidth() {
    return this.inner.lineWidth;
  }
  set lineWidth(value) {
    this.inner.lineWidth = value;
  }
  get lineJoin() {
    return this.inner.lineJoin;
  }
  set lineJoin(value) {
    this.inner.lineJoin = value;
  }
  get lineCap() {
    return this.inner.lineCap!;
  }
  set lineCap(value) {
    this.inner.lineCap = value;
  }
  get miterLimit() {
    return this.inner.miterLimit!;
  }
  set miterLimit(value) {
    this.inner.miterLimit = value;
  }
  get lineDashOffset() {
    return this.inner.lineDashOffset!;
  }
  set lineDashOffset(value) {
    this.inner.lineDashOffset = value;
  }
  get globalAlpha() {
    return this.inner.globalAlpha;
  }
  set globalAlpha(value) {
    this.inner.globalAlpha = value;
  }
  get font() {
    return this.inner.font;
  }
  set font(value) {
    this.inner.font = value;
  }
  get textAlign() {
    return this.inner.textAlign as 'left';
  }
  set textAlign(value) {
    this.inner.textAlign = value;
  }
  get textBaseline() {
    return this.inner.textBaseline as 'alphabetic';
  }
  set textBaseline(value) {
    this.inner.textBaseline = value;
  }
  get filter() {
    return this.inner.filter;
  }
  set filter(value) {
    this.inner.filter = value;
  }
  get letterSpacing() {
    return this.inner.letterSpacing;
  }
  set letterSpacing(value) {
    this.inner.letterSpacing = value;
  }
  get fontStretch() {
    return this.inner.fontStretch;
  }
  set fontStretch(value) {
    this.inner.fontStretch = value;
  }
  get fontKerning() {
    return this.inner.fontKerning;
  }
  set fontKerning(value) {
    this.inner.fontKerning = value;
  }
  get direction() {
    return this.inner.direction;
  }
  set direction(value) {
    this.inner.direction = value;
  }
}
