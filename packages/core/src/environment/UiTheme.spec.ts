import { describe, expect, it } from 'vitest';

import { colorsEqual, rgba } from '../properties/UiColor';
import { darkTheme, lightTheme, themesEqual } from './UiTheme';

describe('UiTheme', () => {
  it('has sensible default color tokens', () => {
    expect(colorsEqual(lightTheme.colors.primary, rgba(0.13, 0.59, 0.95))).toBe(true);
    expect(colorsEqual(lightTheme.colors.background, rgba(1, 1, 1))).toBe(true);
    expect(colorsEqual(lightTheme.colors.text, rgba(0, 0, 0))).toBe(true);
  });

  it('has default typography tokens', () => {
    expect(lightTheme.typography.body.fontSize).toBe(14);
    expect(lightTheme.typography.headline.fontWeight).toBe('bold');
  });

  it('dark theme inverts background and text colors', () => {
    expect(colorsEqual(darkTheme.colors.background, rgba(0.12, 0.12, 0.12))).toBe(true);
    expect(colorsEqual(darkTheme.colors.text, rgba(1, 1, 1))).toBe(true);
  });

  it('has shadow tokens that differ between light and dark', () => {
    expect(lightTheme.shadows.medium.length).toBeGreaterThan(0);
    expect(darkTheme.shadows.medium.length).toBeGreaterThan(0);
    expect(lightTheme.shadows.medium[0]!.color.a).toBeLessThan(darkTheme.shadows.medium[0]!.color.a);
  });

  it('compares themes structurally', () => {
    expect(themesEqual(lightTheme, lightTheme)).toBe(true);
    expect(themesEqual(lightTheme, darkTheme)).toBe(false);
  });
});
