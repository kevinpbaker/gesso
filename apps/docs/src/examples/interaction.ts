import { interactive, type UiModifier } from 'gesso-core';

/**
 * Hover and press, for anything on this site a reader can click.
 *
 * Two shared values rather than one per call site, so what a clickable
 * thing looks like here is settled in one place instead of being spelt
 * out at every one of them. A modifier's arguments are compared by value,
 * so the same options written inline would be the same modifier and
 * would stay attached; sharing saves the object and the walk, not the
 * modifier. The library's own controls share `CONTROL_INTERACTION` in
 * the same way.
 *
 * A `<button>` already publishes `hovered` and `pressed` as
 * `visualState`, but nothing paints a colour from that state on its
 * own, because what a hovered control looks like is the application's.
 * These two say what it looks like here.
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
 * The palette has hover and press tokens for a *control*, meaning a
 * field, a checkbox or a menu row, and none for a button already
 * painted in the accent, because there is no darker accent to name. Dimming it is the
 * honest answer: it reads as a press on both appearances and needs no
 * token that does not exist.
 */
export const HOVER_ACCENT: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { opacity: 0.88 },
  pressed: { opacity: 0.74 }
});
