import { createEnvironmentKey } from './UiEnvironmentKey';
import type { UiTheme } from './UiTheme';
import type { UiTextStyle } from '../properties/UiTextStyle';
import type { UiColor } from '../properties/UiColor';
import { lightTheme, themesEqual } from './UiTheme';
import { defaultTextStyle, textStylesEqual } from '../properties/UiTextStyle';
import { UiBasicColors, colorValuesEqual, colorsEqual } from '../properties/UiColor';
import type { UiColorValue } from '../properties/UiPropertyValues';
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

  /**
   * The text colour a subtree inherits: the `color` of the nearest
   * ancestor that set one, or the colour of the nearest `textStyle`,
   * whichever is closer.
   *
   * Its own key rather than a field of `textStyle`, because what an
   * ancestor sets is often a palette name, and a name has to travel
   * down unresolved: it is looked up against the theme where it is
   * painted, so `color="text"` beside a `theme` means that theme's
   * text, and a card under it that provides another theme gets that
   * theme's. A `UiTextStyle` holds a resolved `UiColor`, which would
   * have fixed the name to whichever theme was in scope where it was
   * written.
   */
  color: createEnvironmentKey<UiColorValue>({
    name: 'color',
    defaultValue: defaultTextStyle.color,
    compare: colorValuesEqual
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
