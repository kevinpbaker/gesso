import { type UiModifiers } from './UiInputEvent';
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
      const event = this.pointer.pointerDown(local.x, local.y, p.buttons, modifiersFromEvent(p));
      if (event.defaultPrevented) {
        p.preventDefault();
      }
    };
    this.pointerMoveHandler = e => {
      const p = e as PointerEvent;
      const local = surface.clientToLocal(p.clientX, p.clientY);
      this.pointer.pointerMove(local.x, local.y, p.buttons, modifiersFromEvent(p));
    };
    this.pointerUpHandler = e => {
      const p = e as PointerEvent;
      const local = surface.clientToLocal(p.clientX, p.clientY);
      this.pointer.pointerUp(local.x, local.y, p.buttons, modifiersFromEvent(p));
    };
    this.pointerCancelHandler = () => {
      this.pointer.pointerCancel();
    };
    this.wheelHandler = e => {
      const w = e as WheelEvent;
      const local = surface.clientToLocal(w.clientX, w.clientY);
      const event = this.wheel.wheel(local.x, local.y, w.deltaX, w.deltaY, modifiersFromEvent(w));
      if (event.defaultPrevented) {
        w.preventDefault();
      }
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

function modifiersFromEvent(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): UiModifiers {
  return {
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey
  };
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
}
