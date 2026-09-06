import type { UiColors } from './UiColors';
import type { UiTypography } from './UiTypography';
import type { UiShapes } from './UiShapes';
import type { UiShadows } from './UiShadows';
import type { UiSpacing } from './UiSpacing';
import type { UiDensity } from './UiDensity';
import type { UiContrast } from './UiContrast';
import type { UiThemeExtensions } from './UiThemeExtension';
import { colorsEqualPalette, darkColors, lightColors } from './UiColors';
import { typographyEqual } from './UiTypography';
import { shapesEqual } from './UiShapes';
import { shadowsEqual } from './UiShadows';
import { defaultSpacing, scaleSpacing, spacingEqual } from './UiSpacing';
import { densityFactors } from './UiDensity';
import { highContrastColors } from './UiContrast';
import { themeExtensionsEqual } from './UiThemeExtension';
import { boxShadow } from '../properties/UiBoxShadow';

/**
 * A renderer-independent theme.
 *
 * A theme bundles colors, typography, shapes, shadows and spacing into
 * a single environment value. It can be provided at any node and is
 * inherited by descendants until another provider overrides it.
 *
 * `density` and `contrast` are axes rather than scales: they record
 * which way this theme was already turned, so a component can branch
 * on the answer and `withDensity` and `withContrast` can turn it
 * again from the base. `extensions` is where an application's own
 * token groups live; see `UiThemeExtension.ts`.
 */
export interface UiTheme {
  readonly colors: UiColors;
  readonly typography: UiTypography;
  readonly shapes: UiShapes;
  readonly shadows: UiShadows;
  readonly spacing: UiSpacing;
  readonly density: UiDensity;
  readonly contrast: UiContrast;
  readonly extensions?: UiThemeExtensions;
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
  spacing: defaultSpacing,
  density: 'comfortable',
  contrast: 'standard',
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
 *
 * The extensions are compared with each extension's own comparison, so
 * an application that adds a token group gets invalidation on a change
 * to it without editing this function. That was the point of the
 * mechanism: `COMPONENTS_ROADMAP.md` §2.3 warned that a theme layer
 * added without extending `themesEqual` is a theme change that does
 * not repaint, and it is easy to forget.
 */
export function themesEqual(a: UiTheme, b: UiTheme): boolean {
  return (
    a.density === b.density &&
    a.contrast === b.contrast &&
    colorsEqualPalette(a.colors, b.colors) &&
    typographyEqual(a.typography, b.typography) &&
    shapesEqual(a.shapes, b.shapes) &&
    shadowsEqual(a.shadows, b.shadows) &&
    spacingEqual(a.spacing, b.spacing) &&
    themeExtensionsEqual(a.extensions, b.extensions)
  );
}

/**
 * The same theme at another density.
 *
 * Derived from the theme it is given rather than from a base, so
 * asking twice for `compact` does not shrink the scale twice: a theme
 * already at that density is returned unchanged.
 */
export function withDensity(theme: UiTheme, density: UiDensity): UiTheme {
  if (theme.density === density) {
    return theme;
  }
  const base = scaleSpacing(theme.spacing, 1 / densityFactors[theme.density]);
  return { ...theme, density, spacing: scaleSpacing(base, densityFactors[density]) };
}

/**
 * The same theme at another contrast.
 *
 * There is no way back from `high`: raising a palette loses what it
 * was, and a theme that has to be able to return keeps its standard
 * self and derives the high-contrast one from it. That is what an
 * application does anyway, since the setting it follows is a cell and
 * both themes exist for the life of the application.
 */
export function withContrast(theme: UiTheme, contrast: UiContrast): UiTheme {
  if (theme.contrast === contrast) {
    return theme;
  }
  if (contrast === 'standard') {
    throw new Error('withContrast cannot lower a raised palette; keep the standard theme and derive the high one.');
  }
  return { ...theme, contrast, colors: highContrastColors(theme.colors) };
}
