import { describe, expect, it } from 'vitest';

import { snapBorderWidth, snapBox, snapsUnder } from './PixelSnap';

describe('snapBox', () => {
  const out = { x: 0, y: 0, width: 0, height: 0 };

  it('puts each edge on its nearest device pixel', () => {
    // At 1.5x, 10.4 is device 15.6 and 30.7 is 46.05.
    snapBox({ x: 10.4, y: 0, width: 20.3, height: 10 }, 1.5, 0, 0, out);
    expect(out.x * 1.5).toBeCloseTo(16);
    expect((out.x + out.width) * 1.5).toBeCloseTo(46);
  });

  it('keeps two boxes that meet in layout meeting in pixels, so no seam shows', () => {
    const third = 100 / 3;
    const a = { ...snapBox({ x: 0, y: 0, width: third, height: 1 }, 1.25, 0, 0, out) };
    const b = { ...snapBox({ x: third, y: 0, width: third, height: 1 }, 1.25, 0, 0, out) };
    expect(a.x + a.width).toBeCloseTo(b.x);
  });

  it('counts the translation the box is drawn under', () => {
    snapBox({ x: 0.2, y: 0.2, width: 10, height: 10 }, 2, 1, 1, out);
    expect(out.x * 2 + 1).toBeCloseTo(1);
    expect(out.y * 2 + 1).toBeCloseTo(1);
  });
});

describe('snapBorderWidth', () => {
  it('rounds down to whole device pixels and never below one', () => {
    expect(snapBorderWidth(1, 1.5) * 1.5).toBeCloseTo(1);
    expect(snapBorderWidth(2, 1.5) * 1.5).toBeCloseTo(3);
    expect(snapBorderWidth(0.25, 2) * 2).toBeCloseTo(1);
    expect(snapBorderWidth(0, 2)).toBe(0);
  });
});

describe('snapsUnder', () => {
  it('snaps under a translation at the device ratio, and not under a scale or a turn', () => {
    expect(snapsUnder(2, 0, 0, 2, 2)).toBe(true);
    expect(snapsUnder(2.4, 0, 0, 2.4, 2)).toBe(false);
    expect(snapsUnder(1.9, 0.6, -0.6, 1.9, 2)).toBe(false);
  });
});
