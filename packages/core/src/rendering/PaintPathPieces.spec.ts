import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PATH_PIECES_AFTER, PaintTarget, type PaintMatrix, type PaintResolver } from './PaintTarget';
import { RecordingPaintContext } from './RenderTestUtils';

/**
 * A path of many closed subpaths, built in `Path2D` pieces rather than
 * on the context (see `PATH_PIECES_AFTER`).
 *
 * Node has neither `Path2D` nor `DOMMatrix`, so both are stood in for
 * here by the little of each the target uses: a Path2D that keeps its
 * calls, and appends another's moved by a matrix; a matrix that
 * inverts and multiplies. What is checked is that the pieces hold the
 * very calls the path was drawn with, in order, each subpath where it
 * was drawn, and that a fill, stroke or clip is of them.
 */

type Call = readonly [string, ...number[]];

class FakePath2D {
  readonly calls: Call[] = [];
  constructor(from?: FakePath2D) {
    if (from !== undefined) this.calls.push(...from.calls);
  }
  moveTo(x: number, y: number) {
    this.calls.push(['moveTo', x, y]);
  }
  lineTo(x: number, y: number) {
    this.calls.push(['lineTo', x, y]);
  }
  arc(x: number, y: number, r: number, a: number, b: number, ccw?: boolean) {
    this.calls.push(['arc', x, y, r, a, b, ccw === true ? 1 : 0]);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    this.calls.push(['arcTo', x1, y1, x2, y2, r]);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.calls.push(['rect', x, y, w, h]);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.calls.push(['quadraticCurveTo', cx, cy, x, y]);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) {
    this.calls.push(['bezierCurveTo', a, b, c, d, x, y]);
  }
  closePath() {
    this.calls.push(['closePath']);
  }
  /** Appended, its points moved by `m` (only moves and lines are moved here; it is all these tests need). */
  addPath(other: FakePath2D, m?: FakeMatrix) {
    for (const [name, ...args] of other.calls) {
      if (m !== undefined && (name === 'moveTo' || name === 'lineTo')) {
        const [x, y] = args as [number, number];
        this.calls.push([name, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
      } else this.calls.push([name, ...args]);
    }
  }
}

class FakeMatrix implements PaintMatrix {
  constructor(
    readonly a: number,
    readonly b: number,
    readonly c: number,
    readonly d: number,
    readonly e: number,
    readonly f: number
  ) {}
  static fromMatrix(m: PaintMatrix) {
    return new FakeMatrix(m.a, m.b, m.c, m.d, m.e, m.f);
  }
  inverse() {
    const det = this.a * this.d - this.b * this.c;
    return new FakeMatrix(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det
    );
  }
  multiply(o: FakeMatrix) {
    return new FakeMatrix(
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.e + this.c * o.f + this.e,
      this.b * o.e + this.d * o.f + this.f
    );
  }
}

/** A recording context with a transform it reports, and fill, stroke and clip of a Path2D. */
class BrowserLikeContext extends RecordingPaintContext {
  private m = new FakeMatrix(1, 0, 0, 1, 0, 0);
  override translate(x: number, y: number): void {
    super.translate(x, y);
    this.m = this.m.multiply(new FakeMatrix(1, 0, 0, 1, x, y));
  }
  getTransform(): PaintMatrix {
    return this.m;
  }
  override fill(rule?: unknown, more?: unknown): void {
    if (rule instanceof FakePath2D) this.calls.push({ name: 'fillPath', args: [rule.calls, more] });
    else super.fill(rule as 'nonzero');
  }
  override stroke(path?: unknown): void {
    if (path instanceof FakePath2D) this.calls.push({ name: 'strokePath', args: [path.calls] });
    else super.stroke();
  }
  override clip(rule?: unknown, more?: unknown): void {
    if (rule instanceof FakePath2D) this.calls.push({ name: 'clipPath', args: [rule.calls, more] });
    else super.clip(rule as 'nonzero');
  }
}

const resolver: PaintResolver = { color: () => undefined, gradient: () => undefined };

/** `n` closed squares, a moveTo, three lineTos and a close each, as drawn and as a list of the calls. */
function squares(target: PaintTarget, n: number): Call[] {
  const calls: Call[] = [];
  for (let i = 0; i < n; i++) {
    const x = i * 10;
    target.moveTo(x, 0);
    target.lineTo(x + 5, 0);
    target.lineTo(x + 5, 5);
    target.lineTo(x, 5);
    target.closePath();
    calls.push(['moveTo', x, 0], ['lineTo', x + 5, 0], ['lineTo', x + 5, 5], ['lineTo', x, 5], ['closePath']);
  }
  return calls;
}

const named = (ctx: RecordingPaintContext, name: string) => ctx.calls.filter(c => c.name === name);

describe('a path of many closed subpaths', () => {
  const globals = globalThis as Record<string, unknown>;
  beforeEach(() => {
    globals.Path2D = FakePath2D;
    globals.DOMMatrix = FakeMatrix;
  });
  afterEach(() => {
    delete globals.Path2D;
    delete globals.DOMMatrix;
  });

  it('is built in pieces once it has closed enough subpaths, and filled and stroked as drawn', () => {
    const ctx = new BrowserLikeContext();
    const target = new PaintTarget(ctx, resolver);
    target.beginPath();
    const drawn = squares(target, 500);
    target.fill('evenodd');
    target.stroke();
    // The first closes reached the context, and none after.
    expect(named(ctx, 'closePath')).toHaveLength(PATH_PIECES_AFTER - 1);
    expect(named(ctx, 'fill')).toHaveLength(0);
    const [fill] = named(ctx, 'fillPath');
    expect(fill!.args[0]).toEqual(drawn);
    expect(fill!.args[1]).toBe('evenodd');
    expect(named(ctx, 'strokePath')[0]!.args[0]).toEqual(drawn);
  });

  it('stays on the context while it closes few', () => {
    const ctx = new BrowserLikeContext();
    const target = new PaintTarget(ctx, resolver);
    target.beginPath();
    squares(target, PATH_PIECES_AFTER - 1);
    target.fill();
    target.clip();
    expect(named(ctx, 'closePath')).toHaveLength(PATH_PIECES_AFTER - 1);
    expect(named(ctx, 'fill')).toHaveLength(1);
    expect(named(ctx, 'clip')).toHaveLength(1);
    expect(named(ctx, 'fillPath')).toHaveLength(0);
  });

  it('starts again at beginPath', () => {
    const ctx = new BrowserLikeContext();
    const target = new PaintTarget(ctx, resolver);
    target.beginPath();
    squares(target, 200);
    target.fill();
    target.beginPath();
    squares(target, 3);
    target.fill();
    expect(named(ctx, 'fillPath')).toHaveLength(1);
    expect(named(ctx, 'fill')).toHaveLength(1);
  });

  it('stays on the context when the transform changed while it was drawn', () => {
    const ctx = new BrowserLikeContext();
    const target = new PaintTarget(ctx, resolver);
    target.beginPath();
    squares(target, 10);
    target.translate(100, 0);
    squares(target, 200);
    target.fill();
    expect(named(ctx, 'fillPath')).toHaveLength(0);
    expect(named(ctx, 'closePath')).toHaveLength(210);
  });

  it('keeps what was drawn in place when the transform changes after it is in pieces', () => {
    const ctx = new BrowserLikeContext();
    const target = new PaintTarget(ctx, resolver);
    target.beginPath();
    const drawn = squares(target, 100);
    target.translate(7, 0);
    target.fill();
    // Filled under the new transform, so each point is moved back by it to land where it was drawn.
    const moved = drawn.map(([name, ...a]) => (name === 'closePath' ? [name] : [name, a[0]! - 7, a[1]!]));
    expect(named(ctx, 'fillPath')[0]!.args[0]).toEqual(moved);
  });

  it('is never built in pieces where there is no Path2D', () => {
    delete globals.Path2D;
    const ctx = new BrowserLikeContext();
    const target = new PaintTarget(ctx, resolver);
    target.beginPath();
    squares(target, 200);
    target.fill();
    expect(named(ctx, 'closePath')).toHaveLength(200);
    expect(named(ctx, 'fill')).toHaveLength(1);
  });

  it('keeps rect and roundRect as subpaths of their own', () => {
    const ctx = new BrowserLikeContext();
    const target = new PaintTarget(ctx, resolver);
    target.beginPath();
    for (let i = 0; i < 100; i++) target.roundRect(i * 10, 0, 8, 8, 2);
    target.rect(0, 20, 5, 5);
    target.lineTo(9, 9);
    target.stroke();
    const calls = named(ctx, 'strokePath')[0]!.args[0] as Call[];
    expect(calls.filter(c => c[0] === 'arcTo')).toHaveLength(400);
    expect(calls.filter(c => c[0] === 'closePath')).toHaveLength(100);
    expect(calls.slice(-2)).toEqual([
      ['rect', 0, 20, 5, 5],
      ['lineTo', 9, 9]
    ]);
  });
});
