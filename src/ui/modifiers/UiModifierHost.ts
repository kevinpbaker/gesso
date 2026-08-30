import type { Observable } from 'rxjs';

import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiEventListener, UiEventListenerOptions } from '../input/UiInputDispatcher';
import type { UiEventType } from '../input/UiInputEvent';

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
 * Environment and focus access arrive with the rest of B2.
 */
export interface UiModifierHost {
  /** The node the modifier is attached to. */
  readonly node: UiNode;
  /**
   * The property's effective value: what this or another modifier has
   * written, else the element's own value, else what it inherits from
   * the environment, else the property's default.
   */
  get<T>(property: string): T;
  /**
   * Writes over the element's value until `clear` or detach, when the
   * element's own value comes back with the property's dirty flags.
   * An Observable is subscribed for as long as the modifier is
   * attached, each emission writing the override.
   */
  set(property: string, value: unknown | Observable<unknown>): void;
  /** Drops this modifier's write of the property. */
  clear(property: string): void;
  /**
   * Listens to input on the node, unregistered on detach.
   *
   * The element's own `on*` handler is registered first, so at the
   * target it runs before any modifier's; `stopImmediatePropagation`
   * from it stops the modifiers behind it.
   */
  on(type: UiEventType, listener: UiEventListener, options?: UiEventListenerOptions): void;
  /**
   * Registers something to release when the modifier detaches.
   * Teardowns run in reverse order, as a stack unwinds.
   */
  own(teardown: UiModifierTeardown): void;
  /**
   * Where the node is now, in layout coordinates, or null before the
   * first layout and for a node that has no record (a fragment).
   */
  layoutBox(): LayoutBox | null;
  /**
   * Called after any frame that moved the node's box — including a
   * scroll, which moves everything under the scroller. Removed on
   * detach.
   */
  onLayout(listener: (box: LayoutBox) => void): void;
  /** Asks for a repaint, for a modifier whose own state changed. */
  requestFrame(): void;
}
