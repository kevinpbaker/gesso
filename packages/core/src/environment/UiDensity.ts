/**
 * How tightly a theme packs.
 *
 * An axis rather than a second theme: an application that wants a
 * compact table and a comfortable settings sheet provides the same
 * theme twice with one field changed, and nothing else about its
 * colours or type is duplicated.
 *
 * `comfortable` is the scale as written. `compact` is three quarters
 * of it, `spacious` a quarter more. Only the spacing scale moves; type
 * and shape do not, because a smaller gap between two rows is a
 * density choice and a smaller word is a typography one.
 */
export type UiDensity = 'compact' | 'comfortable' | 'spacious';

/** The multiplier each density applies to the spacing scale. */
export const densityFactors: Readonly<Record<UiDensity, number>> = {
  compact: 0.75,
  comfortable: 1,
  spacious: 1.25
} as const;
