import { interactive, type UiModifier } from '@gesso/core';

/**
 * Hover and press, for anything on this site a reader can click.
 *
 * Two shared values rather than one per call site, because a
 * modifier's arguments are compared by identity: a fresh object per
 * render would detach and re-attach on every frame
 * (`decisions/0022-modifiers.md`). The library's own controls share
 * `CONTROL_INTERACTION` for exactly this reason.
 *
 * A `<button>` already publishes `hovered` and `pressed` as
 * `visualState`, but nothing paints a colour from that state on its
 * own — what a hovered control looks like is the application's. These
 * two say what it looks like here.
 *
 * Colours are theme tokens, resolved at paint against whatever theme
 * the node inherits, so both work in light and dark without either
 * being named twice.
 */
export const HOVER_CONTROL: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'controlBackgroundHovered' },
  pressed: { backgroundColor: 'controlBackgroundPressed' }
});

/**
 * The same, for a filled accent button.
 *
 * The palette has hover and press tokens for a *control* — a field, a
 * checkbox, a menu row — and none for a button already painted in the
 * accent, because there is no darker accent to name. Dimming it is the
 * honest answer: it reads as a press on both appearances and needs no
 * token that does not exist.
 */
export const HOVER_ACCENT: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { opacity: 0.88 },
  pressed: { opacity: 0.74 }
});
