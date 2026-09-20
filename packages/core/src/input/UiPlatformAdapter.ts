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
  /**
   * Releases whatever the surface holds outside the adapter's own
   * listeners — a cached measurement's invalidation listeners, an
   * observer.
   *
   * Called from `detach`, so a surface with a lifetime of its own does
   * not need its host to know that: both hosts construct the surface
   * inline in the `attach` call and keep no reference to it, and
   * asking them to start keeping one would have been a change to
   * every host rather than to the one class that grew the listeners.
   * Optional, since a fake or a surface that holds nothing has nothing
   * to release.
   */
  dispose?(): void;
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
    // After the adapter's own listeners, and before the field is
    // cleared: a surface that caches anything about the element keeps
    // the listeners that invalidate it, and this is the only moment
    // either host tells anybody that the surface is finished with.
    surface.dispose?.();
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
  // The browser's own menu would land directly on top of the
  // `ContextMenu` event the runtime dispatches for the same press,
  // which is the mistake `-webkit-touch-callout` above was added to
  // stop iOS making. Registered on the element rather than removed on
  // detach for the same reason the styles are written and never
  // unwritten: the surface is the application's, and the listener
  // stops existing when the element does.
  element.addEventListener('contextmenu', suppressContextMenu);
}

/** Keeps the platform menu out of the way of the framework's own. */
function suppressContextMenu(event: Event): void {
  event.preventDefault();
}

/**
 * Surface implementation backed by a real HTML element. Pointer and
 * wheel events come from the element; keyboard events come from
 * `window` by default so Tab/keys work even when the canvas is not
 * focused. `clientToLocal` subtracts the element's bounding client
 * rect, producing layout-logical coordinates.
 *
 * That rect is cached, because reading it is not free. A
 * `getBoundingClientRect` against a dirty document forces the browser
 * to flush style and layout synchronously, and `clientToLocal` ran
 * once per pointer event on the main thread — so a pointermove burst
 * through a drag was a burst of forced layouts, which is the single
 * largest piece of frame time this shell was giving away. The
 * worker-backed shell caches the same two numbers for the same
 * reason; neither path is worth fixing alone.
 *
 * What drops the cache is everything that can move or resize the
 * element and says so: a scroll anywhere in the ancestor chain, a
 * window resize, and a ResizeObserver on the element where the
 * environment has one. Scroll is listened for on `window` in the
 * capture phase because a scroll event on some inner container does
 * not bubble, and the element's offset moves whichever ancestor
 * scrolled. A pointerdown drops it too, so every gesture starts from
 * a rect read after the press.
 *
 * What that gives up is exactness while a press is already down and
 * something moves the element with no event at all — a CSS
 * transition on the canvas's own position, a frame callback writing
 * `style.left`. A drag in flight then tracks against where the
 * element was when the finger landed. The pointerdown read is what
 * bounds the error: it cannot outlive one press. The alternative was
 * to re-read once per animation frame instead, which costs a forced
 * layout per frame in exchange for being wrong for less of a frame —
 * the same defect, priced higher.
 *
 * Every global here is reached for through a guard, because this is
 * `gesso-core` and core does not get to assume a browser. With no
 * `window` and no `ResizeObserver` nothing is observed, and then
 * nothing is cached either: `clientToLocal` reads the rect on every
 * call, exactly as it did before. A cache that no event can
 * invalidate is a wrong answer waiting to be handed out, and a
 * headless or test host pays nothing for the listeners it cannot
 * have. For the same reason the element is only measured when a
 * coordinate is actually asked for, never in the constructor: the
 * element handed to a test is not always one with a box.
 */
export class CanvasPlatformSurface implements PlatformSurface {
  /** The element's viewport offset, or null when it must be re-read. */
  private rect: { left: number; top: number } | null = null;
  /** Null where the environment has no window to listen on. */
  private viewportRoot: PlatformEventTarget | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly invalidateRect = (): void => {
    this.rect = null;
  };

  constructor(
    private readonly element: HTMLElement,
    // Guarded rather than `= window`, which is a ReferenceError and
    // not merely undefined on a thread that has no window — and a
    // surface that throws on construction is no use to the headless
    // host this package is also built for. With no window there is
    // nothing to hear keys on, so the target is inert and says so by
    // accepting listeners it will never call.
    private readonly keyboardRoot: PlatformEventTarget = browserWindow() ?? inertEventTarget
  ) {
    const root = browserWindow();
    if (root !== null) {
      // `passive`, because none of the three is ever preventDefaulted
      // here, and a non-passive scroll listener on window is its own
      // scrolling jank.
      root.addEventListener('scroll', this.invalidateRect, { capture: true, passive: true });
      root.addEventListener('resize', this.invalidateRect, { passive: true });
      root.addEventListener('pointerdown', this.invalidateRect, { capture: true, passive: true });
      this.viewportRoot = root;
    }
    this.resizeObserver = observeElementBox(element, this.invalidateRect);
  }

  get pointerTarget(): PlatformEventTarget {
    return this.element;
  }

  get keyboardTarget(): PlatformEventTarget {
    return this.keyboardRoot;
  }

  clientToLocal(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.rect ?? this.readRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  setTouchAction(value: string): void {
    if (this.element.style.touchAction !== value) {
      this.element.style.touchAction = value;
    }
  }

  /**
   * Removes the listeners and the observer the constructor added.
   *
   * `UiPlatformAdapter.detach` calls this for whatever surface it
   * holds, which is how the two existing hosts — `GessoApp.dispose`
   * and the playground — get the teardown without either of them
   * learning that the surface now has one. Safe to call twice, and
   * safe to keep using afterwards: a disposed surface has nothing
   * left that could tell it the element moved, so it stops caching
   * and goes back to measuring on every call rather than answering
   * from a rect nothing can correct.
   */
  dispose(): void {
    const root = this.viewportRoot;
    if (root !== null) {
      root.removeEventListener('scroll', this.invalidateRect, { capture: true });
      root.removeEventListener('resize', this.invalidateRect);
      root.removeEventListener('pointerdown', this.invalidateRect, { capture: true });
      this.viewportRoot = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.rect = null;
  }

  /**
   * Measures the element, and keeps the answer only if something is
   * watching for it to go stale.
   *
   * An element with no `getBoundingClientRect` reads as sitting at the
   * viewport origin, for the reason `capturePointer` ignores a target
   * with no `setPointerCapture`: a test double or a non-element event
   * target is not a reason to fail a press.
   */
  private readRect(): { left: number; top: number } {
    const box =
      typeof this.element.getBoundingClientRect === 'function'
        ? this.element.getBoundingClientRect()
        : { left: 0, top: 0 };
    const rect = { left: box.left, top: box.top };
    if (this.viewportRoot !== null || this.resizeObserver !== null) {
      this.rect = rect;
    }
    return rect;
  }
}

/** The window, on a thread that has one. */
function browserWindow(): PlatformEventTarget | null {
  return typeof window === 'undefined' ? null : window;
}

/** Stands in for a window that isn't there, so nothing has to branch. */
const inertEventTarget: PlatformEventTarget = {
  addEventListener(): void {},
  removeEventListener(): void {}
};

/**
 * Watches an element's box, where the environment can.
 *
 * Two things can go wrong and neither is fatal: there may be no
 * `ResizeObserver` at all (a worker, Node, an older engine), and the
 * "element" may be a double that `observe` refuses. Both mean the
 * caller simply learns nothing about resizes, which it is written to
 * survive.
 */
function observeElementBox(element: HTMLElement, onResize: () => void): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') {
    return null;
  }
  try {
    const observer = new ResizeObserver(onResize);
    observer.observe(element);
    return observer;
  } catch {
    return null;
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
