/**
 * A renderer-independent shape scale.
 *
 * Each value is a logical pixel radius. These are semantic names;
 * renderers translate them into border radii or other shape
 * representations.
 */
export interface UiShapes {
  readonly none: number;
  readonly extraSmall: number;
  readonly small: number;
  readonly medium: number;
  readonly large: number;
  readonly extraLarge: number;
  readonly full: number;
}

export const defaultShapes: UiShapes = {
  none: 0,
  extraSmall: 2,
  small: 4,
  medium: 8,
  large: 16,
  extraLarge: 24,
  full: 9999
} as const;

/**
 * Compares two shape scales for equality.
 */
export function shapesEqual(a: UiShapes, b: UiShapes): boolean {
  return (
    a.none === b.none &&
    a.extraSmall === b.extraSmall &&
    a.small === b.small &&
    a.medium === b.medium &&
    a.large === b.large &&
    a.extraLarge === b.extraLarge &&
    a.full === b.full
  );
}
