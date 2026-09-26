import {
  MOUSE_POINTER,
  noKeyModifiers,
  UiEventType,
  UiPointerEvent,
  type UiKeyModifiers,
  type UiNode,
  type UiPointerDevice,
  type UiPointerKind
} from 'gesso-core';
import type { GessoRuntime } from 'gesso-framework';

export interface PointAt {
  x?: number;
  y?: number;
  modifiers?: Partial<UiKeyModifiers>;
}

/**
 * The events a test sends, bound to one render.
 *
 * Bound rather than global — `@testing-library`'s `fireEvent` is a free
 * function because the DOM it acts on is a global, and a Gesso runtime
 * is not: two can be mounted in one file, in one worker, at once. So
 * this comes off the render (`ui.fireEvent.click(node)`), and
 * `createFireEvent(runtime)` is there for anyone driving a runtime this
 * library did not mount.
 *
 * Everything here goes through the same controllers a real pointer and
 * a real keyboard go through. That is the whole point: a test that
 * poked a component's handler directly would pass while the component
 * was unreachable by mouse, by keyboard, and by a screen reader.
 */
export interface FireEvent {
  /**
   * A click on a node, with no hit test.
   *
   * Addressed by node rather than by coordinate because that is what a
   * query returns, and because a component's job is to respond to a
   * click on it — whether the pixel at (x, y) lands on it is the hit
   * tester's business and `LayoutEngine`'s specs already cover it. Use
   * `pointerDown`/`pointerUp` for the coordinate path.
   */
  click(node: UiNode, at?: PointAt): void;
  /**
   * Two clicks on a node and the DoubleClick that follows them, in the
   * order a real pointer produces them. Use the coordinate path twice
   * to ask whether two presses *make* a double click; this is for
   * asking what a double click does.
   */
  doubleClick(node: UiNode, at?: PointAt): void;
  /** A request for a node's menu: the right button, or a held finger. */
  contextMenu(node: UiNode, at?: PointAt): void;
  /** A press on a node without the release, for hold and drag behaviour. */
  pressDown(node: UiNode, at?: PointAt): void;
  pressUp(node: UiNode, at?: PointAt): void;
  /** A press-and-move on a node: what grabbing a divider or a thumb is. */
  pan(node: UiNode, x: number, y: number): void;

  /**
   * The coordinate path, through the hit tester.
   *
   * `pointer` says what made the contact — a finger, a pen — for the
   * behaviours that are only a finger's: a pan that scrolls, a long
   * press that asks for a menu, a larger slop. A mouse when absent, as
   * everywhere else a device is not named.
   */
  pointerDown(x: number, y: number, options?: PointerOptions): void;
  pointerMove(x: number, y: number, options?: PointerOptions): void;
  pointerUp(x: number, y: number, options?: PointerOptions): void;
  wheel(options: {
    x?: number;
    y?: number;
    deltaX?: number;
    deltaY?: number;
    modifiers?: Partial<UiKeyModifiers>;
  }): void;

  /** A key press at whatever has focus. */
  keyDown(key: string, modifiers?: Partial<UiKeyModifiers>): void;
  keyUp(key: string, modifiers?: Partial<UiKeyModifiers>): void;
  /** Down then up, which is what pressing a key is. */
  press(key: string, modifiers?: Partial<UiKeyModifiers>): void;

  focus(node: UiNode): boolean;
  blur(): void;
  tab(): boolean;
  shiftTab(): boolean;

  /**
   * Types into the focused editable, one insertion, as the editing
   * proxy's `beforeinput` would deliver it.
   */
  type(text: string): void;
  paste(text: string): void;
}

function modifiersOf(partial: Partial<UiKeyModifiers> | undefined): UiKeyModifiers {
  return { ...noKeyModifiers(), ...partial };
}

export function createFireEvent(runtime: GessoRuntime): FireEvent {
  const dispatch = (type: UiEventType, node: UiNode, at: PointAt = {}): void => {
    runtime.input.dispatcher.dispatch(
      new UiPointerEvent(type, at.x ?? 0, at.y ?? 0, 1, modifiersOf(at.modifiers)),
      node
    );
  };

  return {
    click: (node, at) => dispatch(UiEventType.Click, node, at),
    doubleClick: (node, at) => {
      dispatch(UiEventType.Click, node, at);
      dispatch(UiEventType.Click, node, at);
      dispatch(UiEventType.DoubleClick, node, at);
    },
    contextMenu: (node, at) => dispatch(UiEventType.ContextMenu, node, at),
    pressDown: (node, at) => dispatch(UiEventType.PointerDown, node, at),
    pressUp: (node, at) => dispatch(UiEventType.PointerUp, node, at),
    pan: (node, x, y) => dispatch(UiEventType.PanMove, node, { x, y }),

    pointerDown: (x, y, options = {}) =>
      void runtime.input.pointer.pointerDown(x, y, options.buttons ?? 1, modifiersOf(options.modifiers), deviceOf(options.pointer)),
    pointerMove: (x, y, options = {}) =>
      void runtime.input.pointer.pointerMove(x, y, options.buttons ?? 0, modifiersOf(options.modifiers), deviceOf(options.pointer)),
    pointerUp: (x, y, options = {}) =>
      void runtime.input.pointer.pointerUp(x, y, options.buttons ?? 0, modifiersOf(options.modifiers), deviceOf(options.pointer)),
    wheel: options =>
      void runtime.input.wheel.wheel(
        options.x ?? 0,
        options.y ?? 0,
        options.deltaX ?? 0,
        options.deltaY ?? 0,
        modifiersOf(options.modifiers)
      ),

    keyDown: (key, modifiers) => void runtime.input.keyboard.keyDown(key, modifiersOf(modifiers)),
    keyUp: (key, modifiers) => void runtime.input.keyboard.keyUp(key, modifiersOf(modifiers)),
    press: (key, modifiers) => {
      runtime.input.keyboard.keyDown(key, modifiersOf(modifiers));
      runtime.input.keyboard.keyUp(key, modifiersOf(modifiers));
    },

    focus: node => runtime.input.focus.focus(node),
    blur: () => runtime.input.focus.blur(),
    tab: () => runtime.input.focus.focusNext(),
    shiftTab: () => runtime.input.focus.focusPrevious(),

    type: text => void runtime.input.editing.insertText(text),
    paste: text => void runtime.input.editing.paste(text)
  };
}

/** What `pointerDown`, `pointerMove` and `pointerUp` take. */
export interface PointerOptions {
  readonly buttons?: number;
  readonly modifiers?: Partial<UiKeyModifiers>;
  readonly pointer?: UiPointerKind;
}

/** One device per kind, with the ids a browser gives them, so a press and its moves agree on who made them. */
const DEVICES: Readonly<Record<UiPointerKind, UiPointerDevice>> = {
  mouse: MOUSE_POINTER,
  pen: Object.freeze({ id: 3, kind: 'pen' as const }),
  touch: Object.freeze({ id: 2, kind: 'touch' as const })
};

function deviceOf(kind: UiPointerKind | undefined): UiPointerDevice {
  return DEVICES[kind ?? 'mouse'];
}
