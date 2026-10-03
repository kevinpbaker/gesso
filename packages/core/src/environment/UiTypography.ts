import type { UiTextStyle } from '../properties/UiTextStyle';
import { defaultTextStyle, textStylesEqual } from '../properties/UiTextStyle';

/**
 * A typography scale.
 *
 * Each named style is a complete TextStyle so that it can be
 * inherited as a unit. Components can override individual fields
 * while falling back to the scale for the rest.
 */
export interface UiTypography {
  readonly body: UiTextStyle;
  readonly bodyLarge: UiTextStyle;
  readonly bodySmall: UiTextStyle;
  readonly headline: UiTextStyle;
  readonly title: UiTextStyle;
  readonly label: UiTextStyle;
}

/**
 * Roles an application adds to the scale, declared by merging.
 *
 * A scale of six covers a document and not an application: the two
 * applications here use fourteen and eleven distinct sizes. Rather
 * than grow `UiTypography` for everyone, or send an application back
 * to writing numbers on elements, a theme's typography may carry names
 * of its own, and an application declares them so they type:
 *
 *   declare module 'gesso-core' {
 *     interface UiTypographyExtensions {
 *       readonly cardTitle: unknown;
 *       readonly display: unknown;
 *     }
 *   }
 *
 * The value type is not used, only the key, because what the theme
 * carries is always a `UiTextStyle`. Declaring one makes
 * `textStyle="cardTitle"` legal and `textStyle="cardTtile"` a compile
 * error, which is the whole point.
 */
export interface UiTypographyExtensions {}

/**
 * A role in the scale, as an element names it: `textStyle="title"`.
 *
 * The idiom the documentation teaches. A size, a weight and a line
 * height written out on an element are three numbers to keep in step
 * across a screen and six to keep in step across an application, and
 * none of them follows a theme; a role is one word that does.
 */
export type UiTypographyRole = keyof UiTypography | (keyof UiTypographyExtensions & string);

/**
 * Whether a value names a role of the supplied scale.
 *
 * Asked of the scale rather than of a written-out list, so a role an
 * application added is a role. A name the scale does not carry is not
 * one, and the element keeps whatever type it inherited rather than
 * drawing at a default size, which is the quieter of the two failures.
 */
export function isTypographyRole(value: unknown, scale: UiTypography): value is UiTypographyRole {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(scale, value);
}

/**
 * The stock scale: one face, and line heights on a 4-point grid rather
 * than 1.2 of the size, so a paragraph has room and a stack of text
 * lines up with the spacing scale around it.
 */
export const defaultTypography: UiTypography = {
  body: defaultTextStyle,
  bodyLarge: { ...defaultTextStyle, fontSize: 16, lineHeight: 24 },
  bodySmall: { ...defaultTextStyle, fontSize: 12, lineHeight: 16 },
  headline: { ...defaultTextStyle, fontSize: 24, fontWeight: '600', lineHeight: 32, letterSpacing: -0.25 },
  title: { ...defaultTextStyle, fontSize: 20, fontWeight: '600', lineHeight: 28 },
  label: { ...defaultTextStyle, fontSize: 12, fontWeight: '500', lineHeight: 16 }
} as const;

/**
 * Compares two typography scales for equality.
 *
 * Over the keys rather than a written-out list, as `colorsEqualPalette`
 * is and for the same reason: a scale that carries roles of its own
 * has to invalidate on a change to one of them. Written out, the six
 * shipped roles were compared and an application's own were not, so a
 * scale differing only in a role it had added compared equal and the
 * change never reached the nodes that would have read it.
 */
export function typographyEqual(a: UiTypography, b: UiTypography): boolean {
  const left = a as unknown as Record<string, UiTextStyle | undefined>;
  const right = b as unknown as Record<string, UiTextStyle | undefined>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    const one = left[key];
    const other = right[key];
    if (one === undefined || other === undefined) {
      if (one !== other) {
        return false;
      }
      continue;
    }
    if (!textStylesEqual(one, other)) {
      return false;
    }
  }
  return true;
}
