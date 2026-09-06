import { map, type Observable } from 'rxjs';

import type { InputCell, Inputs } from '@gesso/framework';
import {
  type DecorationShape,
  type UiKeyboardEvent,
  type UiLength,
  type UiSelfAlignment,
  decorated,
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
 * The border of a scroller whose rows reach its edges, painted over
 * them rather than under them.
 *
 * `borderWidth` is paint-only: it takes no space, and a node's border
 * is painted before its children, so a child whose background fills
 * the container's width covers the two side edges and, when it is
 * against them, the top and bottom ones too. A table's sticky header
 * does exactly that, and so does a chosen row in any of these lists,
 * which is why the border has to be a decoration instead: the shapes
 * marked `after: 'children'` are painted once the subtree is done,
 * and outside the node's own clip, so the ring closes all the way
 * round whatever is drawn inside it.
 *
 * A scroller carrying this names no `borderWidth`. Its `borderRadius`
 * still belongs on the node, because that is what clips the content
 * and rounds the background; the stroke inherits the same radius, so
 * the two stay concentric with no number repeated here.
 *
 * One shared value, for the reason the two modifiers above are:
 * arguments are compared by identity, so a list built per render would
 * detach and re-attach the decoration on every frame.
 */
const CONTROL_EDGE_SHAPES: readonly DecorationShape[] = Object.freeze([
  Object.freeze({ kind: 'stroke', color: 'controlBorder', lineWidth: 1, after: 'children' })
]) as readonly DecorationShape[];

export const CONTROL_EDGE: UiModifier = decorated(CONTROL_EDGE_SHAPES);

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
  /**
   * Modifiers to attach to the component's own root element, beside
   * whatever the component attaches itself.
   *
   * The seam a motion needs. `sharedElement`, `motion` and
   * `animateLayout` all describe an *element*, and a component that
   * offers no way to reach its root element cannot be animated from
   * outside at all — it has to be wrapped in a box that exists only to
   * carry the modifier.
   *
   * Named `rootModifiers` rather than `modifiers` because `modifiers`
   * is reserved on an element and a component may not take it: a
   * component's node is its anchor fragment, which has no box and no
   * paint, so the builder rejects it rather than attach a modifier to
   * something that cannot use one. This prop is the component
   * answering that question for itself — *these go on my root* — and
   * the name says which element that is.
   *
   * The component's own modifiers are listed first, so a caller's
   * write of a property wins over the component's, which is the same
   * rule as everywhere else in the cascade.
   *
   * **Read once, when the component renders.** A component's render
   * runs a single time and builds its root element from what it was
   * given, so a caller who passes a *different* list to the same
   * component instance later is passing it to nothing: the element
   * keeps the modifiers it was built with. That is invisible until a
   * modifier's arguments carry identity, and then it is not: a
   * `sharedElement` whose name changed on a reused component goes on
   * answering to the old name, claims nothing under the new one, and
   * the transition silently stops happening. Give the component a
   * `key` that changes with whatever the modifiers name, so a change
   * builds a new element rather than re-using one.
   */
  rootModifiers?: readonly UiModifier[];
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

/**
 * The component's own modifiers, then the caller's.
 *
 * In that order because the override cascade resolves a conflict in
 * favour of whichever modifier is later, and a caller who attached
 * something to a control means it.
 */
export function modifiersOf(inputs: Inputs<ControlLayoutProps>, ...own: readonly UiModifier[]): readonly UiModifier[] {
  const supplied = inputs.rootModifiers?.value;
  return supplied === undefined || supplied.length === 0 ? own : [...own, ...supplied];
}

/** The layout props the caller actually supplied, as cells to bind. */
export function layoutOf(inputs: Inputs<ControlLayoutProps>): Record<string, unknown> {
  const passed: Record<string, unknown> = {};
  const cells = inputs as unknown as Record<string, InputCell<unknown> | undefined>;
  for (const name of LAYOUT_PROPS) {
    const cell = cells[name];
    if (cell !== undefined && cell.value !== undefined) {
      passed[name] = cell;
    }
  }
  return passed;
}
