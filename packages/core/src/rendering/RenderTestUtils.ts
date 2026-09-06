import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { LayoutEngine } from '../layout/LayoutEngine';
import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { Constraints } from '../layout/LayoutTypes';
import type { LayoutBox, LayoutResult } from '../layout/LayoutTypes';
import type { LayoutRecord } from '../layout/LayoutRecord';
import { Canvas2DRenderer } from './canvas2d/Canvas2DRenderer';
import type { Canvas2DContext, Canvas2DGradient } from './canvas2d/Canvas2DContext';
import { CanvasSurface } from './canvas2d/CanvasSurface';
import type { CanvasHost } from './canvas2d/CanvasSurface';
import type { PaintContext2D, PaintGradient } from './PaintTarget';
import type { PaintCanvasFactory } from './PaintPicture';
import type { PaintLineCap, PaintLineJoin } from './PaintSurface';

export interface RecordedCall {
  name: string;
  args: unknown[];
}

/**
 * The gradient a recording context hands back, carrying what it was
 * asked for so a test can read the whole paint rather than a `[object
 * CanvasGradient]`. A real one is opaque, which is exactly what makes
 * a gradient hard to assert on without this.
 */
export class RecordedGradient implements Canvas2DGradient {
  readonly stops: { offset: number; color: string }[] = [];

  constructor(
    readonly kind: 'linear' | 'radial',
    readonly args: readonly number[]
  ) {}

  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

/**
 * Deterministic Canvas2D spy: records every call and style
 * assignment so tests can assert the exact draw sequence.
 */
export class RecordingCanvasContext implements Canvas2DContext {
  readonly calls: RecordedCall[] = [];

  private _fillStyle: string | Canvas2DGradient | CanvasPattern = '#000';
  private _strokeStyle: string | Canvas2DGradient | CanvasPattern = '#000';
  private _lineWidth = 1;
  private _lineJoin: CanvasLineJoin = 'miter';
  private _globalAlpha = 1;
  private _font = '';
  private _textAlign: CanvasTextAlign = 'start';
  private _textBaseline: CanvasTextBaseline = 'alphabetic';
  /**
   * Tracking, which is a context property rather than part of the font
   * shorthand — and sticky, so a spec can check it was cleared as well
   * as that it was set.
   */
  letterSpacing = '0px';

  get fillStyle(): string | Canvas2DGradient | CanvasPattern {
    return this._fillStyle;
  }

  set fillStyle(value: string | Canvas2DGradient | CanvasPattern) {
    this._fillStyle = value;
    this.record('set:fillStyle', [value]);
  }

  get strokeStyle(): string | Canvas2DGradient | CanvasPattern {
    return this._strokeStyle;
  }

  set strokeStyle(value: string | Canvas2DGradient | CanvasPattern) {
    this._strokeStyle = value;
    this.record('set:strokeStyle', [value]);
  }

  get lineWidth(): number {
    return this._lineWidth;
  }

  set lineWidth(value: number) {
    this._lineWidth = value;
    this.record('set:lineWidth', [value]);
  }

  get lineJoin(): CanvasLineJoin {
    return this._lineJoin;
  }

  set lineJoin(value: CanvasLineJoin) {
    this._lineJoin = value;
    this.record('set:lineJoin', [value]);
  }

  get globalAlpha(): number {
    return this._globalAlpha;
  }

  set globalAlpha(value: number) {
    this._globalAlpha = value;
    this.record('set:globalAlpha', [value]);
  }

  get font(): string {
    return this._font;
  }

  set font(value: string) {
    this._font = value;
    this.record('set:font', [value]);
  }

  get textAlign(): CanvasTextAlign {
    return this._textAlign;
  }

  set textAlign(value: CanvasTextAlign) {
    this._textAlign = value;
    this.record('set:textAlign', [value]);
  }

  get textBaseline(): CanvasTextBaseline {
    return this._textBaseline;
  }

  set textBaseline(value: CanvasTextBaseline) {
    this._textBaseline = value;
    this.record('set:textBaseline', [value]);
  }

  save(): void {
    this.record('save', []);
  }

  restore(): void {
    this.record('restore', []);
  }

  translate(x: number, y: number): void {
    this.record('translate', [x, y]);
  }

  scale(x: number, y: number): void {
    this.record('scale', [x, y]);
  }

  rotate(angle: number): void {
    this.record('rotate', [angle]);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record('setTransform', [a, b, c, d, e, f]);
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.record('clearRect', [x, y, width, height]);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.record('fillRect', [x, y, width, height]);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.record('strokeRect', [x, y, width, height]);
  }

  beginPath(): void {
    this.record('beginPath', []);
  }

  moveTo(x: number, y: number): void {
    this.record('moveTo', [x, y]);
  }

  lineTo(x: number, y: number): void {
    this.record('lineTo', [x, y]);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.record('arcTo', [x1, y1, x2, y2, radius]);
  }

  closePath(): void {
    this.record('closePath', []);
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.record('rect', [x, y, width, height]);
  }

  clip(): void {
    this.record('clip', []);
  }

  fill(): void {
    this.record('fill', []);
  }

  stroke(): void {
    this.record('stroke', []);
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    const args = maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth];
    this.record('fillText', args);
  }

  measureText(text: string): TextMetrics {
    this.record('measureText', [text]);
    return { width: text.length * 8 } as TextMetrics;
  }

  drawImage(image: ImageBitmap, dx: number, dy: number, dw: number, dh: number): void {
    this.record('drawImage', [image, dx, dy, dw, dh]);
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): RecordedGradient {
    const gradient = new RecordedGradient('linear', [x0, y0, x1, y1]);
    this.record('createLinearGradient', [x0, y0, x1, y1]);
    return gradient;
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): RecordedGradient {
    const gradient = new RecordedGradient('radial', [x0, y0, r0, x1, y1, r1]);
    this.record('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
    return gradient;
  }

  private record(name: string, args: unknown[]): void {
    this.calls.push({ name, args: args.map(normalizeNumber) });
  }
}

/**
 * Normalizes -0 to 0 so scroll translations assert cleanly.
 */
function normalizeNumber(value: unknown): unknown {
  if (typeof value === 'number' && Object.is(value, -0)) {
    return 0;
  }
  return value;
}

export function callNames(context: RecordingCanvasContext): string[] {
  return context.calls.map(call => call.name);
}

export function callsOf(context: RecordingCanvasContext, name: string): RecordedCall[] {
  return context.calls.filter(call => call.name === name);
}

export function callArgs(context: RecordingCanvasContext, name: string): unknown[][] {
  return callsOf(context, name).map(call => (call.name.startsWith('set:') ? call.args[0] : call.args) as unknown[]);
}

export function savedDepth(context: RecordingCanvasContext): number {
  let depth = 0;
  for (const call of context.calls) {
    if (call.name === 'save') {
      depth++;
    } else if (call.name === 'restore') {
      depth--;
    }
  }
  return depth;
}

/**
 * Deterministic `PaintContext2D` spy: the picture rasteriser's
 * equivalent of `RecordingCanvasContext`, so a spec can assert what a
 * painter actually drew without a browser.
 */
export class RecordingPaintContext implements PaintContext2D {
  readonly calls: RecordedCall[] = [];

  lineDashOffset = 0;
  lineWidth = 1;
  lineCap: PaintLineCap = 'butt';
  lineJoin: PaintLineJoin = 'miter';
  miterLimit = 10;
  globalAlpha = 1;
  filter = 'none';
  fillStyle: string | PaintGradient = '#000';
  strokeStyle: string | PaintGradient = '#000';
  font = '';
  textAlign: 'left' | 'center' | 'right' = 'left';
  textBaseline = 'alphabetic' as const;

  save(): void {
    this.record('save', []);
  }

  restore(): void {
    this.record('restore', []);
  }

  translate(x: number, y: number): void {
    this.record('translate', [x, y]);
  }

  scale(x: number, y: number): void {
    this.record('scale', [x, y]);
  }

  rotate(angle: number): void {
    this.record('rotate', [angle]);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record('transform', [a, b, c, d, e, f]);
  }

  beginPath(): void {
    this.record('beginPath', []);
  }

  moveTo(x: number, y: number): void {
    this.record('moveTo', [x, y]);
  }

  lineTo(x: number, y: number): void {
    this.record('lineTo', [x, y]);
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.record('quadraticCurveTo', [cx, cy, x, y]);
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.record('bezierCurveTo', [c1x, c1y, c2x, c2y, x, y]);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false): void {
    this.record('arc', [x, y, radius, startAngle, endAngle, counterclockwise]);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.record('arcTo', [x1, y1, x2, y2, radius]);
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.record('rect', [x, y, width, height]);
  }

  closePath(): void {
    this.record('closePath', []);
  }

  fill(fillRule?: 'nonzero' | 'evenodd'): void {
    this.record('fill', [fillRule ?? 'nonzero', this.fillStyle]);
  }

  stroke(): void {
    this.record('stroke', [this.strokeStyle, this.lineWidth]);
  }

  clip(fillRule?: 'nonzero' | 'evenodd'): void {
    this.record('clip', [fillRule ?? 'nonzero']);
  }

  fillText(text: string, x: number, y: number): void {
    this.record('fillText', [text, x, y, this.font, this.textAlign]);
  }

  drawImage(image: ImageBitmap, dx: number, dy: number, dw: number, dh: number): void {
    this.record('drawImage', [image, dx, dy, dw, dh]);
  }

  setLineDash(segments: readonly number[]): void {
    this.record('setLineDash', [[...segments]]);
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): RecordedGradient {
    const gradient = new RecordedGradient('linear', [x0, y0, x1, y1]);
    this.record('createLinearGradient', [x0, y0, x1, y1]);
    return gradient;
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): RecordedGradient {
    const gradient = new RecordedGradient('radial', [x0, y0, r0, x1, y1, r1]);
    this.record('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
    return gradient;
  }

  private record(name: string, args: unknown[]): void {
    this.calls.push({ name, args: args.map(normalizeNumber) });
  }
}

/**
 * A picture that never becomes real pixels.
 *
 * `take()` hands back a stand-in for the `ImageBitmap` a browser would
 * transfer out of an `OffscreenCanvas`, carrying only the size and a
 * `close`, which is all either renderer reads off one. Every context
 * the factory hands out is kept, so a spec can assert both what was
 * drawn and how many times anything was drawn at all.
 */
export class FakePaintCanvases {
  readonly contexts: RecordingPaintContext[] = [];
  readonly bitmaps: { width: number; height: number; closed: boolean }[] = [];

  readonly create: PaintCanvasFactory = (width, height) => {
    const context = new RecordingPaintContext();
    this.contexts.push(context);
    const bitmap = { width, height, closed: false };
    this.bitmaps.push(bitmap);
    return {
      context: () => context,
      take: () =>
        ({
          width,
          height,
          close: () => {
            bitmap.closed = true;
          }
        }) as unknown as ImageBitmap
    };
  };

  /** The calls made into the most recent picture. */
  get last(): RecordingPaintContext {
    const context = this.contexts.at(-1);
    if (context === undefined) {
      throw new Error('No picture has been rasterised.');
    }
    return context;
  }

  reset(): void {
    this.contexts.length = 0;
    this.bitmaps.length = 0;
  }
}

/**
 * A canvas host backed by a recording context.
 */
export class FakeCanvasHost implements CanvasHost {
  width = 0;
  height = 0;
  private contextRequests = 0;

  constructor(private readonly context: Canvas2DContext | null) {}

  getContext(_contextId: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    this.contextRequests++;
    return this.context as unknown as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  }

  get contextRequestCount(): number {
    return this.contextRequests;
  }
}

/**
 * Shared harness: a real UiGraph + LayoutEngine + Canvas2DRenderer
 * over a recording context. Deterministic layout comes from the
 * CharacterCountTextMeasurer, shared by layout and renderer.
 */
export class RenderHarness {
  readonly graph = new UiGraph();
  readonly measurer: TextMeasurer = new CharacterCountTextMeasurer();
  readonly engine = new LayoutEngine(this.measurer);
  readonly context = new RecordingCanvasContext();
  readonly host = new FakeCanvasHost(this.context);
  readonly surface = new CanvasSurface(this.host);
  readonly renderer = new Canvas2DRenderer({ surface: this.surface });

  constructor(logicalWidth: number = 800, logicalHeight: number = 600, dpr: number = 1) {
    this.surface.setLogicalSize(logicalWidth, logicalHeight, dpr);
  }

  createNode(id: string, type: UiNodeType): UiNode {
    return this.graph.createNode(id, type);
  }

  append(parent: UiNode, ...children: UiNode[]): void {
    for (const child of children) {
      this.graph.appendChild(parent, child);
    }
  }

  layout(node: UiNode, constraints: Constraints = Constraints.tight(800, 600)): LayoutResult {
    return this.engine.layout(node, constraints);
  }

  render(node: UiNode): void {
    // Far in the future: overlay scrollbars have faded, so draw-call
    // assertions see only the scene. Pass `now` yourself to test them.
    this.renderer.render(node, { layout: this.engine, text: this.measurer, now: Number.MAX_SAFE_INTEGER });
  }

  record(node: UiNode): LayoutRecord {
    const record = this.engine.recordFor(node);
    if (record === undefined) {
      throw new Error(`No layout record for '${node.id}'.`);
    }
    return record;
  }

  box(node: UiNode): LayoutBox {
    const record = this.record(node);
    return { x: record.x, y: record.y, width: record.width, height: record.height };
  }
}
