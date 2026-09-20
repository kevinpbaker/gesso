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
 *
 * Over the scale's own keys rather than the seven written out, for the
 * reason `typographyEqual` was rewritten the same way: a theme may
 * carry steps of its own (see
 * `UiShapeExtensions`), and a written-out list would let a change to
 * one of those pass as no change at all, so nothing would repaint.
 */
export function shapesEqual(a: UiShapes, b: UiShapes): boolean {
  const left = a as unknown as Readonly<Record<string, number | undefined>>;
  const right = b as unknown as Readonly<Record<string, number | undefined>>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Radii an application adds to the scale, declared by merging.
 *
 * The same mechanism as `UiTypographyExtensions`, for the same reason:
 * seven steps cover a document and not an application, and a control
 * library wants radii the shared scale has no name for. Rather than
 * grow `UiShapes` for everyone, a theme's shape scale may carry names
 * of its own, and an application declares them so they type:
 *
 *   declare module '@gesso/core' {
 *     interface UiShapeExtensions {
 *       readonly control: unknown;
 *       readonly sheet: unknown;
 *     }
 *   }
 *
 * The value type is not used, only the key, because what the theme
 * carries is always a number. Declaring one makes
 * `borderRadius="control"` legal and `borderRadius="contorl"` a
 * compile error, which is the whole point.
 */
export interface UiShapeExtensions {}

/**
 * A step of the scale, as an element names it: `borderRadius="medium"`.
 *
 * Resolved at paint against the theme the element is under, exactly as
 * a palette name in `backgroundColor` is, so a radius follows a theme
 * change without anything on the element knowing.
 */
export type UiShapeName = keyof UiShapes | (keyof UiShapeExtensions & string);

/**
 * Whether a value names a step of the supplied scale.
 *
 * Asked of the scale rather than of a written-out list, so a step an
 * application added is a step. Mirrors `isTypographyRole`.
 */
export function isShapeName(value: unknown, scale: UiShapes): value is UiShapeName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(scale, value);
}
