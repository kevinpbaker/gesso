import { describe, expect, it } from 'vitest';

import { cubicBezier, easingCss, easings, linear } from './UiEasing';

describe('easingCss', () => {
  it('names a curve as CSS writes it, and nothing for one that is only a function', () => {
    expect(easingCss(cubicBezier(0.2, 0, 0, 1))).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(easingCss(easings.emphasized)).toBe('cubic-bezier(0.05, 0.7, 0.1, 1)');
    expect(easingCss(linear)).toBe('linear');
    expect(easingCss(t => t * t)).toBeUndefined();
  });
});
