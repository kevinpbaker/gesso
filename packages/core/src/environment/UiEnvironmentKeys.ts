import { createEnvironmentKey } from './UiEnvironmentKey';
import type { UiTheme } from './UiTheme';
import type { UiTextStyle } from '../properties/UiTextStyle';
import type { UiColor } from '../properties/UiColor';
import { lightTheme, themesEqual } from './UiTheme';
import { defaultTextStyle, textStylesEqual } from '../properties/UiTextStyle';
import { UiBasicColors, colorsEqual } from '../properties/UiColor';
import type { UiContainerSize } from './UiContainerSize';
import { unknownContainerSize } from './UiContainerSize';
import type { UiInsetSource } from './UiInsets';
import { UiInsetRegistry } from './UiInsets';

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
    defaultValue: UiBasicColors.black,
    compare: colorsEqual
  }),

  /**
   * How much room the nearest container that declared itself one has,
   * as it changes. Provided by `Responsive` and by the
   * `containerSize` property; see `UiContainerSize`.
   */
  containerSize: createEnvironmentKey<UiContainerSize>({
    name: 'containerSize',
    defaultValue: unknownContainerSize
  }),

  /**
   * What is in the way of the content on each edge: the platform's
   * safe area, the soft keyboard, and whatever the application floats
   * over itself. See `UiInsets`.
   *
   * The default is an empty registry rather than a constant, so a
   * screen mounted outside any provider can still publish into one and
   * read the result back. It is a shared object, which is fine because
   * a runtime with no provider has one screen in it; an application
   * with two windows provides one per window.
   */
  insets: createEnvironmentKey<UiInsetSource>({
    name: 'insets',
    defaultValue: new UiInsetRegistry()
  })
} as const;
