/**
 * The subset of the Canvas2D API the renderer uses.
 *
 * Both CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D
 * satisfy this structurally; the one-time widening happens at the
 * platform boundary (see CanvasSurface). Keeping this list explicit
 * means the renderer core never names a DOM type.
 */
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

  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}
