import type { UiNode } from '../graph/UiNode';

/** Anything a modifier can hand to `own` to have released on detach. */
export type UiModifierTeardown = (() => void) | { unsubscribe(): void };

/**
 * Everything a modifier may touch.
 *
 * Deliberately narrow, and the whole budget: a capability that is not
 * here is a proposal against `MODIFIERS_ROADMAP.md`, not a parameter
 * added in passing. A modifier cannot reach a renderer or a canvas
 * context (that would undo the backends' shared inputs), and it cannot
 * add or remove children (a behaviour that needs children is a
 * component, and component identity is node identity).
 *
 * This is the B0 surface. Property access, events, layout, environment
 * and focus arrive in B1 and B2.
 */
export interface UiModifierHost {
  /** The node the modifier is attached to. */
  readonly node: UiNode;
  /**
   * Registers something to release when the modifier detaches.
   * Teardowns run in reverse order, as a stack unwinds.
   */
  own(teardown: UiModifierTeardown): void;
  /** Asks for a repaint, for a modifier whose own state changed. */
  requestFrame(): void;
}
