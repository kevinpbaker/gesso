import type { UiColor } from './UiColor';
import type { UiFontWeight, UiTextAlign, UiTextDirection } from './UiPropertyValues';

/**
 * A coherent typography value.
 *
 * TextStyle is the unit of inheritance: a parent can provide a
 * TextStyle and descendants can override individual fields while
 * keeping the rest.
 */
export interface UiTextStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: UiFontWeight;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly color: UiColor;
  readonly textAlign: UiTextAlign;
  readonly textDirection: UiTextDirection;
}

export const defaultTextStyle: UiTextStyle = {
  fontFamily: 'sans-serif',
  fontSize: 14,
  fontWeight: 'normal',
  lineHeight: 16.8,
  letterSpacing: 0,
  color: { r: 0, g: 0, b: 0, a: 1 },
  textAlign: 'start',
  textDirection: 'ltr'
} as const;

/**
 * Compares two text styles for equality.
 */
export function textStylesEqual(a: UiTextStyle, b: UiTextStyle): boolean {
  const epsilon = 0.0001;
  return (
    a.fontFamily === b.fontFamily &&
    Math.abs(a.fontSize - b.fontSize) < epsilon &&
    a.fontWeight === b.fontWeight &&
    Math.abs(a.lineHeight - b.lineHeight) < epsilon &&
    Math.abs(a.letterSpacing - b.letterSpacing) < epsilon &&
    Math.abs(a.color.r - b.color.r) < epsilon &&
    Math.abs(a.color.g - b.color.g) < epsilon &&
    Math.abs(a.color.b - b.color.b) < epsilon &&
    Math.abs(a.color.a - b.color.a) < epsilon &&
    a.textAlign === b.textAlign &&
    a.textDirection === b.textDirection
  );
}
