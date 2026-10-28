import type { UiSpacing } from './UiSpacing';
import type { UiTheme } from './UiTheme';
import type { UiThemeExtensions } from './UiThemeExtension';
import type { UiTypography } from './UiTypography';

/**
 * What the person points with: a mouse or a trackpad (`fine`), or a
 * finger (`coarse`), as CSS's `pointer` media feature says it.
 *
 * Separate from how big the screen is, because the two do not go
 * together: a tablet with a trackpad is fine, a laptop with a touch
 * screen is coarse. A layout follows the width (`Responsive`,
 * `breakpoint`); a control follows this, growing to a target a finger
 * can hit.
 */
export type UiPointer = 'fine' | 'coarse';

/**
 * What a theme changes for a finger, laid over itself by
 * `withPointer(theme, 'coarse')`: type a size larger (an input at 16
 * pixels, which a phone does not zoom into), more room, and token
 * groups of its own for touch. Any part left out stays as it is, and a
 * token group the theme does not carry falls back to the group's own
 * touch values (`UiThemeExtensionOptions.coarse`).
 */
export interface UiThemeTouch {
  readonly typography?: Partial<UiTypography>;
  readonly spacing?: Partial<UiSpacing>;
  readonly extensions?: UiThemeExtensions;
}

/** The smallest target a finger can be asked to hit, in pixels: WCAG's 2.5.5, Apple's and Android's 44 to 48. */
export const TOUCH_TARGET = 44;

/**
 * The same theme for another pointer.
 *
 * Turned to `coarse`, it is the theme with its `touch` laid over it and
 * `pointer` saying so; turned back, it is the theme it was turned from,
 * kept for the purpose, so a subtree that goes from touch to mouse and
 * back gets the identical theme each time. A theme already for that
 * pointer is returned as it is.
 */
export function withPointer(theme: UiTheme, pointer: UiPointer): UiTheme {
  if ((theme.pointer ?? 'fine') === pointer) {
    return theme;
  }
  if (pointer === 'fine') {
    return fineThemes.get(theme) ?? { ...theme, pointer: 'fine' };
  }
  const touch = theme.touch ?? {};
  const turned: UiTheme = {
    ...theme,
    pointer: 'coarse',
    typography:
      touch.typography === undefined
        ? theme.typography
        : ({ ...theme.typography, ...touch.typography } as UiTypography),
    spacing: touch.spacing === undefined ? theme.spacing : { ...theme.spacing, ...touch.spacing },
    ...(touch.extensions === undefined
      ? {}
      : { extensions: new Map([...(theme.extensions ?? []), ...touch.extensions]) })
  };
  fineThemes.set(turned, theme);
  return turned;
}

/** Each touch theme's mouse self, for turning it back. */
const fineThemes = new WeakMap<UiTheme, UiTheme>();
