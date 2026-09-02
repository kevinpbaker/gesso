import type { UiNode } from '../graph/UiNode';
import { noKeyModifiers, UiEventType, UiKeyboardEvent, type UiKeyModifiers } from './UiInputEvent';
import type { UiInputDispatcher } from './UiInputDispatcher';
import type { UiFocusManager } from './UiFocusManager';

export interface KeyboardControllerOptions {
  /**
   * Whether Tab / Shift+Tab drive focus navigation (default true).
   * Set false to leave Tab to application listeners.
   */
  tabNavigation?: boolean;
  /**
   * Default keyboard behaviour for a focused editable: caret movement,
   * deletion, undo, and typing when no shell proxy supplies text. Runs
   * after the app's KeyDown listeners and only if none called
   * preventDefault(); a key it handles is marked default-prevented.
   */
  editing?: { handleKey(node: UiNode, key: string, modifiers: UiKeyModifiers): boolean };
  /**
   * Default keyboard behaviour for a canvas text selection: copy it,
   * select everything, or clear it. Runs only when no focused editable
   * claimed the key first, so Cmd/Ctrl+A and Cmd/Ctrl+C inside a field
   * still belong to the field.
   */
  selection?: { handleKey(key: string, modifiers: UiKeyModifiers): boolean };
  /**
   * Default keyboard behaviour for find: Cmd/Ctrl+F opens a session,
   * Escape closes one. Runs before the selection's, so Escape ends the
   * find rather than clearing the match it has selected.
   */
  find?: { handleKey(key: string, modifiers: UiKeyModifiers): boolean };
}

/**
 * Routes keyboard input through the dispatcher.
 *
 * KeyDown/KeyUp are dispatched to the focused node and bubble up the
 * tree, so a container can handle keys for its focused child. When
 * nothing is focused, events are routed to the root node so
 * application-level key handling still works. The root may be given as
 * a getter, for a host whose root is rebuilt while the controller
 * lives (a reload) or that wants keys to land on the application's own
 * root rather than the layout root it is wrapped in: an event
 * dispatched to a node bubbles to its ancestors, so nothing above the
 * chosen root is left out.
 *
 * Default behaviour (cancelled by preventDefault on the KeyDown), in
 * order: the focused editable's editing keys, then find's open/close,
 * then the canvas text selection's copy / select-all / clear, then Tab
 * moving focus to the next focusable node and Shift+Tab to the
 * previous, wrapping around.
 */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

export class UiKeyboardController {
  private readonly tabNavigation: boolean;
  private readonly editing: KeyboardControllerOptions['editing'];
  private readonly selection: KeyboardControllerOptions['selection'];
  private readonly find: KeyboardControllerOptions['find'];

  private readonly root: () => UiNode;

  constructor(
    private readonly dispatcher: UiInputDispatcher,
    private readonly focusManager: UiFocusManager,
    root: UiNode | (() => UiNode),
    options: KeyboardControllerOptions = {}
  ) {
    this.root = typeof root === 'function' ? root : () => root;
    this.tabNavigation = options.tabNavigation ?? true;
    this.editing = options.editing;
    this.selection = options.selection;
    this.find = options.find;
  }

  keyDown(key: string, modifiers: UiKeyModifiers = noKeyModifiers()): UiKeyboardEvent {
    // A key makes focus visible again after a mouse press, as
    // `:focus-visible` does. A modifier on its own does not count: it is
    // held for a click as often as for a shortcut.
    if (!MODIFIER_KEYS.has(key)) {
      this.focusManager.noteInput('keyboard');
    }
    const event = new UiKeyboardEvent(UiEventType.KeyDown, key, modifiers);
    const focused = this.focusManager.focusedNode;
    const target = focused ?? this.root();
    this.dispatcher.dispatch(event, target);
    if (
      !event.defaultPrevented &&
      focused !== null &&
      this.editing !== undefined &&
      this.editing.handleKey(focused, key, modifiers)
    ) {
      event.preventDefault();
      return event;
    }
    if (!event.defaultPrevented && this.find !== undefined && this.find.handleKey(key, modifiers)) {
      event.preventDefault();
      return event;
    }
    if (!event.defaultPrevented && this.selection !== undefined && this.selection.handleKey(key, modifiers)) {
      event.preventDefault();
      return event;
    }
    if (!event.defaultPrevented && this.tabNavigation && key === 'Tab') {
      if (modifiers.shift) {
        this.focusManager.focusPrevious();
      } else {
        this.focusManager.focusNext();
      }
    }
    return event;
  }

  keyUp(key: string, modifiers: UiKeyModifiers = noKeyModifiers()): UiKeyboardEvent {
    const event = new UiKeyboardEvent(UiEventType.KeyUp, key, modifiers);
    const target = this.focusManager.focusedNode ?? this.root();
    this.dispatcher.dispatch(event, target);
    return event;
  }
}
