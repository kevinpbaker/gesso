import { describe, expect, it } from 'vitest';

import { colorsEqual, normalizeColor, rgb8, rgba } from '../properties/UiColor';
import { darkTheme, lightTheme, themesEqual, withContrast, withDensity } from './UiTheme';
import { contrastRatio } from './UiContrast';

describe('UiTheme', () => {
  it('has sensible default color tokens', () => {
    expect(colorsEqual(lightTheme.colors.primary, rgb8(37, 99, 235))).toBe(true);
    expect(colorsEqual(lightTheme.colors.background, rgba(1, 1, 1))).toBe(true);
    expect(colorsEqual(lightTheme.colors.text, rgb8(17, 24, 39))).toBe(true);
  });

  it('has default typography tokens', () => {
    expect(lightTheme.typography.body.fontSize).toBe(14);
    expect(lightTheme.typography.body.lineHeight).toBe(20);
    expect(lightTheme.typography.body.fontFamily).toBe('system-ui, sans-serif');
    expect(lightTheme.typography.headline.fontWeight).toBe('600');
  });

  it('dark theme inverts background and text colors', () => {
    expect(colorsEqual(darkTheme.colors.background, rgb8(17, 19, 24))).toBe(true);
    expect(colorsEqual(darkTheme.colors.text, rgb8(243, 244, 246))).toBe(true);
    expect(colorsEqual(darkTheme.typography.body.color, darkTheme.colors.text)).toBe(true);
  });

  // The pairs a stock component writes text in, held to WCAG AA. The
  // values are taste; that these stay readable is not, and it is the
  // property a plausible-looking tweak to one of them breaks.
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme]
  ] as const)('keeps every stock text pair readable in %s', (_name, theme) => {
    const c = theme.colors;
    const pairs = [
      [c.text, c.background],
      [c.text, c.surface],
      [c.textMuted, c.background],
      [c.textMuted, c.surface],
      [c.controlForeground, c.controlBackground],
      [c.controlForeground, c.controlBackgroundPressed],
      [c.controlBackground, c.controlAccent],
      [c.controlBackground, c.controlForeground],
      [c.controlBackground, c.danger],
      [c.danger, c.controlBackground],
      [c.controlAccent, c.controlBackground],
      [c.selectionForeground, c.selectionBackground]
    ] as const;
    for (const [fg, bg] of pairs) {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('has shadow tokens that differ between light and dark', () => {
    expect(lightTheme.shadows.medium.length).toBeGreaterThan(0);
    expect(darkTheme.shadows.medium.length).toBeGreaterThan(0);
    expect(normalizeColor(lightTheme.shadows.medium[0]!.color)!.a).toBeLessThan(
      normalizeColor(darkTheme.shadows.medium[0]!.color)!.a
    );
  });

  it('carries a spacing scale and the two axes', () => {
    expect(lightTheme.spacing.small).toBe(8);
    expect(lightTheme.density).toBe('comfortable');
    expect(lightTheme.contrast).toBe('standard');
  });

  it('compares themes structurally', () => {
    expect(themesEqual(lightTheme, lightTheme)).toBe(true);
    expect(themesEqual(lightTheme, darkTheme)).toBe(false);
  });

  it('a change of density or contrast is a change of theme', () => {
    expect(themesEqual(lightTheme, withDensity(lightTheme, 'compact'))).toBe(false);
    expect(themesEqual(lightTheme, withContrast(lightTheme, 'high'))).toBe(false);
  });
});

describe('withDensity', () => {
  it('shrinks the spacing scale and records the axis', () => {
    const compact = withDensity(lightTheme, 'compact');
    expect(compact.density).toBe('compact');
    expect(compact.spacing.large).toBe(12);
    expect(compact.colors).toBe(lightTheme.colors);
    expect(compact.typography).toBe(lightTheme.typography);
  });

  it('is derived from the base each time, so it does not compound', () => {
    const compact = withDensity(lightTheme, 'compact');
    const spacious = withDensity(compact, 'spacious');
    expect(spacious.spacing.large).toBe(withDensity(lightTheme, 'spacious').spacing.large);
    expect(withDensity(spacious, 'comfortable').spacing.large).toBe(lightTheme.spacing.large);
  });

  it('returns the theme it was given when nothing changes', () => {
    expect(withDensity(lightTheme, 'comfortable')).toBe(lightTheme);
  });
});

describe('withContrast', () => {
  it('raises the palette and records the axis', () => {
    const high = withContrast(darkTheme, 'high');
    expect(high.contrast).toBe('high');
    expect(contrastRatio(high.colors.textMuted, high.colors.background)).toBeGreaterThanOrEqual(7);
  });

  it('refuses to lower a raised palette, since raising loses what it was', () => {
    const high = withContrast(lightTheme, 'high');
    expect(() => withContrast(high, 'standard')).toThrow(/cannot lower/);
  });
});
