import { describe, expect, it } from 'vitest';
import type { UiColor } from '@gesso/core';
import { brandDarkTheme, brandLightTheme, type BrandColors } from './brandTheme';

/**
 * The one thing about a palette that is not taste.
 *
 * Every other choice in `brandTheme.ts` is the brand's to make, and a
 * test that pinned the hexes would only ever report that somebody
 * changed their mind. Contrast is different: it is the property that
 * decides whether the words can be read, and it is the one that a
 * plausible-looking tweak breaks silently, because the person making
 * the tweak is looking at the colour rather than at the pair.
 *
 * WCAG 2.1 relative luminance, and the 4.5:1 threshold AA sets for
 * body text. Colours are already linear-ish floats in `UiColor`, but
 * they are sRGB, so each channel is expanded before it is weighted.
 */
function luminance({ r, g, b }: UiColor): number {
  const expand = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * expand(r) + 0.7152 * expand(g) + 0.0722 * expand(b);
}

function contrast(a: UiColor, b: UiColor): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** AA for body text; WCAG 2.1 1.4.11 for anything that is not text. */
const TEXT = 4.5;
const NON_TEXT = 3;

describe.each([
  ['light', brandLightTheme.colors as BrandColors],
  ['dark', brandDarkTheme.colors as BrandColors]
])('the %s brand palette', (_name, colors) => {
  it('reads at AA on both of its grounds', () => {
    for (const ground of [colors.background, colors.surface, colors.surfaceRaised, colors.surfaceSunken]) {
      expect(contrast(colors.text, ground)).toBeGreaterThanOrEqual(TEXT);
      expect(contrast(colors.textMuted, ground)).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it('reads at AA on a filled control and on a chosen row', () => {
    expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(colors.controlForeground, colors.controlBackground)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(colors.selectionForeground, colors.selectionBackground)).toBeGreaterThanOrEqual(TEXT);
    // Named for a disabled control and used for the hint under a text
    // field, so it is text and has to clear the text floor.
    expect(contrast(colors.controlForegroundDisabled, colors.controlBackground)).toBeGreaterThanOrEqual(TEXT);
  });

  it('says danger, success and warning legibly, plain and on their own wash', () => {
    const status = [
      [colors.danger, colors.dangerMuted],
      [colors.success, colors.successMuted],
      [colors.warning, colors.warningMuted]
    ] as const;
    for (const [plain, wash] of status) {
      expect(contrast(plain, colors.background)).toBeGreaterThanOrEqual(TEXT);
      // A badge writes the status colour on its own wash. In light the
      // wash is pale and the deep step does the writing, so the pair
      // asserted here is the one a badge actually draws.
      expect(contrast(plain, wash)).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });

  it('draws an edge you can see', () => {
    expect(contrast(colors.borderStrong, colors.background)).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrast(colors.controlBorder, colors.controlBackground)).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrast(colors.focusRing, colors.background)).toBeGreaterThanOrEqual(NON_TEXT);
  });
});
