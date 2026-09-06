import { describe, expect, it } from 'vitest';

import { defaultSpacing, scaleSpacing, spacingEqual, spacingSteps } from './UiSpacing';

describe('UiSpacing', () => {
  it('is a four pixel grid with a two pixel step at the bottom', () => {
    expect(defaultSpacing.none).toBe(0);
    expect(defaultSpacing.hairline).toBe(2);
    expect(defaultSpacing.extraSmall).toBe(4);
    expect(defaultSpacing.huge).toBe(32);
  });

  it('rises through every step', () => {
    let previous = -1;
    for (const step of spacingSteps) {
      expect(defaultSpacing[step]).toBeGreaterThan(previous);
      previous = defaultSpacing[step];
    }
  });

  it('scales to whole pixels and keeps zero at zero', () => {
    const compact = scaleSpacing(defaultSpacing, 0.75);
    expect(compact.none).toBe(0);
    expect(compact.small).toBe(6);
    expect(compact.large).toBe(12);
    expect(Object.values(compact).every(value => Number.isInteger(value))).toBe(true);
  });

  it('never scales a gap away entirely', () => {
    const tiny = scaleSpacing(defaultSpacing, 0.1);
    expect(tiny.hairline).toBe(1);
    expect(tiny.none).toBe(0);
  });

  it('compares over every step', () => {
    expect(spacingEqual(defaultSpacing, { ...defaultSpacing })).toBe(true);
    expect(spacingEqual(defaultSpacing, { ...defaultSpacing, huge: 40 })).toBe(false);
  });
});
