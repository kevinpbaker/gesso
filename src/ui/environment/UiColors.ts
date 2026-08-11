import type { UiColor } from '../properties/UiColor';
import { colorsEqual, UiColors } from '../properties/UiColor';

/**
 * A renderer-independent color palette.
 *
 * This is a starter set of semantic colors. Names are not hard
 * requirements; consumers can define additional palettes or extend
 * this shape as the framework grows.
 */
export interface UiColors {
  readonly background: UiColor;
  readonly surface: UiColor;
  readonly primary: UiColor;
  readonly secondary: UiColor;
  readonly text: UiColor;
  readonly textMuted: UiColor;
  readonly border: UiColor;
  readonly shadow: UiColor;
}

export const lightColors: UiColors = {
  background: UiColors.white,
  surface: { r: 0.98, g: 0.98, b: 0.98, a: 1 },
  primary: { r: 0.13, g: 0.59, b: 0.95, a: 1 },
  secondary: { r: 0.61, g: 0.15, b: 0.69, a: 1 },
  text: UiColors.black,
  textMuted: { r: 0.4, g: 0.4, b: 0.4, a: 1 },
  border: { r: 0.85, g: 0.85, b: 0.85, a: 1 },
  shadow: { r: 0, g: 0, b: 0, a: 0.2 }
} as const;

export const darkColors: UiColors = {
  background: { r: 0.12, g: 0.12, b: 0.12, a: 1 },
  surface: { r: 0.18, g: 0.18, b: 0.18, a: 1 },
  primary: { r: 0.4, g: 0.76, b: 1, a: 1 },
  secondary: { r: 0.88, g: 0.6, b: 0.94, a: 1 },
  text: UiColors.white,
  textMuted: { r: 0.6, g: 0.6, b: 0.6, a: 1 },
  border: { r: 0.3, g: 0.3, b: 0.3, a: 1 },
  shadow: { r: 0, g: 0, b: 0, a: 0.5 }
} as const;

/**
 * Compares two color palettes for equality.
 */
export function colorsEqualPalette(a: UiColors, b: UiColors): boolean {
  return (
    colorsEqual(a.background, b.background) &&
    colorsEqual(a.surface, b.surface) &&
    colorsEqual(a.primary, b.primary) &&
    colorsEqual(a.secondary, b.secondary) &&
    colorsEqual(a.text, b.text) &&
    colorsEqual(a.textMuted, b.textMuted) &&
    colorsEqual(a.border, b.border) &&
    colorsEqual(a.shadow, b.shadow)
  );
}
