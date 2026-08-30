import { describe, expect, it } from 'vitest';

import { rgba } from './UiColor';
import { boxShadow, boxShadowArraysEqual, boxShadowsEqual } from './UiBoxShadow';

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
});
