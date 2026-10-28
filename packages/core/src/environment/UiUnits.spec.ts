import { describe, expect, it } from 'vitest';

import { defaultUnits, lengths, unitsEqual } from './UiUnits';

describe('lengths', () => {
  it('measures as CSS does by default: 96 to the inch, 16 to the rem', () => {
    const { rem, inch, pt, mm, units } = lengths();

    expect(units).toBe(defaultUnits);
    expect(rem(1)).toBe(16);
    expect(rem(1.5)).toBe(24);
    expect(inch(1)).toBe(96);
    expect(pt(12)).toBe(16);
    expect(pt(10.5)).toBe(14);
    expect(mm(25.4)).toBeCloseTo(96, 10);
  });

  it('follows the pixels per inch for inches, points and millimetres, and the root font for rems', () => {
    const { rem, inch, pt, mm } = lengths({ pixelsPerInch: 144, rootFontSize: 20 });

    expect(inch(0.5)).toBe(72);
    expect(pt(72)).toBe(144);
    expect(mm(25.4)).toBeCloseTo(144, 10);
    expect(rem(2)).toBe(40);
  });

  it('refuses units that cannot measure anything', () => {
    expect(() => lengths({ pixelsPerInch: 0, rootFontSize: 16 })).toThrow(/pixelsPerInch/);
    expect(() => lengths({ pixelsPerInch: 96, rootFontSize: -1 })).toThrow(/rootFontSize/);
    expect(() => lengths({ pixelsPerInch: Number.NaN, rootFontSize: 16 })).toThrow(RangeError);
  });

  it('compares units by value', () => {
    expect(unitsEqual(defaultUnits, { pixelsPerInch: 96, rootFontSize: 16 })).toBe(true);
    expect(unitsEqual(defaultUnits, { pixelsPerInch: 72, rootFontSize: 16 })).toBe(false);
  });
});
