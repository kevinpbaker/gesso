import { describe, expect, it } from 'vitest';

import { PaintRecorder, replayPaint, type PaintOp } from './PaintRecording';
import { inputsEqual, paintValuesEqual, pathValuesEqual, type PaintSurface } from './PaintSurface';

/**
 * The recorder and the replay, which are the two halves of what makes
 * a painted node renderer-neutral: a painter's calls become data, and
 * the data plays back into any surface at all.
 */
describe('PaintRecorder', () => {
  function ops(draw: (surface: PaintSurface) => void): PaintOp[] {
    const recorder = new PaintRecorder();
    draw(recorder);
    return [...recorder.finish().ops];
  }

  it('records a call per method, in order, with its arguments', () => {
    const recorded = ops(s => {
      s.beginPath();
      s.moveTo(0, 10);
      s.lineTo(20, 4);
      s.strokeColor('#123456');
      s.lineWidth(2);
      s.stroke();
    });
    expect(recorded.map(op => op.op)).toEqual(['beginPath', 'moveTo', 'lineTo', 'strokeColor', 'lineWidth', 'stroke']);
    expect(recorded[2]).toEqual({ op: 'lineTo', x: 20, y: 4 });
    expect(recorded[3]).toEqual({ op: 'strokeColor', color: '#123456' });
  });

  it('fills the defaults an optional argument leaves out', () => {
    const recorded = ops(s => {
      s.fill();
      s.clip();
      s.arc(1, 2, 3, 0, Math.PI);
      s.lineDash([2, 2]);
    });
    expect(recorded[0]).toEqual({ op: 'fill', rule: 'nonzero' });
    expect(recorded[1]).toEqual({ op: 'clip', rule: 'nonzero' });
    expect(recorded[2]).toMatchObject({ counterclockwise: false });
    expect(recorded[3]).toMatchObject({ offset: 0 });
  });

  it('expands path data into the calls it names, so a recording holds no strings', () => {
    const fromData = ops(s => s.path('M0 0 L10 0 L10 10 Z'));
    const byHand = ops(s => {
      s.moveTo(0, 0);
      s.lineTo(10, 0);
      s.lineTo(10, 10);
      s.closePath();
    });
    expect(fromData).toEqual(byHand);
  });

  it('replays into another surface, call for call', () => {
    const source = new PaintRecorder();
    source.save();
    source.translate(4, 5);
    source.roundRect(0, 0, 10, 10, 2);
    source.fillColor('accent');
    source.fill('evenodd');
    source.restore();
    const copy = new PaintRecorder();
    replayPaint(source.finish(), copy);
    expect(copy.finish().ops).toEqual(source.finish().ops);
  });
});

describe('paint value comparison', () => {
  const draw = (): void => {};

  it('is identity on the function and item-by-item on the inputs', () => {
    expect(paintValuesEqual({ draw, inputs: [1, 'a'] }, { draw, inputs: [1, 'a'] })).toBe(true);
    expect(paintValuesEqual({ draw, inputs: [1] }, { draw, inputs: [2] })).toBe(false);
    expect(paintValuesEqual({ draw, inputs: [1] }, { draw: () => {}, inputs: [1] })).toBe(false);
  });

  it('treats an absent input list as an empty one', () => {
    expect(inputsEqual(undefined, [])).toBe(true);
    expect(inputsEqual(undefined, [1])).toBe(false);
  });

  it('reads an intrinsic size as part of the value, since layout does', () => {
    expect(paintValuesEqual({ draw, intrinsicWidth: 10 }, { draw, intrinsicWidth: 10 })).toBe(true);
    expect(paintValuesEqual({ draw, intrinsicWidth: 10 }, { draw, intrinsicWidth: 12 })).toBe(false);
  });

  it('compares a path by what it draws and how', () => {
    expect(pathValuesEqual({ d: 'M0 0', dash: [2, 2] }, { d: 'M0 0', dash: [2, 2] })).toBe(true);
    expect(pathValuesEqual({ d: 'M0 0', dash: [2, 2] }, { d: 'M0 0', dash: [2, 3] })).toBe(false);
    expect(pathValuesEqual({ d: 'M0 0', fill: 'accent' }, { d: 'M0 0', fill: 'surface' })).toBe(false);
  });
});
