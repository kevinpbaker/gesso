import { darkTheme, lightTheme, rgb8, type UiColor, type UiColors, type UiTextStyle, type UiTheme } from '@gesso/core';

/**
 * Gesso's own palette, for the examples on this site.
 *
 * `lightTheme` and `darkTheme` in `@gesso/core` are a starting point
 * rather than a policy, and this file is what taking them up on that
 * looks like: the same token names, answered in Gesso's colours, so a
 * canvas on this site is painted out of the same palette as the prose
 * beside it. Nothing here is framework machinery. An application's
 * palette is application code, and this one lives beside the examples
 * it dresses.
 *
 * It is built in two layers, and the split is the point.
 *
 * **Ramps** are the colours themselves, and they are the only place a
 * number appears. `brand/README.md` fixes five: raw linen, chalk, ink,
 * ultramarine and linen shaded. Each ramp below runs a scale through
 * one of those, with the brand's own value sitting on a labelled step,
 * so a shade used anywhere on the site can be traced back to the file
 * that chose it. Steps read like a stylesheet's: 50 is nearest white
 * on the warm ramps, 900 nearest black.
 *
 * **Roles** are the palette a component actually asks for. Every token
 * is a ramp step, never a fresh colour, which is what stops a palette
 * drifting into forty unrelated hexes as it grows. It answers the
 * twenty-one names `UiColors` declares, so every stock component is
 * dressed, and adds twelve of its own for jobs the stock set has no
 * name for. Extra names work because a colour token is looked up on
 * the palette the node inherits: see `themeColorFor` in
 * `UiThemeColor.ts`.
 *
 * `brandTheme.spec.ts` holds the contrast floors. Nothing here is
 * asserted for its value, which is taste, but a pair that has to stay
 * readable is checked, because that is the property a plausible-looking
 * tweak breaks without anyone seeing it happen.
 */

// #region ramps
/**
 * Raw linen, the ground the mark is drawn on: the warm side of the
 * palette, and every paper surface, rule and border in light.
 * `brand/README.md` fixes 100 (chalk ground), 500 (raw linen) and 700
 * (linen, shaded).
 */
const LINEN = {
  50: rgb8(255, 253, 248),
  100: rgb8(247, 243, 234), // chalk ground
  200: rgb8(241, 235, 221),
  300: rgb8(227, 217, 198),
  400: rgb8(211, 196, 166),
  500: rgb8(190, 154, 110), // raw linen
  600: rgb8(166, 132, 92),
  700: rgb8(138, 106, 69), // linen, shaded
  800: rgb8(107, 82, 54),
  900: rgb8(74, 56, 38)
} as const;

/**
 * Ink, what you write in: near-black at the bottom, and the cool
 * neutrals a dark screen is built from above it. 900 is the brand's
 * ink, so dark's page and light's text are the same colour, which is
 * the inversion the two appearances are.
 */
const INK = {
  50: rgb8(232, 234, 238),
  100: rgb8(194, 198, 207),
  200: rgb8(138, 143, 156),
  300: rgb8(107, 113, 128),
  400: rgb8(74, 80, 94),
  500: rgb8(58, 63, 75),
  600: rgb8(46, 50, 60),
  700: rgb8(38, 42, 51),
  800: rgb8(30, 33, 40),
  900: rgb8(22, 24, 29), // ink
  950: rgb8(15, 17, 21)
} as const;

/**
 * Ultramarine, the first paint after the primer dries: links, the
 * chosen thing, and the ring around whatever holds focus. 500 is the
 * brand's. Dark reaches for 300 rather than 500, because ultramarine
 * is a dark blue and fails against ink; the hue is the brand's either
 * way, and the mark itself is never recoloured.
 */
const ULTRAMARINE = {
  50: rgb8(237, 240, 250),
  100: rgb8(220, 225, 242),
  200: rgb8(186, 196, 230),
  300: rgb8(151, 169, 226),
  400: rgb8(100, 120, 190),
  500: rgb8(42, 62, 140), // ultramarine
  600: rgb8(34, 50, 112),
  700: rgb8(27, 39, 88),
  800: rgb8(20, 29, 66),
  900: rgb8(14, 20, 44)
} as const;

/**
 * The three status hues, mixed rather than borrowed.
 *
 * The brand names no red, green or amber, and the stock palette's were
 * chosen to sit beside a blue. These are pulled toward linen instead:
 * a brick rather than a signal red, a moss rather than a mint, an
 * ochre rather than a highlighter. Each carries a light wash, a mid
 * value for light, a deep value for text on the wash, and a near-black
 * for the same wash at night.
 */
const BRICK = {
  100: rgb8(245, 221, 216),
  300: rgb8(224, 138, 126),
  500: rgb8(169, 59, 46),
  700: rgb8(122, 40, 31),
  900: rgb8(58, 31, 27)
} as const;

const MOSS = {
  100: rgb8(226, 235, 219),
  300: rgb8(143, 176, 127),
  500: rgb8(74, 107, 63),
  700: rgb8(51, 74, 44),
  900: rgb8(31, 46, 26)
} as const;

const AMBER = {
  100: rgb8(245, 233, 210),
  300: rgb8(217, 174, 104),
  500: rgb8(138, 100, 32),
  700: rgb8(94, 67, 15),
  900: rgb8(58, 42, 12)
} as const;

/**
 * The four neutrals that are not on a ramp, because they are not a
 * shade of anything: each is one of the brand's colours pulled toward
 * the other, which is what a second line of text wants and what no
 * step of a single ramp can be.
 *
 * `FAINT` is the quietest a word is allowed to get. It answers
 * `controlForegroundDisabled`, which sounds exempt from being read and
 * is not: `TextInput` writes the hint under a field in it, so a value
 * chosen for a greyed-out control would leave every hint on the site
 * unreadable. It is dimmer than muted and still clears AA.
 */
const INK_MUTED = rgb8(85, 80, 74);
const INK_FAINT = rgb8(117, 111, 102);
const CHALK_MUTED = rgb8(166, 159, 145);
const CHALK_FAINT = rgb8(148, 142, 130);
// #endregion ramps

/**
 * The twelve roles the stock palette has no name for.
 *
 * Each is here because something on this site or in an application
 * built on it has to name the colour and would otherwise write a
 * literal. `surfaceRaised` and `surfaceSunken` are the two directions
 * a panel can sit relative to the page; `borderSubtle` and
 * `borderStrong` the two either side of an ordinary rule; `onPrimary`
 * the one colour guaranteed to be readable on a primary fill, which a
 * caller otherwise has to guess at; and the status trio completes
 * `danger`, which the stock palette leaves without a `success` or a
 * `warning` to sit beside.
 */
export interface BrandColors extends UiColors {
  readonly surfaceRaised: UiColor;
  readonly surfaceSunken: UiColor;
  readonly borderSubtle: UiColor;
  readonly borderStrong: UiColor;
  readonly onPrimary: UiColor;
  readonly primaryMuted: UiColor;
  readonly success: UiColor;
  readonly successMuted: UiColor;
  readonly warning: UiColor;
  readonly warningMuted: UiColor;
  readonly dangerMuted: UiColor;
  /** What a dialog dims the screen behind it with. */
  readonly scrim: UiColor;
}

const lightColors: BrandColors = {
  background: LINEN[100],
  surface: LINEN[50],
  // In light the page is already near the top of the ramp, so a raised
  // panel is lifted by its shadow rather than by its colour. Only the
  // sunken direction has anywhere to go.
  surfaceRaised: LINEN[50],
  surfaceSunken: LINEN[200],

  primary: ULTRAMARINE[500],
  onPrimary: LINEN[50],
  primaryMuted: ULTRAMARINE[100],
  secondary: LINEN[500],

  text: INK[900],
  textMuted: INK_MUTED,

  border: LINEN[300],
  borderSubtle: LINEN[200],
  borderStrong: LINEN[600],
  shadow: rgb8(22, 24, 29, 41),
  placeholder: LINEN[200],
  scrim: rgb8(22, 24, 29, 140),

  controlBackground: LINEN[50],
  controlBackgroundHovered: LINEN[200],
  controlBackgroundPressed: LINEN[300],
  controlBorder: LINEN[600],
  controlForeground: INK[900],
  controlForegroundDisabled: INK_FAINT,
  controlAccent: ULTRAMARINE[500],

  danger: BRICK[500],
  dangerMuted: BRICK[100],
  success: MOSS[500],
  successMuted: MOSS[100],
  warning: AMBER[500],
  warningMuted: AMBER[100],

  focusRing: ULTRAMARINE[500],
  selectionBackground: ULTRAMARINE[100],
  selectionForeground: ULTRAMARINE[600]
};

const darkColors: BrandColors = {
  background: INK[900],
  surface: INK[800],
  surfaceRaised: INK[700],
  surfaceSunken: INK[950],

  primary: ULTRAMARINE[300],
  onPrimary: INK[900],
  primaryMuted: ULTRAMARINE[800],
  secondary: LINEN[500],

  text: LINEN[200],
  textMuted: CHALK_MUTED,

  border: INK[600],
  borderSubtle: INK[700],
  borderStrong: INK[300],
  shadow: rgb8(0, 0, 0, 128),
  placeholder: INK[700],
  scrim: rgb8(15, 17, 21, 166),

  controlBackground: INK[800],
  controlBackgroundHovered: INK[700],
  controlBackgroundPressed: INK[600],
  controlBorder: INK[300],
  controlForeground: LINEN[200],
  controlForegroundDisabled: CHALK_FAINT,
  controlAccent: ULTRAMARINE[300],

  danger: BRICK[300],
  dangerMuted: BRICK[900],
  success: MOSS[300],
  successMuted: MOSS[900],
  warning: AMBER[300],
  warningMuted: AMBER[900],

  focusRing: ULTRAMARINE[300],
  selectionBackground: ULTRAMARINE[800],
  selectionForeground: ULTRAMARINE[100]
};

/**
 * The type scale carries a colour of its own, because text that names
 * no colour takes it from the scale and not from the palette. Only
 * that field changes: the sizes, weights and line heights are the
 * stock scale, which this site has no reason to disagree with.
 */
function inkedScale(theme: UiTheme, color: UiTextStyle['color']): UiTheme['typography'] {
  const scale = theme.typography;
  return {
    body: { ...scale.body, color },
    bodyLarge: { ...scale.bodyLarge, color },
    bodySmall: { ...scale.bodySmall, color },
    headline: { ...scale.headline, color },
    title: { ...scale.title, color },
    label: { ...scale.label, color }
  };
}

export const brandLightTheme: UiTheme = {
  ...lightTheme,
  colors: lightColors,
  typography: inkedScale(lightTheme, lightColors.text)
};

export const brandDarkTheme: UiTheme = {
  ...darkTheme,
  colors: darkColors,
  typography: inkedScale(darkTheme, darkColors.text)
};

/**
 * The ramps, for an example that wants a specific shade rather than a
 * role: `backgroundColor={LINEN[300]}`. Deliberately not folded into
 * the palette as `linen300` and friends. A component should ask for
 * the job a colour is doing, and a palette of ninety addressable steps
 * is one where nothing ever has to.
 */
export const RAMPS = { LINEN, INK, ULTRAMARINE, BRICK, MOSS, AMBER } as const;
