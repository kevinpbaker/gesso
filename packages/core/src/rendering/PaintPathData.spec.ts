import { describe, expect, it } from 'vitest';

import { tracePathData } from './PaintPathData';
import { PaintRecorder, type PaintOp } from './PaintRecording';

/**
 * SVG path data, parsed here rather than handed to `Path2D`.
 *
 * The grammar is the awkward part of a `path` property and the reason
 * this has its own spec: real icon sets ship data with no separators,
 * repeated coordinate sets after one letter, reflected shorthand
 * curves and arcs, and each of those is a way to draw the wrong shape
 * silently.
 */
describe('tracePathData', () => {
  function trace(d: string): PaintOp[] {
    const recorder = new PaintRecorder();
    tracePathData(recorder, d);
    return [...recorder.finish().ops];
  }

  it('reads absolute and relative commands', () => {
    expect(trace('M10 10 L20 10 l0 5 Z')).toEqual([
      { op: 'moveTo', x: 10, y: 10 },
      { op: 'lineTo', x: 20, y: 10 },
      { op: 'lineTo', x: 20, y: 15 },
      { op: 'closePath' }
    ]);
  });

  it('needs no separators, and reads a sign as one', () => {
    expect(trace('M0 0l5-3.5')).toEqual([
      { op: 'moveTo', x: 0, y: 0 },
      { op: 'lineTo', x: 5, y: -3.5 }
    ]);
  });

  it('repeats the last command for extra coordinate sets, and M repeats as L', () => {
    expect(trace('M0 0 1 1 2 2')).toEqual([
      { op: 'moveTo', x: 0, y: 0 },
      { op: 'lineTo', x: 1, y: 1 },
      { op: 'lineTo', x: 2, y: 2 }
    ]);
  });

  it('reads the horizontal and vertical shorthands against the pen', () => {
    expect(trace('M4 4 H10 V0 h-2')).toEqual([
      { op: 'moveTo', x: 4, y: 4 },
      { op: 'lineTo', x: 10, y: 4 },
      { op: 'lineTo', x: 10, y: 0 },
      { op: 'lineTo', x: 8, y: 0 }
    ]);
  });

  it('reflects the previous control point for S and T', () => {
    const cubic = trace('M0 0 C1 1 2 1 3 0 S5 -1 6 0');
    expect(cubic[2]).toEqual({ op: 'bezierCurveTo', c1x: 4, c1y: -1, c2x: 5, c2y: -1, x: 6, y: 0 });
    const quadratic = trace('M0 0 Q1 2 2 0 T4 0');
    expect(quadratic[2]).toEqual({ op: 'quadraticCurveTo', cx: 3, cy: -2, x: 4, y: 0 });
  });

  it('falls back to the current point when there is nothing to reflect', () => {
    expect(trace('M2 3 S4 5 6 7')[1]).toEqual({ op: 'bezierCurveTo', c1x: 2, c1y: 3, c2x: 4, c2y: 5, x: 6, y: 7 });
  });

  it('turns an arc into cubics that end where the arc ends', () => {
    const ops = trace('M0 0 A5 5 0 0 1 10 0');
    expect(ops[0]).toEqual({ op: 'moveTo', x: 0, y: 0 });
    expect(ops.length).toBeGreaterThan(1);
    const last = ops.at(-1)!;
    expect(last.op).toBe('bezierCurveTo');
    if (last.op === 'bezierCurveTo') {
      expect(last.x).toBeCloseTo(10, 6);
      expect(last.y).toBeCloseTo(0, 6);
    }
  });

  it('reads the arc flags as single digits, with no separator', () => {
    // `a1 1 0 0110 0` packs both flags and the first coordinate into
    // `0110`, which is exactly how an exporter writes it.
    const packed = trace('M0 0a5 5 0 0110 0');
    const spaced = trace('M0 0 a5 5 0 0 1 10 0');
    expect(packed).toEqual(spaced);
  });

  it('draws a zero radius as a line, as the specification says', () => {
    expect(trace('M0 0 A0 5 0 0 1 10 0')).toEqual([
      { op: 'moveTo', x: 0, y: 0 },
      { op: 'lineTo', x: 10, y: 0 }
    ]);
  });

  it('grows radii too small to reach the endpoint rather than dropping the arc', () => {
    const ops = trace('M0 0 A1 1 0 0 1 10 0');
    const last = ops.at(-1)!;
    expect(last.op).toBe('bezierCurveTo');
    if (last.op === 'bezierCurveTo') {
      expect(last.x).toBeCloseTo(10, 6);
    }
  });

  it('stops at an unknown letter instead of throwing, keeping what it read', () => {
    expect(trace('M1 2 L3 4 X9 9')).toEqual([
      { op: 'moveTo', x: 1, y: 2 },
      { op: 'lineTo', x: 3, y: 4 }
    ]);
  });

  it('puts the pen back at the subpath start after Z', () => {
    expect(trace('M5 5 L9 5 Z l1 0')).toEqual([
      { op: 'moveTo', x: 5, y: 5 },
      { op: 'lineTo', x: 9, y: 5 },
      { op: 'closePath' },
      { op: 'lineTo', x: 6, y: 5 }
    ]);
  });
});
