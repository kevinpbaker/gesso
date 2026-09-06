import {
  MOUSE_POINTER,
  wheelDeltaYOf,
  type UiKeyModifiers,
  type UiPointerDevice,
  type UiPointerKind
} from './UiInputEvent';
import type { UiKeyboardController } from './UiKeyboardController';
import type { UiPointerController } from './UiPointerController';
import type { UiWheelController } from './UiWheelController';

/**
 * Minimal event target surface the adapter can attach to. Real DOM
 * EventTargets satisfy this structurally; tests use a fake.
 */
export interface PlatformEventTarget {
  addEventListener(
    type: string,
    listener: ((event: Event) => void) | null,
    options?: AddEventListenerOptions | boolean
  ): void;
  removeEventListener(
    type: string,
    listener: ((event: Event) => void) | null,
    options?: EventListenerOptions | boolean
  ): void;
}

/**
 * Surface abstraction that supplies pointer and keyboard targets and
 * converts DOM viewport coordinates into the layout coordinate space.
 */
export interface PlatformSurface {
  readonly pointerTarget: PlatformEventTarget;
  readonly keyboardTarget: PlatformEventTarget;
  clientToLocal(clientX: number, clientY: number): { x: number; y: number };
  /**
   * Sets the surface's `touch-action`, when the surface is something
   * that has one.
   *
   * The adapter drives this rather than leaving it fixed at the value
   * `prepareInputSurface` set, because the right value is not a
   * property of the canvas — it is a property of what is currently
   * inside it. Optional: a test fake, or a surface that is not a DOM
   * element, has nothing to set.
   */
  setTouchAction?(value: string): void;
}

export interface PlatformAdapterOptions {
  pointerController: UiPointerController;
  wheelController: UiWheelController;
  keyboardController: UiKeyboardController;
}

/**
 * Bridges platform/browser input events to the framework input
 * controllers. The adapter can be used directly (for tests, Worker
 * runtimes, or custom event sources) or attached to a PlatformSurface
 * that supplies real DOM events.
 */
export class UiPlatformAdapter {
  private readonly pointer: UiPointerController;
  private readonly wheel: UiWheelController;
  private readonly keyboard: UiKeyboardController;
  private surface: PlatformSurface | null = null;
  private pointerDownHandler: ((e: Event) => void) | null = null;
  private pointerMoveHandler: ((e: Event) => void) | null = null;
  private pointerUpHandler: ((e: Event) => void) | null = null;
  private pointerCancelHandler: ((e: Event) => void) | null = null;
  private wheelHandler: ((e: Event) => void) | null = null;
  private keyDownHandler: ((e: Event) => void) | null = null;
  private keyUpHandler: ((e: Event) => void) | null = null;

  constructor(options: PlatformAdapterOptions) {
    this.pointer = options.pointerController;
    this.wheel = options.wheelController;
    this.keyboard = options.keyboardController;
  }

  /** True when the adapter is currently attached to a surface. */
  get attached(): boolean {
    return this.surface !== null;
  }

  /**
   * Attach to a surface and start forwarding DOM events to the
   * controllers. Detaches any previous surface first.
   */
  attach(surface: PlatformSurface): void {
    this.detach();
    this.surface = surface;

    this.pointerDownHandler = e => {
      const p = e as PointerEvent;
      const local = surface.clientToLocal(p.clientX, p.clientY);
      // The element keeps every later event of this contact even once
      // the finger leaves its box. Touch captures implicitly and a
      // mouse does not, so without this a drag that runs off the
      // canvas stops being delivered on one device and not the other.
      capturePointer(e.target, p.pointerId);
      const event = this.pointer.pointerDown(local.x, local.y, p.buttons, modifiersFromEvent(p), pointerDeviceOf(p));
      if (event.defaultPrevented) {
        p.preventDefault();
      }
    };
    this.pointerMoveHandler = e => {
      const p = e as PointerEvent;
      const local = surface.clientToLocal(p.clientX, p.clientY);
      this.pointer.pointerMove(local.x, local.y, p.buttons, modifiersFromEvent(p), pointerDeviceOf(p));
      this.syncTouchAction();
    };
    this.pointerUpHandler = e => {
      const p = e as PointerEvent;
      const local = surface.clientToLocal(p.clientX, p.clientY);
      this.pointer.pointerUp(local.x, local.y, p.buttons, modifiersFromEvent(p), pointerDeviceOf(p));
    };
    this.pointerCancelHandler = e => {
      this.pointer.pointerCancel(pointerDeviceOf(e as PointerEvent));
    };
    this.wheelHandler = e => {
      const w = e as WheelEvent;
      const local = surface.clientToLocal(w.clientX, w.clientY);
      const event = this.wheel.wheel(
        local.x,
        local.y,
        w.deltaX,
        w.deltaY,
        modifiersFromEvent(w),
        w.deltaMode,
        wheelDeltaYOf(w)
      );
      // Both halves matter, and each was a bug on its own. `consumed`
      // says a container took the delta, and without it the page
      // behind the canvas scrolled too — one wheel, two scrolls.
      // `defaultPrevented` says an application handler took it
      // instead. Anything else is a wheel the runtime had no use for,
      // and it has to reach the page, or a canvas embedded in a
      // document becomes a scroll trap.
      if (event.consumed || event.defaultPrevented) {
        w.preventDefault();
      }
      this.syncTouchAction();
    };
    this.keyDownHandler = e => {
      const k = e as KeyboardEvent;
      const event = this.keyboard.keyDown(k.key, modifiersFromEvent(k));
      if (event.defaultPrevented) {
        k.preventDefault();
      }
    };
    this.keyUpHandler = e => {
      const k = e as KeyboardEvent;
      this.keyboard.keyUp(k.key, modifiersFromEvent(k));
    };

    surface.pointerTarget.addEventListener('pointerdown', this.pointerDownHandler);
    surface.pointerTarget.addEventListener('pointermove', this.pointerMoveHandler);
    surface.pointerTarget.addEventListener('pointerup', this.pointerUpHandler);
    surface.pointerTarget.addEventListener('pointercancel', this.pointerCancelHandler);
    surface.pointerTarget.addEventListener('wheel', this.wheelHandler, { passive: false });
    surface.keyboardTarget.addEventListener('keydown', this.keyDownHandler);
    surface.keyboardTarget.addEventListener('keyup', this.keyUpHandler);
    this.syncTouchAction();
  }

  /**
   * Puts the surface's `touch-action` in step with what the runtime
   * currently has to scroll.
   *
   * Called after input that could have changed the answer, and public
   * so a host that changes the tree without any input — a list that
   * grew, a route that swapped — can say so. Cheap and idempotent:
   * it walks the scroll containers, which are few, and writes to the
   * DOM only on a change.
   */
  syncTouchAction(): void {
    this.surface?.setTouchAction?.(touchActionFor(this.wheel.scrollsAnything()));
  }

  /** Remove all listeners from the attached surface. */
  detach(): void {
    if (this.surface === null) {
      return;
    }
    const surface = this.surface;
    if (this.pointerDownHandler !== null) {
      surface.pointerTarget.removeEventListener('pointerdown', this.pointerDownHandler);
    }
    if (this.pointerMoveHandler !== null) {
      surface.pointerTarget.removeEventListener('pointermove', this.pointerMoveHandler);
    }
    if (this.pointerUpHandler !== null) {
      surface.pointerTarget.removeEventListener('pointerup', this.pointerUpHandler);
    }
    if (this.pointerCancelHandler !== null) {
      surface.pointerTarget.removeEventListener('pointercancel', this.pointerCancelHandler);
    }
    if (this.wheelHandler !== null) {
      surface.pointerTarget.removeEventListener('wheel', this.wheelHandler);
    }
    if (this.keyDownHandler !== null) {
      surface.keyboardTarget.removeEventListener('keydown', this.keyDownHandler);
    }
    if (this.keyUpHandler !== null) {
      surface.keyboardTarget.removeEventListener('keyup', this.keyUpHandler);
    }
    this.surface = null;
    this.pointerDownHandler = null;
    this.pointerMoveHandler = null;
    this.pointerUpHandler = null;
    this.pointerCancelHandler = null;
    this.wheelHandler = null;
    this.keyDownHandler = null;
    this.keyUpHandler = null;
  }
}

/**
 * The device behind a DOM pointer event.
 *
 * Anything the browser reports that is not one of the three known
 * kinds is read as a mouse: `pointerType` is an open string, and an
 * unrecognised device behaving like the default is better than one
 * whose events are dropped.
 *
 * Exported because the worker shell does the same conversion on its
 * way to the protocol, and the two must not answer differently.
 */
export function pointerDeviceOf(event: PointerEvent): UiPointerDevice {
  const kind = event.pointerType;
  if (kind !== 'touch' && kind !== 'pen' && kind !== 'mouse') {
    return MOUSE_POINTER;
  }
  return { id: event.pointerId, kind: kind as UiPointerKind };
}

/**
 * Asks the element to keep this contact, ignoring the failure.
 *
 * `setPointerCapture` throws for a pointer that is no longer active —
 * a contact already released between the event and this call — and
 * that is not a reason to lose the press. A target that has no such
 * method (a test double, a non-element event target) is left alone.
 */
export function capturePointer(target: EventTarget | null, pointerId: number): void {
  const element = target as { setPointerCapture?: (id: number) => void } | null;
  if (typeof element?.setPointerCapture !== 'function') {
    return;
  }
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // The contact ended first; the press will end with it.
  }
}

function modifiersFromEvent(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): UiKeyModifiers {
  return {
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey
  };
}

/**
 * Makes an element usable as an input surface.
 *
 * Five settings, all of them the same instruction in different words:
 * this element is an application, not a document. Every one of them is
 * invisible until a finger arrives, and getting one wrong produces a
 * subtly dead or subtly wrong surface rather than an error.
 *
 *   touch-action              the browser does not take gestures for
 *                             page scrolling and double-tap zoom. The
 *                             framework scrolls its own containers.
 *                             This is the starting value only: once
 *                             an adapter is attached it owns this
 *                             property and relaxes it to `auto`
 *                             whenever the runtime has nothing of its
 *                             own to scroll, so a finger over an
 *                             embedded canvas still scrolls the page
 *                             around it. See `syncTouchAction`.
 *   user-select               a press-and-drag does not start selecting
 *                             the page around the canvas. The framework
 *                             has its own text selection, over text the
 *                             DOM cannot see.
 *   -webkit-touch-callout     a long press does not raise the iOS
 *                             callout menu over the app, which would
 *                             land on the LongPress gesture the app is
 *                             about to receive.
 *   -webkit-tap-highlight     a tap does not flash a grey box over
 *                             whatever the browser guessed was hit.
 *
 * Vendor-prefixed properties are set through the style map rather than
 * as fields, since TypeScript's CSSStyleDeclaration has only some of
 * them and the missing ones are exactly the ones iOS needs.
 */
export function prepareInputSurface(element: HTMLElement): void {
  const style = element.style;
  style.touchAction = 'none';
  style.userSelect = 'none';
  style.setProperty('-webkit-user-select', 'none');
  style.setProperty('-webkit-touch-callout', 'none');
  style.setProperty('-webkit-tap-highlight-color', 'transparent');
  // The surface carries `tabIndex = 0` so that Tab reaches the
  // application at all, which also gives it the browser's own focus
  // outline: click a button drawn on the canvas and the ring lands
  // around the whole canvas rather than around the button. Gesso draws
  // its own indicator for whichever node holds focus (`focusRing` in
  // `modifiers`, coloured by the `focusRing` token), so the platform
  // ring is not the only one and suppressing it costs nothing a
  // keyboard user can see.
  style.outline = 'none';
}

/**
 * Surface implementation backed by a real HTML element. Pointer and
 * wheel events come from the element; keyboard events come from
 * `window` by default so Tab/keys work even when the canvas is not
 * focused. `clientToLocal` subtracts the element's bounding client
 * rect, producing layout-logical coordinates.
 */
export class CanvasPlatformSurface implements PlatformSurface {
  constructor(
    private readonly element: HTMLElement,
    private readonly keyboardRoot: PlatformEventTarget = window
  ) {}

  get pointerTarget(): PlatformEventTarget {
    return this.element;
  }

  get keyboardTarget(): PlatformEventTarget {
    return this.keyboardRoot;
  }

  clientToLocal(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  setTouchAction(value: string): void {
    if (this.element.style.touchAction !== value) {
      this.element.style.touchAction = value;
    }
  }
}

/**
 * The `touch-action` a runtime in this state should have.
 *
 * `'none'` means the framework takes every gesture, which is right
 * whenever it has something of its own to scroll — its touch scroller
 * handles the finger and the page must not fight it. `'auto'` hands
 * gestures back, which is what an embedded canvas with nothing to
 * scroll has to do, or a finger over it cannot scroll the article it
 * sits in.
 *
 * There is no middle value worth using. `pan-y` would let the page
 * scroll vertically while the runtime kept horizontal drags, but
 * touch-action is latched when the finger lands and cannot be
 * narrowed afterwards, so a runtime that guessed wrong has lost the
 * gesture either way. The coarse answer is the one it can defend.
 */
export function touchActionFor(scrollsAnything: boolean): string {
  return scrollsAnything ? 'none' : 'auto';
}
