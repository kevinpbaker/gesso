/**
 * A renderer-independent spacing scale.
 *
 * Each value is a logical pixel gap. The names are the shape scale's
 * names on purpose: an application that has learned `borderRadius`
 * from `theme.shapes` already knows what `small` and `extraLarge`
 * mean, and one vocabulary across the theme is one thing to learn.
 *
 * Eight steps rather than the shape scale's seven, because spacing is
 * the token an application reaches for most often and a scale that
 * cannot say "two" sends the author back to a literal. The values are
 * a four pixel grid with a two pixel step at the bottom, which is what
 * the two applications' own numbers already cluster on.
 */
export interface UiSpacing {
  readonly none: number;
  readonly hairline: number;
  readonly extraSmall: number;
  readonly small: number;
  readonly medium: number;
  readonly large: number;
  readonly extraLarge: number;
  readonly huge: number;
}

export const defaultSpacing: UiSpacing = {
  none: 0,
  hairline: 2,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 24,
  huge: 32
} as const;

/** The steps, in order, for a scale that is derived rather than written out. */
export const spacingSteps: readonly (keyof UiSpacing)[] = [
  'none',
  'hairline',
  'extraSmall',
  'small',
  'medium',
  'large',
  'extraLarge',
  'huge'
] as const;

/**
 * The same scale at a different density.
 *
 * Rounded to whole pixels, because a padding that lands on a half
 * pixel puts every box inside it on one too, and the renderers snap
 * differently at that point. `none` stays zero at every density: a gap
 * an application asked not to have is not a gap to shrink.
 */
export function scaleSpacing(spacing: UiSpacing, factor: number): UiSpacing {
  const scaled: Record<string, number> = {};
  for (const step of spacingSteps) {
    const value = spacing[step];
    scaled[step] = value === 0 ? 0 : Math.max(1, Math.round(value * factor));
  }
  return scaled as unknown as UiSpacing;
}

/**
 * Compares two spacing scales for equality.
 */
export function spacingEqual(a: UiSpacing, b: UiSpacing): boolean {
  for (const step of spacingSteps) {
    if (a[step] !== b[step]) {
      return false;
    }
  }
  return true;
}
