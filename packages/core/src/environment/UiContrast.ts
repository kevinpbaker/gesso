import type { UiColor } from '../properties/UiColor';
import type { UiColors } from './UiColors';

/**
 * How much separation a theme keeps between what is drawn and what it
 * is drawn on.
 *
 * `standard` is the palette as the designer wrote it. `high` is the
 * same palette with every foreground pushed away from the surface
 * behind it until it clears a contrast ratio, which is what a person
 * who has turned the operating system's high-contrast setting on is
 * asking for. It is an axis of the theme rather than a second palette
 * so that an application which has already chosen its colours does not
 * have to choose them twice, and so that the accessibility audit has
 * one place to look.
 */
export type UiContrast = 'standard' | 'high';

/**
 * The ratio a foreground is raised to at `high`.
 *
 * WCAG's AAA threshold for body text. The stock palettes already clear
 * AA, so raising to AA would leave most tokens untouched and the axis
 * would look as though it did nothing.
 */
const HIGH_CONTRAST_RATIO = 7;

/**
 * Relative luminance, as WCAG defines it.
 *
 * Alpha is ignored: a token is compared against the surface it sits
 * on, and what a translucent foreground actually looks like depends on
 * a composite this cannot see. Raising a translucent token toward the
 * extreme is still the right direction.
 */
export function relativeLuminance(color: UiColor): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function channel(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.03928 ? clamped / 12.92 : Math.pow((clamped + 0.055) / 1.055, 2.4);
}

/**
 * The WCAG contrast ratio between two colours, from 1 to 21.
 */
export function contrastRatio(a: UiColor, b: UiColor): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The same colour, moved toward black or white until it clears
 * `ratio` against `against`.
 *
 * Toward whichever extreme is already the further from the surface, so
 * text on a dark ground gets lighter and text on a light ground gets
 * darker: pushing the other way would cross the surface's own
 * luminance and come out worse before it came out better. A colour
 * that cannot reach the ratio even at the extreme is returned at the
 * extreme, which is the best the palette can do and is still an
 * improvement.
 *
 * Mixed in linear steps of the stored channels rather than by solving
 * for the luminance, because the search is sixteen steps and this runs
 * when a theme is built, not when a frame is drawn.
 */
export function raiseContrast(color: UiColor, against: UiColor, ratio: number): UiColor {
  if (contrastRatio(color, against) >= ratio) {
    return color;
  }
  const target: UiColor = relativeLuminance(against) > 0.5 ? { r: 0, g: 0, b: 0, a: 1 } : { r: 1, g: 1, b: 1, a: 1 };
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step++) {
    const mid = (low + high) / 2;
    if (contrastRatio(mix(color, target, mid), against) >= ratio) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return mix(color, target, high);
}

function mix(from: UiColor, to: UiColor, amount: number): UiColor {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
    a: from.a
  };
}

/**
 * Which surface each token is read against.
 *
 * A token that is itself a surface is not listed: raising a background
 * against a background is meaningless, and a palette whose grounds all
 * moved would not be the application's palette any more. The rest are
 * foregrounds, and each names the surface it is actually drawn on, so
 * a control's own text is measured against the control and not against
 * the page.
 */
const FOREGROUNDS: Readonly<Record<string, keyof UiColors>> = {
  text: 'background',
  textMuted: 'background',
  primary: 'background',
  secondary: 'background',
  border: 'background',
  danger: 'background',
  focusRing: 'background',
  controlForeground: 'controlBackground',
  controlForegroundDisabled: 'controlBackground',
  controlBorder: 'controlBackground',
  controlAccent: 'controlBackground',
  selectionForeground: 'selectionBackground'
} as const;

/**
 * A palette at high contrast.
 *
 * Every extra name a custom palette added is raised too, against the
 * page background, because a palette that grew a token for its own
 * accent should not be the one thing that stays quiet when the setting
 * is turned on. The named foregrounds above override that default with
 * the surface they are really drawn on.
 */
export function highContrastColors(colors: UiColors): UiColors {
  const source = colors as unknown as Readonly<Record<string, UiColor | undefined>>;
  const raised: Record<string, UiColor> = { ...(source as Record<string, UiColor>) };
  for (const name of Object.keys(source)) {
    const value = source[name];
    if (value === undefined || SURFACES.has(name)) {
      continue;
    }
    const againstName = FOREGROUNDS[name] ?? 'background';
    const against = source[againstName];
    if (against === undefined) {
      continue;
    }
    raised[name] = raiseContrast(value, against, HIGH_CONTRAST_RATIO);
  }
  return raised as unknown as UiColors;
}

/** The tokens that are grounds rather than marks, and are left alone. */
const SURFACES: ReadonlySet<string> = new Set([
  'background',
  'surface',
  'shadow',
  'controlBackground',
  'controlBackgroundHovered',
  'controlBackgroundPressed',
  'selectionBackground'
]);
