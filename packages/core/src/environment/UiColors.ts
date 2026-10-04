import type { UiColor } from '../properties/UiColor';
import { colorsEqual, rgb8, UiBasicColors } from '../properties/UiColor';

/**
 * A renderer-independent color palette.
 *
 * This is a starter set of semantic colors. Names are not hard
 * requirements; consumers can define additional palettes or extend
 * this shape as the framework grows.
 */
export interface UiColors {
  readonly background: UiColor;
  readonly surface: UiColor;
  readonly primary: UiColor;
  readonly secondary: UiColor;
  readonly text: UiColor;
  readonly textMuted: UiColor;
  readonly border: UiColor;
  readonly shadow: UiColor;
  /**
   * The ground of something standing in for content that has not
   * arrived: a skeleton's bars, an avatar with no picture yet.
   *
   * Its own token rather than a borrowed one because it is a role no
   * other token plays. Borrowing `border` would tie a filled block to
   * the colour of a rule, and borrowing `controlBackgroundPressed`
   * would move every skeleton on the screen when a theme adjusted how
   * a button looks while held.
   */
  readonly placeholder: UiColor;
  /**
   * What a modal dialog lays over the page behind it, as a browser
   * draws `<dialog>::backdrop`: a colour with alpha, so the page shows
   * through dimmed. It says the page can't be used until the dialog is
   * closed, and lifts the dialog off it.
   *
   * Darker than `shadow`, which only has to edge a panel, and darker in
   * the dark palette than the light, as a shadow is: a dim the colour of
   * the light page's ink reads on white, and over a page that is
   * already dark only a deeper one shows.
   */
  readonly scrim: UiColor;

  // Control tokens. Named for the role a control plays, not for the
  // widget: one set serves the checkbox, the switch, the radio, the
  // slider, the number field and the text field, so a theme restyles
  // all of them at once. Components read these instead of taking
  // colour props, which would fork the theme at every call site.
  readonly controlBackground: UiColor;
  readonly controlBackgroundHovered: UiColor;
  readonly controlBackgroundPressed: UiColor;
  readonly controlBorder: UiColor;
  readonly controlForeground: UiColor;
  readonly controlForegroundDisabled: UiColor;
  /** The fill of a control that is on: a ticked box, a thrown switch. */
  readonly controlAccent: UiColor;
  /** An invalid control's border, and the text explaining why. */
  readonly danger: UiColor;
  /**
   * The ring drawn outside whatever holds keyboard focus. It sits on
   * the background rather than on the control, so it is its own token
   * and not `controlAccent`: a ring has to stay legible against the
   * surface behind every control, including a chosen row.
   *
   * Both palettes make it the ink they already write text in, rather
   * than an accent. A ring is the one piece of colour a control grows
   * without the app asking for it, so the stock one should be a colour
   * the app is using anyway; a themed accent that nobody chose reads
   * as the framework's colour showing through the app's.
   */
  readonly focusRing: UiColor;

  // Selection tokens. A row of a list, a tree or a table is chosen
  // rather than operated, so it is neither a control's accent nor its
  // hover: one pair, so the three data components agree on what
  // "chosen" looks like without any of them naming a colour.
  readonly selectionBackground: UiColor;
  readonly selectionForeground: UiColor;
}

/**
 * The stock palettes.
 *
 * Neutrals carry a little blue, as a screen's greys do now, rather
 * than being an even mix of the three channels; the accent is deep
 * enough that white on it reads (4.5:1 and up), which the bright
 * Material blue this replaced did not. Values are written as 8-bit
 * channels so each one can be read as the hex it is.
 */
export const lightColors: UiColors = {
  background: UiBasicColors.white,
  surface: rgb8(249, 250, 251),
  primary: rgb8(37, 99, 235),
  secondary: rgb8(124, 58, 237),
  text: rgb8(17, 24, 39),
  textMuted: rgb8(91, 99, 112),
  border: rgb8(229, 231, 235),
  shadow: rgb8(17, 24, 39, 41),
  placeholder: rgb8(240, 241, 244),
  scrim: rgb8(17, 24, 39, 102),
  controlBackground: UiBasicColors.white,
  controlBackgroundHovered: rgb8(243, 244, 246),
  controlBackgroundPressed: rgb8(229, 231, 235),
  controlBorder: rgb8(209, 213, 219),
  controlForeground: rgb8(17, 24, 39),
  controlForegroundDisabled: rgb8(156, 163, 175),
  controlAccent: rgb8(37, 99, 235),
  danger: rgb8(220, 38, 38),
  focusRing: rgb8(17, 24, 39),
  selectionBackground: rgb8(219, 234, 254),
  selectionForeground: rgb8(30, 58, 138)
} as const;

export const darkColors: UiColors = {
  background: rgb8(17, 19, 24),
  surface: rgb8(26, 29, 35),
  primary: rgb8(96, 165, 250),
  secondary: rgb8(167, 139, 250),
  text: rgb8(243, 244, 246),
  textMuted: rgb8(156, 163, 175),
  border: rgb8(42, 46, 54),
  shadow: rgb8(0, 0, 0, 128),
  placeholder: rgb8(37, 41, 48),
  scrim: rgb8(0, 0, 0, 153),
  controlBackground: rgb8(26, 29, 35),
  controlBackgroundHovered: rgb8(35, 39, 46),
  controlBackgroundPressed: rgb8(44, 49, 57),
  controlBorder: rgb8(58, 63, 72),
  controlForeground: rgb8(243, 244, 246),
  controlForegroundDisabled: rgb8(107, 114, 128),
  controlAccent: rgb8(96, 165, 250),
  danger: rgb8(248, 113, 113),
  focusRing: rgb8(243, 244, 246),
  selectionBackground: rgb8(30, 58, 95),
  selectionForeground: rgb8(219, 234, 254)
} as const;

/**
 * Compares two color palettes for equality.
 *
 * Over the keys rather than a written-out list: a palette that gains a
 * token must invalidate on a change to it, and a list is a thing to
 * forget to extend. Extra names a custom palette adds are compared too.
 */
export function colorsEqualPalette(a: UiColors, b: UiColors): boolean {
  const left = a as unknown as Record<string, UiColor | undefined>;
  const right = b as unknown as Record<string, UiColor | undefined>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    const one = left[key];
    const other = right[key];
    if (one === undefined || other === undefined) {
      if (one !== other) {
        return false;
      }
      continue;
    }
    if (!colorsEqual(one, other)) {
      return false;
    }
  }
  return true;
}
