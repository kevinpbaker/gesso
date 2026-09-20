import { defaultSpacing, defineThemeExtension, type UiThemeExtension, type UiTypographyRole } from '@gesso/core';

/**
 * The tokens `@gesso/components` reads, as a theme extension.
 *
 * How a library component is
 * restyled: through the theme, never through a colour prop. The
 * palette answered most of it — every control already names
 * `controlBackground`, `controlAccent` and the rest, resolved at
 * paint — answered radii on an element. What was
 * left is everything a palette cannot say:
 *
 *   - **Metrics.** A control's padding and radius were literals in the
 *     component body, and a body runs once before its node has an
 *     environment, so they were frozen at whatever the library chose.
 *   - **Mappings.** Which palette token a variant uses. An application
 *     could change what `controlAccent` *is*; it could not say that
 *     its tonal buttons should use the selection pair instead.
 *   - **Interaction.** How a filled button answers the pointer. It
 *     dims, because it has no token to move to, and the amount it dims
 *     by was a number in a module.
 *
 * All three are now one group on the theme, read through
 * `themeTokenCell` and bound like any other reactive value. Restyling
 * is a provider:
 *
 *   const mine = withThemeExtension(lightTheme, controlTokens, {
 *     ...controlTokens.defaults,
 *     radius: { ...controlTokens.defaults.radius, field: 0 }
 *   });
 *   <box theme={mine}>…</box>
 *
 * **The defaults are exactly what the components drew before.** That
 * is deliberate: converting a component to read a token must not move
 * a pixel, so the migration is provably visual-no-op and a baseline
 * that shifts is a bug rather than a decision.
 */
export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'plain';
export type ButtonTone = 'neutral' | 'accent' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

/** What a variant and tone paint with. Every value is a palette name. */
export interface ButtonPaint {
  readonly background: string;
  readonly foreground: string;
  readonly border?: string;
}

export interface ButtonSizeTokens {
  readonly paddingX: number;
  readonly paddingY: number;
  readonly radius: number;
  readonly textStyle: UiTypographyRole;
}

/**
 * Radii by the role a box plays, not by the widget it is in.
 *
 * One `field` serves the text field, the number field and a select's
 * trigger, so a theme that squares off its inputs squares all three
 * without naming any of them. This is the shape §2.3 asked for, and
 * the reason these are here rather than in `theme.shapes`: the shared
 * scale has no name for 6 or 10, and inventing one for a control's
 * sake would put a library's taste in everyone's vocabulary.
 */
export interface ControlRadiusTokens {
  readonly field: number;
  readonly checkbox: number;
  /** A list, tree or table's own box: the thing rows are scrolled inside. */
  readonly scroller: number;
  /** A dialog or a popover: a surface that sits above the page. */
  readonly sheet: number;
}

export interface ButtonTokens {
  readonly sizes: Readonly<Record<ButtonSize, ButtonSizeTokens>>;
  readonly paint: Readonly<Record<ButtonVariant, Readonly<Record<ButtonTone, ButtonPaint>>>>;
  /**
   * What a filled button does under the pointer.
   *
   * It has no token to move to: its ground is already the accent or
   * the ink, and there is no `controlAccentHovered`. So it dims, which
   * is one value that works on every tone and in both appearances, and
   * which the eye reads as a press for the same reason a physical key
   * darkens under a finger.
   */
  readonly hoveredOpacity: number;
  readonly pressedOpacity: number;
}

export interface ControlTokens {
  readonly radius: ControlRadiusTokens;
  readonly button: ButtonTokens;
}

/**
 * The three sizes, from the spacing scale rather than from numbers
 * chosen here.
 *
 * They are the *default* scale's values. A theme that scales its own
 * spacing does not move these, because a group on a theme is a value
 * and not a function of the rest of the theme; an application that
 * wants its density to reach the library's controls supplies the group
 * scaled, which is one expression at the place it builds its theme.
 */
const SIZES: Readonly<Record<ButtonSize, ButtonSizeTokens>> = {
  small: {
    paddingX: defaultSpacing.small,
    paddingY: defaultSpacing.extraSmall,
    radius: 6,
    textStyle: 'bodySmall'
  },
  medium: {
    paddingX: defaultSpacing.medium,
    paddingY: defaultSpacing.small,
    radius: 8,
    textStyle: 'body'
  },
  large: {
    paddingX: defaultSpacing.large,
    paddingY: defaultSpacing.medium,
    radius: 10,
    textStyle: 'bodyLarge'
  }
};

/**
 * Twelve combinations, written out.
 *
 * Every value is a palette name, so the table says nothing about light
 * and dark: `controlForeground` on `controlBackground` is ink on chalk
 * in one appearance and chalk on ink in the other, and a filled
 * neutral button inverts with the toggle without a branch anywhere. A
 * generated table would be shorter and would hide exactly the two
 * places the pattern breaks: `tonal` uses the selection pair for an
 * accent, and `plain` has no ground at all.
 */
const PAINT: Readonly<Record<ButtonVariant, Readonly<Record<ButtonTone, ButtonPaint>>>> = {
  filled: {
    neutral: { background: 'controlForeground', foreground: 'controlBackground' },
    accent: { background: 'controlAccent', foreground: 'controlBackground' },
    danger: { background: 'danger', foreground: 'controlBackground' }
  },
  tonal: {
    neutral: { background: 'controlBackground', foreground: 'controlForeground' },
    accent: { background: 'selectionBackground', foreground: 'selectionForeground' },
    danger: { background: 'controlBackground', foreground: 'danger' }
  },
  outlined: {
    neutral: { background: 'transparent', foreground: 'controlForeground', border: 'controlBorder' },
    accent: { background: 'transparent', foreground: 'controlAccent', border: 'controlAccent' },
    danger: { background: 'transparent', foreground: 'danger', border: 'danger' }
  },
  plain: {
    neutral: { background: 'transparent', foreground: 'controlForeground' },
    accent: { background: 'transparent', foreground: 'controlAccent' },
    danger: { background: 'transparent', foreground: 'danger' }
  }
};

/**
 * Structural equality, to whatever depth the group has.
 *
 * The default comparison `defineThemeExtension` supplies goes one
 * token deep, and `UiThemeExtension.ts` says in as many words that a
 * group whose tokens are themselves groups must bring its own or find
 * out later that its theme never invalidates. This group is three
 * deep at `button.paint.filled.neutral.background`, so it brings one.
 */
function tokensEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) || !tokensEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

export const controlTokens: UiThemeExtension<ControlTokens> = defineThemeExtension<ControlTokens>({
  name: 'gesso.controls',
  defaults: {
    radius: { field: 6, checkbox: 4, scroller: 6, sheet: 12 },
    button: { sizes: SIZES, paint: PAINT, hoveredOpacity: 0.88, pressedOpacity: 0.76 }
  },
  equals: tokensEqual
});
