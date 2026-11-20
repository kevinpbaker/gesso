import { describe, expect, it } from 'vitest';

import { boxHandlePoint, holdAngle, readoutText, resizeRect, snapMove, snapPoint, unionRect } from './geometry';

const R = { x: 100, y: 100, width: 200, height: 100 };

describe('resizeRect', () => {
  it('moves only its own side from a side handle', () => {
    expect(resizeRect(R, 'e', 30, 50)).toEqual({ x: 100, y: 100, width: 230, height: 100 });
    expect(resizeRect(R, 'n', 30, -20)).toEqual({ x: 100, y: 80, width: 200, height: 120 });
    expect(resizeRect(R, 'w', 50, 0)).toEqual({ x: 150, y: 100, width: 150, height: 100 });
  });

  it('moves two sides from a corner, and keeps the proportions with Shift', () => {
    expect(resizeRect(R, 'se', 20, 10)).toEqual({ x: 100, y: 100, width: 220, height: 110 });
    const kept = resizeRect(R, 'se', 100, 0, true);
    expect(kept.width / kept.height).toBeCloseTo(2, 9);
    expect(kept.width).toBeCloseTo(300, 9);
    const nw = resizeRect(R, 'nw', -100, 0, true);
    expect(nw).toEqual({ x: 0, y: 50, width: 300, height: 150 });
  });

  it('turns over rather than going negative', () => {
    expect(resizeRect(R, 'e', -300, 0)).toEqual({ x: 0, y: 100, width: 100, height: 100 });
  });
});

describe('snapping', () => {
  it('snaps a point to the nearest target in reach, else lines it up, else the grid', () => {
    const targets = [
      { x: 50, y: 50, kind: 'end' },
      { x: 200, y: 10 }
    ];
    expect(snapPoint({ x: 54, y: 47 }, targets, { reach: 8 }).hit).toEqual({
      point: { x: 50, y: 50 },
      kind: 'end',
      guides: []
    });
    const lined = snapPoint({ x: 203, y: 120 }, targets, { reach: 8, grid: 10 });
    expect(lined.point).toEqual({ x: 200, y: 120 });
    expect(lined.hit?.guides).toEqual([{ axis: 'x', at: 200 }]);
    expect(snapPoint({ x: 123, y: 127 }, targets, { reach: 8, grid: 10 }).point).toEqual({ x: 120, y: 130 });
    expect(snapPoint({ x: 123, y: 127 }, [], { reach: 8 }).hit).toBeNull();
  });

  it('lines a moving box up with others by edges and centres, each axis on its own', () => {
    const other = { x: 400, y: 0, width: 100, height: 50 };
    const moved = snapMove({ x: 396, y: 300, width: 50, height: 50 }, [other], { reach: 6 });
    expect(moved.dx).toBe(4);
    expect(moved.dy).toBe(0);
    expect(moved.hit?.guides).toEqual([{ axis: 'x', at: 400 }]);
  });

  it('drops a point on a point before lining edges up', () => {
    const moved = snapMove({ x: 0, y: 0, width: 10, height: 10 }, [], {
      reach: 6,
      points: [{ x: 10, y: 10 }],
      targets: [{ x: 13, y: 12, kind: 'end' }]
    });
    expect([moved.dx, moved.dy]).toEqual([3, 2]);
    expect(moved.hit?.kind).toBe('end');
  });

  it('holds a line to 45° steps at its length', () => {
    const held = holdAngle({ x: 0, y: 0 }, { x: 100, y: 10 });
    expect(held.x).toBeCloseTo(Math.hypot(100, 10), 9);
    expect(held.y).toBeCloseTo(0, 9);
  });
});

describe('readoutText', () => {
  it('says a length and an angle, a box, and a move, in the app’s units', () => {
    expect(readoutText('length', { x: 0, y: 0 }, { x: 300, y: -400 }, { scale: 2, unit: 'mm' })).toBe('250 mm at 53°');
    expect(readoutText('box', { x: 0, y: 0 }, { x: 300, y: 200 })).toBe('300 × 200');
    expect(readoutText('move', { x: 0, y: 0 }, { x: 20, y: 10 }, { yUp: true })).toBe('Δx 20  Δy −10');
  });
});

describe('boxes', () => {
  it('puts the eight handles on corners and side middles, and unites boxes', () => {
    expect(boxHandlePoint(R, 'n')).toEqual({ x: 200, y: 100 });
    expect(boxHandlePoint(R, 'se')).toEqual({ x: 300, y: 200 });
    expect(unionRect([R, { x: 0, y: 0, width: 10, height: 10 }])).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });
});
