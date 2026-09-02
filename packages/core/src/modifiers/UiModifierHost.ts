import type { Observable } from 'rxjs';

import type { UiNode } from '../graph/UiNode';
import type { UiEnvironmentKey } from '../environment/UiEnvironmentKey';
import type { LayoutBox } from '../layout/LayoutTypes';
import type { UiEventListener, UiEventListenerOptions } from '../input/UiInputDispatcher';
import type { UiEventType } from '../input/UiInputEvent';
import type { DecorationShape } from '../rendering/Decorations';
import type { AnimatedCell, UiSharedElements, UiSpringOptions, UiTweenOptions } from '../animation';

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
   * Listens to input anywhere in the tree, unregistered on detach.
   *
   * The listener is registered on the graph's root, in the capture
   * phase by default, so it runs before the node the event is going to
   * and sees events that never reach this modifier's own node at all.
   * That last part is the whole reason it exists: "the person pressed
   * somewhere else" is not observable from a listener on the node the
   * press missed.
   *
   * Use it only for that. A modifier that listens at the root for
   * something it could hear at its own node makes every event in the
   * application walk one more listener, and there is one of these per
   * attached instance.
   */
  onRoot(type: UiEventType, listener: UiEventListener, options?: UiEventListenerOptions): void;
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
   * Where the node sits in the layout, before any scrolling above it.
   *
   * `layoutBox` answers where the node is *seen*, which is what turns
   * a pointer position into a fraction of a track. This answers where
   * it is in the flow, which is a different question and the one an
   * animation asks: a node whose page scrolled has not moved, and a
   * layout animation that thought it had would drag every row of every
   * list behind the scroll.
   */
  flowBox(): LayoutBox | null;
  /**
   * How far this node is scrolled, or null for one that is not a
   * scroll container.
   *
   * The container's **effective** offset, from the layout record: a
   * wheel writes the `scrollY` property unclamped and the engine clamps
   * it to the content on the next layout, so the property can name a
   * place the list never went. See `scrollPosition` for why observing
   * a scroll is a modifier and restoring one is a binding.
   */
  scrollOffset(): { x: number; y: number } | null;
  /**
   * Called after any frame that moved the node's box — including a
   * scroll, which moves everything under the scroller — or that
   * changed the node's own scroll offset, which moves everything
   * inside it and leaves its box alone. Removed on detach.
   *
   * A scroll is a superset of what a listener may care about: read
   * `flowBox()` inside the listener when what matters is the node's
   * place in the layout rather than on the screen.
   */
  onLayout(listener: (box: LayoutBox) => void): void;
  /**
   * The value the node inherits for an environment key: what the
   * nearest provider above it supplies, else the key's default.
   */
  environment<T>(key: UiEnvironmentKey<T>): T;
  /**
   * Called after the node's inherited environment changed — a theme
   * provider above it swapping palettes, or the node being mounted
   * into a tree that provides one. Removed on detach.
   *
   * Register this only when the modifier holds a value it read out of
   * the environment. A colour does not need it: a `UiColorValue` may
   * name a palette entry, which resolves at paint against whatever the
   * node inherits, which is why `focusRing` has no environment access
   * at all.
   */
  onEnvironment(listener: () => void): void;
  /** Moves keyboard focus to the node, if it can take it. */
  focus(): void;
  /** Whether the node currently holds keyboard focus. */
  isFocused(): boolean;
  /**
   * Whether the focus the node holds should be shown: false after a
   * pointer press put it there, true once the keyboard is used, the way
   * `:focus-visible` behaves. False for a node without focus.
   */
  isFocusVisible(): boolean;
  /**
   * Called when the node gains or loses focus, and when the focus it
   * holds becomes visible or stops being so. Removed on detach.
   */
  onFocusChange(listener: (focused: boolean) => void): void;
  /**
   * The shapes this modifier contributes to the node's own paint pass,
   * or null for none. Replaces whatever this modifier decorated with
   * before; other modifiers on the node keep theirs, and the node
   * paints them all in modifier order.
   *
   * See `rendering/Decorations.ts`: node-local coordinates, under the
   * node's transform and its ancestors' clips, and not under its own.
   */
  decorate(shapes: readonly DecorationShape[] | null): void;
  /**
   * Drives a cell over a fixed time, and cancels it on detach.
   *
   * Here rather than through the `AnimationService` because a modifier
   * is `@gesso/core` and a store is the framework's: the same line
   * `layoutBox` and `isFocused` are on. The detach half is the point —
   * `decisions/0026` and `0028` both argue that a modifier's lifetime
   * is exactly its node's, and an animation that outlives its node
   * holds the node, its cell and everything the cell captured.
   */
  animate<T>(cell: AnimatedCell<T>, to: T, options: UiTweenOptions): Observable<T>;
  /** The same, on a spring. See `UiSpring` for why springs take numbers only. */
  spring(cell: AnimatedCell<number>, to: number, options: UiSpringOptions): Observable<number>;
  /**
   * Stops whatever is driving a cell, leaving it exactly where it
   * stands.
   *
   * What a modifier that puts a value somewhere *without* animating it
   * needs: writing the cell while an animation still owns it would be
   * overwritten on the next tick. `AnimationService.stop` is the same
   * call from the framework's side.
   */
  stopAnimation<T>(cell: AnimatedCell<T>): void;
  /**
   * Who else has been called what, so a node arriving under a name
   * another node was using can find out where that node is.
   *
   * Null when the builder was given no registry, which is every
   * headless graph and every spec that does not ask for one; a
   * modifier that needs it warns once and does nothing, as `onLayout`
   * does without layout access.
   *
   * This is one capability rather than three methods because the
   * registry *is* the contract — `MODIFIERS_ROADMAP.md` §4's budget is
   * about what a modifier may reach, and what it reaches here is a
   * name-to-box map that holds no nodes it did not put there itself.
   */
  readonly shared: UiSharedElements | null;
  /** Asks for a repaint, for a modifier whose own state changed. */
  requestFrame(): void;
}
