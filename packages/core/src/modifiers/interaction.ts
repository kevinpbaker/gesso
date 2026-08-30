import type { Subject } from 'rxjs';

import { UiEventType } from '../input/UiInputEvent';
import type { LayoutBox } from '../layout/LayoutTypes';
import { UiVisualState, type UiVisualStateSet } from '../properties/UiVisualState';
import { defineModifier, type UiModifier } from './UiModifier';

/**
 * Pointer state, as a property anything can read, and the property
 * writes that follow from it.
 *
 * `visualState` has been a registered, paint-affecting property since
 * the first renderer and **nothing has ever written it** — which is
 * why an app that wanted a row to light up on hover kept a
 * `state(false)` and two handlers per widget. This is the one writer.
 *
 * Neither renderer reads `visualState` either: nothing resolves a
 * colour from a state yet, and what a themed control looks like when
 * hovered is F3's theming decision, not this modifier's. So the state
 * is published for whoever reads it, and `hovered` / `pressed` carry
 * the property values to write while the state lasts. They go through
 * the override cascade, so leaving restores exactly what the element
 * declared — including nothing at all.
 *
 * Hover and press are one modifier rather than two on purpose: two
 * modifiers writing `visualState` would be a real conflict, with the
 * later one's set dropping the other's state, and the pair is wanted
 * together often enough that splitting them would mostly produce that
 * bug. `hoverable()` and `pressable()` are this kind with one half
 * switched off.
 */
export interface InteractiveOptions {
  readonly hover: boolean;
  readonly press: boolean;
  /** Properties to write while the pointer is over the node. */
  readonly hovered?: Readonly<Record<string, unknown>>;
  /** Properties to write while it is held down, over the hovered ones. */
  readonly pressed?: Readonly<Record<string, unknown>>;
}

const BOTH: InteractiveOptions = Object.freeze({ hover: true, press: true });
const HOVER_ONLY: InteractiveOptions = Object.freeze({ hover: true, press: false });
const PRESS_ONLY: InteractiveOptions = Object.freeze({ hover: false, press: true });

const kind = defineModifier<InteractiveOptions>({
  name: 'interactive',
  attach(host, options) {
    // Per-attachment state: one node's pointer, not the kind's.
    let hovered = false;
    let pressed = false;
    const styled = new Set([...Object.keys(options.hovered ?? {}), ...Object.keys(options.pressed ?? {})]);

    const sync = (): void => {
      const states = new Set<UiVisualState>();
      if (hovered) {
        states.add(UiVisualState.Hovered);
      }
      if (pressed) {
        states.add(UiVisualState.Pressed);
      }
      if (states.size === 0) {
        states.add(UiVisualState.Normal);
      }
      const current = host.get<UiVisualStateSet>('visualState');
      if (!sameStates(current, states)) {
        host.set('visualState', states);
      }
      for (const property of styled) {
        const value =
          (pressed ? options.pressed?.[property] : undefined) ?? (hovered ? options.hovered?.[property] : undefined);
        if (value === undefined) {
          host.clear(property);
        } else {
          host.set(property, value);
        }
      }
    };

    if (options.hover) {
      host.on(UiEventType.PointerEnter, () => {
        hovered = true;
        sync();
      });
      host.on(UiEventType.PointerLeave, () => {
        hovered = false;
        // A pointer that leaves during a press never sends the up.
        pressed = false;
        sync();
      });
    }
    if (options.press) {
      host.on(UiEventType.PointerDown, () => {
        pressed = true;
        sync();
      });
      host.on(UiEventType.PointerUp, () => {
        pressed = false;
        sync();
      });
      host.on(UiEventType.PointerCancel, () => {
        pressed = false;
        sync();
      });
    }
  }
  // No detach: the host restores every property this modifier wrote
  // and removes its listeners. There is nothing else it holds.
});

/** Hover and press. */
export function interactive(options: InteractiveOptions = BOTH): UiModifier<InteractiveOptions> {
  return kind(options);
}

/** Hover only. */
export function hoverable(): UiModifier<InteractiveOptions> {
  return kind(HOVER_ONLY);
}

/** Press only. */
export function pressable(): UiModifier<InteractiveOptions> {
  return kind(PRESS_ONLY);
}

/**
 * What every Button carries. One shared value, so its arguments keep
 * their identity across renders and the modifier is never re-attached.
 */
export const BUTTON_INTERACTION: UiModifier<InteractiveOptions> = kind(BOTH);

function sameStates(a: UiVisualStateSet, b: ReadonlySet<UiVisualState>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const state of b) {
    if (!a.has(state)) {
      return false;
    }
  }
  return true;
}

/**
 * Reports the node's box whenever it moves: the `ResizeObserver` a
 * canvas does not have.
 *
 * The subject is the caller's, so a component can attach this to an
 * element it renders and read the box back — which is how a split pane
 * turns a pointer position into a fraction of its own track without
 * reaching into the layout engine.
 */
export const measure = defineModifier<Subject<LayoutBox>>({
  name: 'measure',
  attach(host, target) {
    const box = host.layoutBox();
    if (box !== null) {
      target.next(box);
    }
    host.onLayout(next => target.next(next));
  }
});
