import type { UiNode } from '../graph/UiNode';
import { noModifiers, UiEventType, UiKeyboardEvent, type UiModifiers } from './UiInputEvent';
import type { UiInputDispatcher } from './UiInputDispatcher';
import type { UiFocusManager } from './UiFocusManager';

export interface KeyboardControllerOptions {
  /**
   * Whether Tab / Shift+Tab drive focus navigation (default true).
   * Set false to leave Tab to application listeners.
   */
  tabNavigation?: boolean;
}

/**
 * Routes keyboard input through the dispatcher.
 *
 * KeyDown/KeyUp are dispatched to the focused node and bubble up the
 * tree, so a container can handle keys for its focused child. When
 * nothing is focused, events are routed to the root node so
 * application-level key handling still works.
 *
 * Default behaviour (cancelled by preventDefault on the KeyDown):
 * Tab moves focus to the next focusable node, Shift+Tab to the
 * previous, wrapping around.
 */
export class UiKeyboardController {
  private readonly tabNavigation: boolean;

  constructor(
    private readonly dispatcher: UiInputDispatcher,
    private readonly focusManager: UiFocusManager,
    private readonly root: UiNode,
    options: KeyboardControllerOptions = {}
  ) {
    this.tabNavigation = options.tabNavigation ?? true;
  }

  keyDown(key: string, modifiers: UiModifiers = noModifiers()): UiKeyboardEvent {
    const event = new UiKeyboardEvent(UiEventType.KeyDown, key, modifiers);
    const target = this.focusManager.focusedNode ?? this.root;
    this.dispatcher.dispatch(event, target);
    if (!event.defaultPrevented && this.tabNavigation && key === 'Tab') {
      if (modifiers.shift) {
        this.focusManager.focusPrevious();
      } else {
        this.focusManager.focusNext();
      }
    }
    return event;
  }

  keyUp(key: string, modifiers: UiModifiers = noModifiers()): UiKeyboardEvent {
    const event = new UiKeyboardEvent(UiEventType.KeyUp, key, modifiers);
    const target = this.focusManager.focusedNode ?? this.root;
    this.dispatcher.dispatch(event, target);
    return event;
  }
}
