import type { UiColor } from '../properties/UiColor';
import { colorsEqual, UiBasicColors } from '../properties/UiColor';

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

  // Control tokens. Named for the role a control plays, not for the
  // widget: one set serves the checkbox, the switch, the radio, the
  // slider, the number field and the text field, so a theme restyles
  // all of them at once. Components read these instead of taking
  // colour props, which would fork the theme at every call site.
  readonly controlBackground: UiColor;
  readonly controlBackgroundHovered: UiColor;
  readonly controlBackgroundPressed: UiColor;
  readonly controlBorder: UiColor;
  /** The border of the control that has keyboard focus. */
  readonly controlBorderFocused: UiColor;
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
   */
  readonly focusRing: UiColor;

  // Selection tokens. A row of a list, a tree or a table is chosen
  // rather than operated, so it is neither a control's accent nor its
  // hover: one pair, so the three data components agree on what
  // "chosen" looks like without any of them naming a colour.
  readonly selectionBackground: UiColor;
  readonly selectionForeground: UiColor;
}

export const lightColors: UiColors = {
  background: UiBasicColors.white,
  surface: { r: 0.98, g: 0.98, b: 0.98, a: 1 },
  primary: { r: 0.13, g: 0.59, b: 0.95, a: 1 },
  secondary: { r: 0.61, g: 0.15, b: 0.69, a: 1 },
  text: UiBasicColors.black,
  textMuted: { r: 0.4, g: 0.4, b: 0.4, a: 1 },
  border: { r: 0.85, g: 0.85, b: 0.85, a: 1 },
  shadow: { r: 0, g: 0, b: 0, a: 0.2 },
  controlBackground: UiBasicColors.white,
  controlBackgroundHovered: { r: 0.95, g: 0.95, b: 0.96, a: 1 },
  controlBackgroundPressed: { r: 0.9, g: 0.9, b: 0.92, a: 1 },
  controlBorder: { r: 0.76, g: 0.77, b: 0.79, a: 1 },
  controlBorderFocused: { r: 0.13, g: 0.59, b: 0.95, a: 1 },
  controlForeground: { r: 0.07, g: 0.09, b: 0.13, a: 1 },
  controlForegroundDisabled: { r: 0.6, g: 0.62, b: 0.65, a: 1 },
  controlAccent: { r: 0.13, g: 0.59, b: 0.95, a: 1 },
  danger: { r: 0.86, g: 0.15, b: 0.15, a: 1 },
  focusRing: { r: 0.13, g: 0.59, b: 0.95, a: 1 },
  selectionBackground: { r: 0.85, g: 0.92, b: 0.99, a: 1 },
  selectionForeground: { r: 0.05, g: 0.24, b: 0.44, a: 1 }
} as const;

export const darkColors: UiColors = {
  background: { r: 0.12, g: 0.12, b: 0.12, a: 1 },
  surface: { r: 0.18, g: 0.18, b: 0.18, a: 1 },
  primary: { r: 0.4, g: 0.76, b: 1, a: 1 },
  secondary: { r: 0.88, g: 0.6, b: 0.94, a: 1 },
  text: UiBasicColors.white,
  textMuted: { r: 0.6, g: 0.6, b: 0.6, a: 1 },
  border: { r: 0.3, g: 0.3, b: 0.3, a: 1 },
  shadow: { r: 0, g: 0, b: 0, a: 0.5 },
  controlBackground: { r: 0.16, g: 0.17, b: 0.2, a: 1 },
  controlBackgroundHovered: { r: 0.21, g: 0.23, b: 0.27, a: 1 },
  controlBackgroundPressed: { r: 0.26, g: 0.28, b: 0.33, a: 1 },
  controlBorder: { r: 0.34, g: 0.36, b: 0.41, a: 1 },
  controlBorderFocused: { r: 0.4, g: 0.76, b: 1, a: 1 },
  controlForeground: { r: 0.9, g: 0.91, b: 0.94, a: 1 },
  controlForegroundDisabled: { r: 0.48, g: 0.5, b: 0.55, a: 1 },
  controlAccent: { r: 0.4, g: 0.76, b: 1, a: 1 },
  danger: { r: 0.94, g: 0.42, b: 0.42, a: 1 },
  focusRing: { r: 0.45, g: 0.79, b: 1, a: 1 },
  selectionBackground: { r: 0.16, g: 0.29, b: 0.42, a: 1 },
  selectionForeground: { r: 0.85, g: 0.93, b: 1, a: 1 }
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
