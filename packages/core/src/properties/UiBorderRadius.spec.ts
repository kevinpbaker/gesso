import { describe, expect, it } from 'vitest';

import {
  borderRadius,
  borderRadiusCorners,
  borderRadiusEqual,
  borderRadiusIsZero,
  normalizeBorderRadius,
  uniformBorderRadius
} from './UiBorderRadius';

describe('UiBorderRadius', () => {
  it('creates a uniform radius', () => {
    expect(borderRadius(8)).toEqual({ topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 });
  });

  it('creates per-corner radii', () => {
    expect(borderRadiusCorners(1, 2, 3, 4)).toEqual({ topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 });
  });

  it('compares radii for equality', () => {
    expect(borderRadiusEqual(borderRadius(8), borderRadius(8))).toBe(true);
    expect(borderRadiusEqual(borderRadius(8), borderRadiusCorners(8, 8, 8, 8))).toBe(true);
    expect(borderRadiusEqual(borderRadius(8), borderRadius(9))).toBe(false);
  });

  it('detects zero radii', () => {
    expect(borderRadiusIsZero(borderRadius(0))).toBe(true);
    expect(borderRadiusIsZero(borderRadius(1))).toBe(false);
  });

  it('normalizes numbers to uniform radii', () => {
    expect(normalizeBorderRadius(8)).toEqual(borderRadius(8));
  });

  it('normalizes partial objects', () => {
    expect(normalizeBorderRadius({ topLeft: 4 })).toEqual(borderRadiusCorners(4, 0, 0, 0));
  });

  it('clamps negative radii to zero', () => {
    expect(normalizeBorderRadius(-4)).toEqual(borderRadius(0));
    expect(normalizeBorderRadius({ topLeft: -2, topRight: 4 })).toEqual(borderRadiusCorners(0, 4, 0, 0));
  });

  it('returns a uniform scalar radius', () => {
    expect(uniformBorderRadius(borderRadiusCorners(2, 4, 6, 8))).toBe(8);
  });
});
