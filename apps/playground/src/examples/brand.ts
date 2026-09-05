import { darkTheme, parseColor, type UiColors, type UiTheme } from '@gesso/core';

/**
 * The Gesso palette, for the example applications.
 *
 * `brand/README.md` names five colours: raw linen, chalk ground,
 * linen shaded, ultramarine and ink. They describe a mark, not a user
 * interface, so this module does two things with them. The first block
 * is the brand as published, unaltered, for the places that must be
 * exact. The second is the interface ramp derived from it — ink and
 * chalk pulled apart into surfaces and text, and ultramarine lifted
 * off its printed value, which is far too dark to read a link or a
 * focus ring by on an ink ground.
 *
 * The examples share one module rather than each declaring its own
 * near-identical set of dark hexes, which is what they did before, and
 * which is why the notes app and the live dashboard had drifted two
 * shades apart. The values here match the shell's tokens in
 * `src/shell/theme.css` role for role, so a route's rendered output
 * and the chrome around it read as one product.
 *
 * Nothing here touches `@gesso/core`'s own `lightColors` / `darkColors`.
 * The framework ships a neutral starter palette on purpose; branding
 * belongs to the application, and this is the application.
 */

// ---------------------------------------------------------------------------
// The brand, as published
// ---------------------------------------------------------------------------

/** Raw linen: the canvas. */
export const LINEN = '#be9a6e';
/** Linen, shaded: depth, where the mark is built up. */
export const LINEN_SHADED = '#8a6a45';
/** Chalk ground: the primer. */
export const CHALK = '#f7f3ea';
/** Ultramarine: the first paint after the primer dries. */
export const ULTRAMARINE = '#2a3e8c';
/** Ink: text. */
export const INK = '#16181d';

// ---------------------------------------------------------------------------
// The interface ramp
// ---------------------------------------------------------------------------

/** Ultramarine at the same hue, lifted until it reads on ink. */
export const ACCENT = '#6e82d8';
/** Ultramarine washed into a raised surface: a chosen row, a selection. */
export const ACCENT_WASH = '#2a2f45';

/** Below ink: the page the panels sit on. */
export const GROUND = '#101216';
/** Ink itself. */
export const SURFACE = INK;
export const SURFACE_RAISED = '#1d2027';
export const SURFACE_OVERLAY = '#262a33';

/** A rule inside a card, barely there. */
export const BORDER_SOFT = '#1f2228';
/** Groups within a region. */
export const BORDER = '#262931';
/** Separates one region from another. */
export const BORDER_STRONG = '#363a45';

export const TEXT = CHALK;
/** Chalk walked down toward the linen it primes, so secondary text
 *  stays warm rather than turning blue-grey. */
export const TEXT_MUTED = '#a9a296';
export const TEXT_FAINT = '#767065';

/** Status. The brand has no warning colour, and the one warm hue it
 *  does have is already the right one, so linen serves. */
export const POSITIVE = '#4fa07e';
export const WARNING = LINEN;
export const DANGER = '#db5a4e';

export const MONO = 'ui-monospace, monospace';

// ---------------------------------------------------------------------------
// As a theme
// ---------------------------------------------------------------------------

const hex = (value: string) => parseColor(value)!;

/** The ramp above, mapped onto the framework's semantic colour names. */
export const gessoColors: UiColors = {
  ...darkTheme.colors,
  background: hex(GROUND),
  surface: hex(SURFACE_RAISED),
  primary: hex(ACCENT),
  secondary: hex(LINEN),
  text: hex(TEXT),
  textMuted: hex(TEXT_MUTED),
  border: hex(BORDER),
  controlBackground: hex(SURFACE),
  controlBackgroundHovered: hex(SURFACE_OVERLAY),
  controlBackgroundPressed: hex(BORDER_STRONG),
  controlBorder: hex(BORDER_STRONG),
  controlForeground: hex(TEXT),
  controlForegroundDisabled: hex(TEXT_FAINT),
  controlAccent: hex(ACCENT),
  danger: hex(DANGER),
  focusRing: hex('#8b9ce4'),
  selectionBackground: hex(ACCENT_WASH),
  selectionForeground: hex(CHALK)
};

export const gessoTheme: UiTheme = { ...darkTheme, colors: gessoColors };
