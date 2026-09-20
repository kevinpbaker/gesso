import type { UiTextStyle } from '../properties/UiTextStyle';
import { textStylesEqual } from '../properties/UiTextStyle';

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

const defaultBody: UiTextStyle = {
  fontFamily: 'sans-serif',
  fontSize: 14,
  fontWeight: 'normal',
  lineHeight: 16.8,
  letterSpacing: 0,
  color: { r: 0, g: 0, b: 0, a: 1 },
  textAlign: 'start',
  textDirection: 'ltr'
} as const;

export const defaultTypography: UiTypography = {
  body: defaultBody,
  bodyLarge: { ...defaultBody, fontSize: 16, lineHeight: 19.2 },
  bodySmall: { ...defaultBody, fontSize: 12, lineHeight: 14.4 },
  headline: { ...defaultBody, fontSize: 24, fontWeight: 'bold', lineHeight: 28.8 },
  title: { ...defaultBody, fontSize: 20, fontWeight: '500', lineHeight: 24 },
  label: { ...defaultBody, fontSize: 11, fontWeight: '500', lineHeight: 13.2, letterSpacing: 0.5 }
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
