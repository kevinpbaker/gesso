import type { UiColors } from '../environment/UiColors';
import type { UiColor } from './UiColor';

/**
 * Value vocabularies for the string-valued properties.
 *
 * These are the words the layout engine, the renderers and the input
 * layer actually compare against. They live here, next to the
 * registry, so that a property's type in `UiProperties` is the single
 * source of truth for both the runtime and the authoring types derived
 * from it (see `UiElementProps`).
 */

/**
 * Alignment of children along an axis. Which words apply depends on
 * whether the axis is a flex container's main axis (`start`, `center`,
 * `end`, `space-*`), its cross axis (`start`, `center`, `end`,
 * `stretch`, `baseline`), a stack or a grid cell (`start`, `center`,
 * `end`, `stretch`). The engine ignores a word that does not apply.
 */
export type UiAlignment =
  | 'start'
  | 'center'
  | 'end'
  | 'stretch'
  | 'baseline'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

/** Per-child override of the parent's alignment on one axis. */
export type UiSelfAlignment = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/** Distribution of a wrapping container's lines or a grid's tracks. */
export type UiContentDistribution =
  | 'stretch'
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

export type UiFlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';

/**
 * Main-axis direction of a flex or scroll container. `horizontal` and
 * `vertical` are accepted as synonyms of `row` and `column`.
 */
export type UiDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse' | 'horizontal' | 'vertical';

export type UiGridAutoFlow = 'row' | 'column';

/**
 * Which axis a nested grid takes from its parent's tracks. Only the
 * column axis exists: see the `subgrid` property.
 */
export type UiSubgridAxis = 'columns';

export const UI_SUBGRID_AXES: readonly UiSubgridAxis[] = ['columns'];

/** Validates the `subgrid` prop the way `role` and `states` are validated. */
export function validateSubgrid(value: unknown): string | undefined {
  if (value === undefined || value === 'columns') {
    return undefined;
  }
  return (
    `Unknown subgrid axis '${String(value)}'. ` +
    `Only 'columns' is supported: a virtualized table's parent cannot see the rows that are not mounted, ` +
    `so its row tracks are not something a row could share.`
  );
}

export type UiPosition = 'static' | 'relative' | 'absolute' | 'sticky';

export type UiOverflow = 'visible' | 'hidden' | 'scroll' | 'auto';

/** Side and alignment of an anchored node against its anchor. */
export type UiPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end';

export type UiTextWrapValue = 'word' | 'char' | 'none';

export type UiTextOverflowValue = 'clip' | 'ellipsis';

export type UiTextAlign = 'left' | 'center' | 'right';

export type UiTextDirection = 'ltr' | 'rtl';

export type UiVerticalAlign = 'top' | 'middle' | 'bottom';

export type UiObjectFit = 'fill' | 'cover' | 'contain' | 'none';

export type UiPointerEvents = 'auto' | 'none';

/** A CSS font weight: a number, a numeric string, or a keyword. */
export type UiFontWeight = number | `${number}` | 'normal' | 'bold' | 'lighter' | 'bolder';

/**
 * The CSS cursor names a shell may show over the hovered node. Set on
 * an element or any ancestor; the runtime reports the nearest one to
 * the shell, which puts it on the canvas.
 */
export type UiCursor =
  | 'default'
  | 'pointer'
  | 'text'
  | 'move'
  | 'grab'
  | 'grabbing'
  | 'crosshair'
  | 'not-allowed'
  | 'wait'
  | 'progress'
  | 'help'
  | 'none'
  | 'col-resize'
  | 'row-resize'
  | 'ew-resize'
  | 'ns-resize'
  | 'nesw-resize'
  | 'nwse-resize'
  | 'zoom-in'
  | 'zoom-out';

/** A name in the theme's color palette, resolved at paint time. */
export type UiThemeColorName = keyof UiColors;

/**
 * What a color property accepts: a `UiColor`, a theme palette name
 * (`'primary'`), or a CSS color string (`'#1f6feb'`, `'red'`). The
 * palette names are listed so they complete; the open string keeps hex
 * and named CSS colors legal.
 */
export type UiColorValue = UiColor | UiThemeColorName | (string & {});
