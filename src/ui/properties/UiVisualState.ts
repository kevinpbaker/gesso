/**
 * A small, explicit set of interactive visual states.
 *
 * This is intentionally not a CSS pseudo-class system. Components
 * can resolve properties against the current state set, and the
 * reactive pipeline can drive state changes through Observables.
 */
export enum UiVisualState {
  Normal = 'normal',
  Hovered = 'hovered',
  Pressed = 'pressed',
  Focused = 'focused',
  Disabled = 'disabled',
  Selected = 'selected',
  Dragged = 'dragged'
}

/**
 * A set of active visual states.
 */
export type UiVisualStateSet = ReadonlySet<UiVisualState>;

/**
 * Creates a state set from zero or more states.
 */
export function visualState(...states: UiVisualState[]): UiVisualStateSet {
  return new Set(states);
}

/**
 * The default visual state set containing only Normal.
 */
export const defaultVisualState: UiVisualStateSet = visualState(UiVisualState.Normal);

/**
 * Returns true when the supplied state is active in the set.
 */
export function hasVisualState(states: UiVisualStateSet, state: UiVisualState): boolean {
  return states.has(state);
}

/**
 * Compares two visual state sets for equality.
 */
export function visualStatesEqual(a: UiVisualStateSet, b: UiVisualStateSet): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const state of a) {
    if (!b.has(state)) {
      return false;
    }
  }
  return true;
}
