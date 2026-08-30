import { map, type Observable } from 'rxjs';

import type { InputCell, Inputs } from '@gesso/framework';
import {
  type UiKeyboardEvent,
  type UiLength,
  type UiSelfAlignment,
  focusRing,
  interactive,
  type UiModifier
} from '@gesso/core';

/**
 * What every control in this tier shares.
 *
 * The rules these encode are `COMPONENTS_ROADMAP.md` §2: a control is
 * themed through `UiTheme` and takes no colour props, and its keyboard
 * behaviour is data rather than a `switch` buried in a handler.
 */

/**
 * Hover and press for a control, in theme tokens.
 *
 * One shared value, so its arguments keep their identity across
 * renders and the modifier is never re-attached (see
 * `decisions/0022-modifiers.md`). Colour props accept a palette name,
 * resolved at paint against whatever theme the node inherits, so this
 * is themed without resolving anything here.
 */
export const CONTROL_INTERACTION: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'controlBackgroundHovered' },
  pressed: { backgroundColor: 'controlBackgroundPressed' }
});

/**
 * Visible focus, for every control in the library.
 *
 * One shared value, for the same reason `CONTROL_INTERACTION` is one:
 * a modifier's arguments are compared by identity, so a fresh one per
 * render would detach and re-attach the ring on every frame.
 *
 * It goes on the element that *is* the control — the one that takes
 * focus and carries the role — which for a container that is a single
 * tab stop (a radio group, a tab list, a list of rows) is the
 * container. That is the correct thing to mark: the ring says where
 * the keyboard is, and which item inside is chosen is said by the
 * item's own selection colour.
 */
export const CONTROL_FOCUS_RING: UiModifier = focusRing();

/**
 * The border token a control shows: invalid, or resting.
 *
 * It used to take focus too, because before `MODIFIERS_ROADMAP.md` B3
 * a bound `borderColor` was the only way a control could show focus at
 * all. Now `CONTROL_FOCUS_RING` does it, once, for controls that have
 * no border to recolour as much as for the ones that do — and a
 * control that both recoloured its border and grew a ring would be
 * saying the same thing twice.
 */
export function borderToken(invalid: Observable<boolean>): Observable<string> {
  return invalid.pipe(map(bad => (bad ? 'danger' : 'controlBorder')));
}

/** The foreground token for a control's own text. */
export function foregroundToken(disabled: Observable<boolean>): Observable<string> {
  return disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : 'controlForeground')));
}

/**
 * A keymap as data.
 *
 * A `switch` inside a handler cannot be tested without a runtime, read
 * without opening the source, or overridden by an app that needs a
 * different binding. This takes the same table and returns the
 * handler; a key that is bound consumes the event, and one that is not
 * is left for whatever is listening above.
 */
export type Keymap = Readonly<Record<string, (event: UiKeyboardEvent) => void>>;

export function keymap(bindings: Keymap): (event: UiKeyboardEvent) => void {
  return event => {
    const handler = bindings[event.key];
    if (handler === undefined) {
      return;
    }
    handler(event);
    event.preventDefault();
    event.stopPropagation();
  };
}

/** Clamps to a range and snaps to a step, for the range controls. */
export function quantize(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (step <= 0) {
    return clamped;
  }
  const steps = Math.round((clamped - min) / step);
  // Rounded to the step's own precision, so 0.1 + 0.2 does not leak.
  const snapped = Number((min + steps * step).toFixed(precisionOf(step)));
  return Math.min(max, Math.max(min, snapped));
}

function precisionOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * The layout props every control passes through to its own root.
 *
 * A component must be placeable by its caller, which is the one place
 * the library is a leaky abstraction on purpose (`COMPONENTS_ROADMAP.md`
 * §2.3). Declared as plain values: a caller may still pass an
 * Observable for any of them, because `ComponentProps` widens every
 * prop to `Reactive<T>`.
 */
export interface ControlLayoutProps {
  width?: UiLength;
  height?: UiLength;
  minWidth?: UiLength;
  minHeight?: UiLength;
  maxWidth?: UiLength;
  maxHeight?: UiLength;
  margin?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: UiLength;
  selfX?: UiSelfAlignment;
  selfY?: UiSelfAlignment;
}

const LAYOUT_PROPS: readonly (keyof ControlLayoutProps)[] = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'selfX',
  'selfY'
];

/** The layout props the caller actually supplied, as cells to bind. */
export function layoutOf(props: Inputs<ControlLayoutProps>): Record<string, unknown> {
  const passed: Record<string, unknown> = {};
  const cells = props as unknown as Record<string, InputCell<unknown> | undefined>;
  for (const name of LAYOUT_PROPS) {
    const cell = cells[name];
    if (cell !== undefined && cell.value !== undefined) {
      passed[name] = cell;
    }
  }
  return passed;
}
