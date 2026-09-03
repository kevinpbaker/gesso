import type { UiColors } from './UiColors';
import type { UiTypography } from './UiTypography';
import type { UiShapes } from './UiShapes';
import type { UiShadows } from './UiShadows';
import { colorsEqualPalette, darkColors, lightColors } from './UiColors';
import { typographyEqual } from './UiTypography';
import { shapesEqual } from './UiShapes';
import { shadowsEqual } from './UiShadows';
import { boxShadow } from '../properties/UiBoxShadow';

/**
 * A renderer-independent theme.
 *
 * A theme bundles colors, typography, and shapes into a single
 * environment value. It can be provided at any node and is
 * inherited by descendants until another provider overrides it.
 */
export interface UiTheme {
  readonly colors: UiColors;
  readonly typography: UiTypography;
  readonly shapes: UiShapes;
  readonly shadows: UiShadows;
}

export const lightTheme: UiTheme = {
  colors: lightColors,
  typography: {
    body: {
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: 'normal',
      lineHeight: 16.8,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      textAlign: 'start',
      textDirection: 'ltr'
    },
    bodyLarge: {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: 'normal',
      lineHeight: 19.2,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      textAlign: 'start',
      textDirection: 'ltr'
    },
    bodySmall: {
      fontFamily: 'sans-serif',
      fontSize: 12,
      fontWeight: 'normal',
      lineHeight: 14.4,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      textAlign: 'start',
      textDirection: 'ltr'
    },
    headline: {
      fontFamily: 'sans-serif',
      fontSize: 24,
      fontWeight: 'bold',
      lineHeight: 28.8,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      textAlign: 'start',
      textDirection: 'ltr'
    },
    title: {
      fontFamily: 'sans-serif',
      fontSize: 20,
      fontWeight: '500',
      lineHeight: 24,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      textAlign: 'start',
      textDirection: 'ltr'
    },
    label: {
      fontFamily: 'sans-serif',
      fontSize: 11,
      fontWeight: '500',
      lineHeight: 13.2,
      letterSpacing: 0.5,
      color: { r: 0, g: 0, b: 0, a: 1 },
      textAlign: 'start',
      textDirection: 'ltr'
    }
  },
  shapes: {
    none: 0,
    extraSmall: 2,
    small: 4,
    medium: 8,
    large: 16,
    extraLarge: 24,
    full: 9999
  },
  shadows: {
    none: [],
    extraSmall: [boxShadow(0, 1, 2, 0, { r: 0, g: 0, b: 0, a: 0.05 })],
    small: [boxShadow(0, 1, 3, 0, { r: 0, g: 0, b: 0, a: 0.1 })],
    medium: [
      boxShadow(0, 4, 6, -1, { r: 0, g: 0, b: 0, a: 0.1 }),
      boxShadow(0, 2, 4, -1, { r: 0, g: 0, b: 0, a: 0.06 })
    ],
    large: [
      boxShadow(0, 10, 15, -3, { r: 0, g: 0, b: 0, a: 0.1 }),
      boxShadow(0, 4, 6, -2, { r: 0, g: 0, b: 0, a: 0.05 })
    ],
    extraLarge: [
      boxShadow(0, 20, 25, -5, { r: 0, g: 0, b: 0, a: 0.1 }),
      boxShadow(0, 8, 10, -6, { r: 0, g: 0, b: 0, a: 0.04 })
    ]
  }
} as const;

export const darkTheme: UiTheme = {
  ...lightTheme,
  colors: darkColors,
  typography: {
    body: { ...lightTheme.typography.body, color: { r: 1, g: 1, b: 1, a: 1 } },
    bodyLarge: { ...lightTheme.typography.bodyLarge, color: { r: 1, g: 1, b: 1, a: 1 } },
    bodySmall: { ...lightTheme.typography.bodySmall, color: { r: 1, g: 1, b: 1, a: 1 } },
    headline: { ...lightTheme.typography.headline, color: { r: 1, g: 1, b: 1, a: 1 } },
    title: { ...lightTheme.typography.title, color: { r: 1, g: 1, b: 1, a: 1 } },
    label: { ...lightTheme.typography.label, color: { r: 1, g: 1, b: 1, a: 1 } }
  },
  shadows: {
    none: [],
    extraSmall: [boxShadow(0, 1, 2, 0, { r: 0, g: 0, b: 0, a: 0.2 })],
    small: [boxShadow(0, 1, 3, 0, { r: 0, g: 0, b: 0, a: 0.3 })],
    medium: [
      boxShadow(0, 4, 6, -1, { r: 0, g: 0, b: 0, a: 0.35 }),
      boxShadow(0, 2, 4, -1, { r: 0, g: 0, b: 0, a: 0.25 })
    ],
    large: [
      boxShadow(0, 10, 15, -3, { r: 0, g: 0, b: 0, a: 0.4 }),
      boxShadow(0, 4, 6, -2, { r: 0, g: 0, b: 0, a: 0.25 })
    ],
    extraLarge: [
      boxShadow(0, 20, 25, -5, { r: 0, g: 0, b: 0, a: 0.45 }),
      boxShadow(0, 8, 10, -6, { r: 0, g: 0, b: 0, a: 0.3 })
    ]
  }
} as const;

/**
 * Compares two themes for equality.
 */
export function themesEqual(a: UiTheme, b: UiTheme): boolean {
  return (
    colorsEqualPalette(a.colors, b.colors) &&
    typographyEqual(a.typography, b.typography) &&
    shapesEqual(a.shapes, b.shapes) &&
    shadowsEqual(a.shadows, b.shadows)
  );
}
