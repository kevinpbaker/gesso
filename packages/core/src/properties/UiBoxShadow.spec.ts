import { describe, expect, it } from 'vitest';

import { rgba } from './UiColor';
import { boxShadow, boxShadowArraysEqual, boxShadowRadius, boxShadowReach, boxShadowsEqual } from './UiBoxShadow';

describe('UiBoxShadow', () => {
  it('creates a shadow', () => {
    const shadow = boxShadow(2, 4, 8, 0, rgba(0, 0, 0, 0.2));
    expect(shadow).toEqual({
      offsetX: 2,
      offsetY: 4,
      blurRadius: 8,
      spreadRadius: 0,
      color: rgba(0, 0, 0, 0.2),
      inset: false
    });
  });

  it('supports inset shadows', () => {
    const shadow = boxShadow(0, 0, 4, 2, rgba(0, 0, 0, 0.5), true);
    expect(shadow.inset).toBe(true);
  });

  it('compares shadows for equality', () => {
    const a = boxShadow(2, 4, 8, 0, rgba(0, 0, 0, 0.2));
    const b = boxShadow(2, 4, 8, 0, rgba(0, 0, 0, 0.2));
    const c = boxShadow(2, 4, 8, 0, rgba(0, 0, 0, 0.3));
    expect(boxShadowsEqual(a, b)).toBe(true);
    expect(boxShadowsEqual(a, c)).toBe(false);
  });

  it('compares shadow arrays for equality', () => {
    const a = [boxShadow(2, 4, 8, 0, rgba(0, 0, 0, 0.2))];
    const b = [boxShadow(2, 4, 8, 0, rgba(0, 0, 0, 0.2))];
    const c = [boxShadow(2, 4, 8, 0, rgba(0, 0, 0, 0.3))];
    expect(boxShadowArraysEqual(a, b)).toBe(true);
    expect(boxShadowArraysEqual(a, c)).toBe(false);
    expect(boxShadowArraysEqual(a, [...a, ...a])).toBe(false);
  });

  it('compares a palette name as a name', () => {
    expect(boxShadowsEqual(boxShadow(0, 1, 2, 0, 'primary'), boxShadow(0, 1, 2, 0, 'primary'))).toBe(true);
    expect(boxShadowsEqual(boxShadow(0, 1, 2, 0, 'primary'), boxShadow(0, 1, 2, 0, 'secondary'))).toBe(false);
    expect(boxShadowsEqual(boxShadow(0, 1, 2, 0, '#000'), boxShadow(0, 1, 2, 0, rgba(0, 0, 0, 1)))).toBe(true);
  });

  it('reaches past each side by the spread, the blur and the offset, and an inset shadow not at all', () => {
    const out = { left: 0, top: 0, right: 0, bottom: 0 };
    boxShadowReach([boxShadow(4, -2, 8, 1, rgba(0, 0, 0, 0.2)), boxShadow(0, 0, 40, 10, rgba(0, 0, 0, 1), true)], out);
    // 1 of spread and 12 of blur (one and a half radii), less or more the offset.
    expect(out).toEqual({ left: 9, top: 15, right: 17, bottom: 11 });
    boxShadowReach([], out);
    expect(out).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });

  it('rounds a shadow as its box is rounded, grown or shrunk by the spread', () => {
    expect(boxShadowRadius(8, 4, false)).toBe(12);
    expect(boxShadowRadius(8, 4, true)).toBe(4);
    expect(boxShadowRadius(8, -10, false)).toBe(0);
    expect(boxShadowRadius(0, 4, false)).toBe(0);
  });
});
