/**
 * The subset of the Canvas2D API the renderer uses.
 *
 * Both CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D
 * satisfy this structurally; the one-time widening happens at the
 * platform boundary (see CanvasSurface). Keeping this list explicit
 * means the renderer core never names a DOM type.
 */
/**
 * The part of `CanvasGradient` the renderer uses.
 *
 * Named separately so a recording context can satisfy it without
 * fabricating a DOM object, which is the same reason `Canvas2DContext`
 * exists. A real `CanvasGradient` satisfies it structurally.
 */
export interface Canvas2DGradient {
  addColorStop(offset: number, color: string): void;
}

export interface Canvas2DContext {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /**
   * CSS `letter-spacing`, as a length string.
   *
   * A context property rather than part of the font shorthand, and
   * sticky, so a run that wants none has to say `'0px'` rather than
   * leave it. Optional because a stub context has no reason to carry
   * it; where it is missing, measuring and drawing both do without and
   * still agree with each other.
   */
  letterSpacing?: string;
  /**
   * The base direction bidi resolves against: which side a neutral
   * character at the end of an Arabic line lands on, and which way a
   * mixed line reads. Set per text draw from the paragraph's
   * `textDirection`. Optional for the same reason `letterSpacing` is.
   */
  direction?: CanvasDirection;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): TextMetrics;
  /**
   * A `VideoFrame` as well as an `ImageBitmap`: both are
   * `CanvasImageSource`, and the frame is what WebCodecs hands back.
   * Kept to these two rather than the whole union because those are
   * the only two anything in this renderer can produce.
   */
  drawImage(image: ImageBitmap | VideoFrame, dx: number, dy: number, dw: number, dh: number): void;

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Canvas2DGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Canvas2DGradient;

  fillStyle: string | Canvas2DGradient | CanvasPattern;
  strokeStyle: string | Canvas2DGradient | CanvasPattern;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}
