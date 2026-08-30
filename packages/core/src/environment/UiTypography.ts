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

const defaultBody: UiTextStyle = {
  fontFamily: 'sans-serif',
  fontSize: 14,
  fontWeight: 'normal',
  lineHeight: 16.8,
  letterSpacing: 0,
  color: { r: 0, g: 0, b: 0, a: 1 },
  textAlign: 'left',
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
 */
export function typographyEqual(a: UiTypography, b: UiTypography): boolean {
  return (
    textStylesEqual(a.body, b.body) &&
    textStylesEqual(a.bodyLarge, b.bodyLarge) &&
    textStylesEqual(a.bodySmall, b.bodySmall) &&
    textStylesEqual(a.headline, b.headline) &&
    textStylesEqual(a.title, b.title) &&
    textStylesEqual(a.label, b.label)
  );
}
