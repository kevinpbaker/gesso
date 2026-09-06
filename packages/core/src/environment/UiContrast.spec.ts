import { describe, expect, it } from 'vitest';

import { rgba } from '../properties/UiColor';
import { contrastRatio, highContrastColors, raiseContrast, relativeLuminance } from './UiContrast';
import { darkColors, lightColors } from './UiColors';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio(rgba(0, 0, 0), rgba(1, 1, 1))).toBeCloseTo(21, 5);
    expect(contrastRatio(rgba(0.4, 0.2, 0.7), rgba(0.4, 0.2, 0.7))).toBeCloseTo(1, 5);
  });

  it('reads luminance the way WCAG does', () => {
    expect(relativeLuminance(rgba(1, 1, 1))).toBeCloseTo(1, 5);
    expect(relativeLuminance(rgba(0, 0, 0))).toBeCloseTo(0, 5);
  });
});

describe('raiseContrast', () => {
  it('leaves a colour that already clears the ratio alone', () => {
    const black = rgba(0, 0, 0);
    expect(raiseContrast(black, rgba(1, 1, 1), 7)).toBe(black);
  });

  it('darkens a foreground on a light ground until it clears', () => {
    const muted = rgba(0.55, 0.55, 0.55);
    const raised = raiseContrast(muted, rgba(1, 1, 1), 7);
    expect(contrastRatio(raised, rgba(1, 1, 1))).toBeGreaterThanOrEqual(7);
    expect(relativeLuminance(raised)).toBeLessThan(relativeLuminance(muted));
  });

  it('lightens a foreground on a dark ground', () => {
    const muted = rgba(0.35, 0.35, 0.35);
    const raised = raiseContrast(muted, rgba(0.1, 0.1, 0.1), 7);
    expect(contrastRatio(raised, rgba(0.1, 0.1, 0.1))).toBeGreaterThanOrEqual(7);
    expect(relativeLuminance(raised)).toBeGreaterThan(relativeLuminance(muted));
  });

  it('keeps the alpha it was given', () => {
    const raised = raiseContrast(rgba(0.5, 0.5, 0.5, 0.4), rgba(1, 1, 1), 7);
    expect(raised.a).toBe(0.4);
  });
});

describe('highContrastColors', () => {
  it('raises text against the background in both stock palettes', () => {
    for (const palette of [lightColors, darkColors]) {
      const raised = highContrastColors(palette);
      expect(contrastRatio(raised.text, palette.background)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(raised.textMuted, palette.background)).toBeGreaterThanOrEqual(7);
    }
  });

  it('measures a control token against the control, not the page', () => {
    const raised = highContrastColors(darkColors);
    expect(contrastRatio(raised.controlForeground, darkColors.controlBackground)).toBeGreaterThanOrEqual(7);
  });

  it('leaves the grounds where they were', () => {
    const raised = highContrastColors(lightColors);
    expect(raised.background).toBe(lightColors.background);
    expect(raised.surface).toBe(lightColors.surface);
    expect(raised.controlBackgroundHovered).toBe(lightColors.controlBackgroundHovered);
  });

  it('raises a name a custom palette added', () => {
    const custom = { ...lightColors, accentSoft: rgba(0.75, 0.7, 0.4) };
    const raised = highContrastColors(custom) as typeof custom;
    expect(contrastRatio(raised.accentSoft, custom.background)).toBeGreaterThanOrEqual(7);
  });
});
