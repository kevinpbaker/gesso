import { createEnvironmentKey } from './UiEnvironmentKey';
import type { UiTheme } from './UiTheme';
import type { UiTextStyle } from '../properties/UiTextStyle';
import type { UiColor } from '../properties/UiColor';
import { lightTheme, themesEqual } from './UiTheme';
import { defaultTextStyle, textStylesEqual } from '../properties/UiTextStyle';
import { UiColors, colorsEqual } from '../properties/UiColor';

/**
 * Built-in environment keys.
 *
 * These are the scoped values that nodes can provide and
 * descendants can resolve. Additional keys can be defined anywhere
 * by calling createEnvironmentKey().
 */
export const UiEnvironmentKeys = {
  theme: createEnvironmentKey<UiTheme>({
    name: 'theme',
    defaultValue: lightTheme,
    compare: themesEqual
  }),

  textStyle: createEnvironmentKey<UiTextStyle>({
    name: 'textStyle',
    defaultValue: defaultTextStyle,
    compare: textStylesEqual
  }),

  contentColor: createEnvironmentKey<UiColor>({
    name: 'contentColor',
    defaultValue: UiColors.black,
    compare: colorsEqual
  })
} as const;
