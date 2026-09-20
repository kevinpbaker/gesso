import type { UiNode } from '../graph/UiNode';

/**
 * Framework-level input event types.
 *
 * These deliberately are NOT browser event types: browser events
 * are converted by the platform adapter, and only these reach
 * application code. Gesture events (click/longPress/drag/pan) are
 * synthesized by the gesture layer and flow through the same
 * dispatcher as raw input, so there is exactly one event model.
 */
export enum UiEventType {
  PointerDown = 'pointerdown',
  PointerUp = 'pointerup',
  PointerMove = 'pointermove',
  PointerCancel = 'pointercancel',
  PointerEnter = 'pointerenter',
  PointerLeave = 'pointerleave',
  Wheel = 'wheel',
  KeyDown = 'keydown',
  KeyUp = 'keyup',
  Focus = 'focus',
  Blur = 'blur',
  /** An edit is about to be applied to an editable; preventDefault() drops it. */
  BeforeInput = 'beforeinput',
  /** An editable's text changed. */
  Input = 'input',
  Click = 'click',
  LongPress = 'longpress',
  DragStart = 'dragstart',
  DragMove = 'dragmove',
  DragEnd = 'dragend',
  PanStart = 'panstart',
  PanMove = 'panmove',
  PanEnd = 'panend',
  /**
   * A request for the commands that apply to something: the secondary
   * mouse button, or a finger held on it.
   *
   * A gesture like any other, so the component that shows the menu
   * listens for an event rather than reaching for a browser API it
   * cannot see from a worker.
   */
  ContextMenu = 'contextmenu',
  PinchStart = 'pinchstart',
  PinchMove = 'pinchmove',
  PinchEnd = 'pinchend'
}

/**
 * Keyboard modifier state attached to events that carry one.
 *
 * Named `UiKeyModifiers`, not `UiModifiers`: a modifier in
 * A modifier is a behaviour attached to an element, and one
 * word meaning two things in one package is a permanent tax.
 */
export interface UiKeyModifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export function noKeyModifiers(): UiKeyModifiers {
  return { ctrl: false, shift: false, alt: false, meta: false };
}

/**
 * What is touching the surface, mirroring the DOM's `pointerType`.
 *
 * The runtime needs this because a finger is not a small mouse. It
 * has no hover to leave behind, it covers the point it is aiming at,
 * and it cannot land on a six-pixel scrollbar. Every one of those is
 * a behaviour decision the framework has to take on its own, and
 * `'touch'` is the only evidence it gets.
 */
export type UiPointerKind = 'mouse' | 'pen' | 'touch';

/**
 * The device behind a pointer event.
 *
 * `id` is the DOM's `pointerId`: it separates simultaneous contacts,
 * so a second finger landing mid-press can be told from the first one
 * moving. The pointer controller is single-press and uses it to
 * *ignore* the second finger; a pinch recognizer would use it to
 * follow both.
 */
export interface UiPointerDevice {
  readonly id: number;
  readonly kind: UiPointerKind;
}

/**
 * The device assumed when a caller names none.
 *
 * A mouse, deliberately: every touch-specific behaviour is opt-in on
 * `kind === 'touch'`, so a shell, a test or an app that predates this
 * field keeps exactly the behaviour it had. The id matches what
 * browsers give a mouse, and the object is frozen because it is
 * shared by every event that does not name a device.
 */
export const MOUSE_POINTER: UiPointerDevice = Object.freeze({ id: 1, kind: 'mouse' as const });

/**
 * Base class for every framework input event.
 *
 * Instances are small, flat and reused across the whole runtime.
 * `target` is the node the event was routed to; `currentTarget` is
 * the node currently processing it during dispatch. Both are set by
 * the dispatcher.
 *
 * Cancellation semantics (canvas-specific, documented):
 *   stopPropagation()        — stop the event travelling further.
 *   stopImmediatePropagation() — stop further listeners AND travel.
 *   preventDefault()         — advisory flag that cancels the
 *       framework-level default behaviour for the event kind:
 *         pointerdown  → no click synthesis, no focus-on-press
 *         pointermove  → no drag/pan gesture interpretation
 *         wheel        → no automatic scroll consumption
 *         keydown Tab  → no tab navigation
 *   It never mirrors browser preventDefault exactly; each consumer
 *   defines what "the default" is.
 */
export class UiInputEvent {
  readonly type: UiEventType;

  target: UiNode | null = null;
  currentTarget: UiNode | null = null;

  private propagationStoppedFlag = false;
  private immediateStoppedFlag = false;
  private defaultPreventedFlag = false;

  constructor(type: UiEventType) {
    this.type = type;
  }

  stopPropagation(): void {
    this.propagationStoppedFlag = true;
  }

  stopImmediatePropagation(): void {
    this.propagationStoppedFlag = true;
    this.immediateStoppedFlag = true;
  }

  preventDefault(): void {
    this.defaultPreventedFlag = true;
  }

  get defaultPrevented(): boolean {
    return this.defaultPreventedFlag;
  }

  get propagationStopped(): boolean {
    return this.propagationStoppedFlag;
  }

  get immediateStopped(): boolean {
    return this.immediateStoppedFlag;
  }

  /** Resets the mutable flags so pooled instances can be reused. */
  reset(): void {
    this.target = null;
    this.currentTarget = null;
    this.propagationStoppedFlag = false;
    this.immediateStoppedFlag = false;
    this.defaultPreventedFlag = false;
  }
}

/**
 * Focus/blur transition event.
 *
 * Focus transitions are target-only (they do not bubble), mirroring
 * DOM focus/blur rather than focusin/focusout. `relatedNode` is the
 * node the focus is moving to (for Blur) or away from (for Focus).
 */
export class UiFocusEvent extends UiInputEvent {
  readonly relatedNode: UiNode | null;

  constructor(type: UiEventType.Focus | UiEventType.Blur, relatedNode: UiNode | null) {
    super(type);
    this.relatedNode = relatedNode;
  }
}

/**
 * Pointer input event.
 *
 * Carries the canvas-space position (`x`/`y`), the pressed-button
 * bitmask, the keyboard modifiers present when the event was produced
 * and the device that produced it. Used for every raw Pointer* event
 * and for the Click gesture, so listeners never need a
 * browser-specific event shape.
 */
export class UiPointerEvent extends UiInputEvent {
  constructor(
    type: UiEventType,
    readonly x: number,
    readonly y: number,
    readonly buttons: number = 0,
    readonly modifiers: UiKeyModifiers = noKeyModifiers(),
    /**
     * The device that produced the event, for a listener that has to
     * treat a finger differently — sizing its own hit target, or
     * skipping a hover affordance nothing will ever hover.
     */
    readonly pointer: UiPointerDevice = MOUSE_POINTER
  ) {
    super(type);
  }
}

/**
 * A synthesized single-contact gesture, with the speed it ended at.
 *
 * Every Pan and Drag event is one of these, so a listener never has to
 * ask which kind of pointer event it was handed. The velocity is zero
 * everywhere except on `PanEnd` and `DragEnd`, where it is the speed
 * the contact was travelling at when it left the surface, measured
 * over the last moments of the gesture rather than over the whole of
 * it: a long slow drag that ends in a flick averages out to nothing.
 *
 * **Pixels per second**, which is what `UiSpringOptions.velocity` is
 * in. That is the whole point of carrying it: a card thrown across the
 * screen and released should go on travelling at the speed it was
 * thrown, and a spring handed a velocity of zero stops dead under the
 * finger instead. `UiTouchScroller` measures in pixels per millisecond
 * for its own projection and is not this; the unit is named here so
 * the two are never confused.
 */
export class UiGestureEvent extends UiPointerEvent {
  constructor(
    type: UiEventType,
    x: number,
    y: number,
    buttons: number = 0,
    modifiers: UiKeyModifiers = noKeyModifiers(),
    pointer: UiPointerDevice = MOUSE_POINTER,
    readonly velocityX: number = 0,
    readonly velocityY: number = 0
  ) {
    super(type, x, y, buttons, modifiers, pointer);
  }
}

/**
 * Two contacts moving relative to each other.
 *
 * `scale` and `rotation` are cumulative from the moment the second
 * contact landed, so a listener that writes them straight onto a
 * transform gets the gesture rather than a difference it has to
 * integrate itself; the `*Delta` pair is the change since the previous
 * event, for a listener that is integrating something of its own.
 * `x`/`y` are the midpoint between the contacts, which is the point a
 * zoom should hold still, and `translateX`/`translateY` are how far
 * that midpoint moved since the previous event, so a two-finger pan
 * and a pinch are one gesture rather than two that fight.
 *
 * Rotation is in degrees, matching the `rotation` field of the
 * transform property, so neither end of the handoff converts.
 */
export class UiPinchEvent extends UiInputEvent {
  constructor(
    type: UiEventType.PinchStart | UiEventType.PinchMove | UiEventType.PinchEnd,
    readonly x: number,
    readonly y: number,
    readonly scale: number,
    readonly rotation: number,
    readonly scaleDelta: number,
    readonly rotationDelta: number,
    readonly translateX: number,
    readonly translateY: number,
    readonly modifiers: UiKeyModifiers = noKeyModifiers()
  ) {
    super(type);
  }
}

/**
 * Keyboard input event.
 *
 * `key` is a logical key name ("Enter", "Tab", "ArrowUp", "a", ...)
 * produced by the platform adapter, so listeners never see
 * browser-specific key values.
 */
export class UiKeyboardEvent extends UiInputEvent {
  constructor(
    type: UiEventType.KeyDown | UiEventType.KeyUp,
    readonly key: string,
    readonly modifiers: UiKeyModifiers = noKeyModifiers()
  ) {
    super(type);
  }
}

/**
 * An edit about to reach an editable node's text.
 *
 * `inputType` follows the DOM Input Events vocabulary
 * (`insertText`, `insertLineBreak`, `insertFromPaste`,
 * `deleteContentBackward`, `deleteWordForward`, …) whether the edit
 * came from a shell's `beforeinput`, a key the runtime resolved itself,
 * or a paste. `data` is the text an insertion carries, else null.
 * preventDefault() cancels the edit — the way a numeric field rejects
 * letters.
 */
export class UiBeforeInputEvent extends UiInputEvent {
  constructor(
    readonly inputType: string,
    readonly data: string | null
  ) {
    super(UiEventType.BeforeInput);
  }
}

/**
 * An editable node's text changed: the new value and the selection
 * after the change. Bubbles, so a form can watch all its fields.
 */
export class UiTextChangeEvent extends UiInputEvent {
  constructor(
    readonly value: string,
    readonly selectionStart: number,
    readonly selectionEnd: number
  ) {
    super(UiEventType.Input);
  }
}

/**
 * Wheel scroll input event.
 *
 * `deltaX`/`deltaY` are the scroll deltas in canvas pixels produced
 * by the platform adapter (browser wheel events are normalized
 * there). preventDefault() on a Wheel cancels the automatic scroll
 * consumption of the nearest scroll container.
 */
/**
 * The unit a wheel's deltas are in, matching the DOM's `deltaMode`.
 *
 * The numbers are the DOM's own, so a shell can forward
 * `event.deltaMode` unchanged and nothing has to translate.
 */
export enum UiWheelDeltaMode {
  Pixel = 0,
  Line = 1,
  Page = 2
}

/**
 * Reads the legacy `wheelDeltaY` off a DOM wheel event.
 *
 * Not on `WheelEvent` in TypeScript's lib, because it was never
 * standardised — but every engine still reports it, and it is the only
 * field that distinguishes a detented wheel (multiples of 120) from a
 * precision device. Read defensively rather than cast, so an engine
 * that has genuinely dropped it reports nothing instead of `NaN`.
 */
export function wheelDeltaYOf(event: object): number | undefined {
  const value = (event as { wheelDeltaY?: unknown }).wheelDeltaY;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class UiWheelEvent extends UiInputEvent {
  private consumedFlag = false;

  constructor(
    type: UiEventType.Wheel,
    readonly x: number,
    readonly y: number,
    readonly deltaX: number,
    readonly deltaY: number,
    readonly modifiers: UiKeyModifiers = noKeyModifiers(),
    /**
     * What the deltas are measured in.
     *
     * Mirrors the DOM, deliberately: `deltaX`/`deltaY` are a distance
     * in pixels only when this is `Pixel`, and a handler that reads
     * them without checking is the bug this field was added to fix.
     * Chrome reports pixels and Firefox reports lines, so a delta
     * taken at face value moves the view three pixels per notch there.
     * The wheel controller converts before it scrolls anything; an
     * application handler that consumes the delta itself has to do the
     * same.
     */
    readonly deltaMode: UiWheelDeltaMode = UiWheelDeltaMode.Pixel,
    /**
     * The legacy `wheelDeltaY`, forwarded for one reason: a detented
     * wheel reports it in multiples of 120 and a precision device does
     * not, and there is no other evidence in a `WheelEvent` that tells
     * the two apart. See `isNotchedWheel`.
     */
    readonly wheelDeltaY?: number
  ) {
    super(type);
  }

  /**
   * Records that the runtime moved something with this delta.
   *
   * Called by the wheel controller, not by application code — an app
   * handler that takes a wheel for itself says so with
   * `preventDefault()`, and a shell treats the two the same.
   */
  markConsumed(): void {
    this.consumedFlag = true;
  }

  /**
   * Whether the runtime actually scrolled something.
   *
   * This is the answer a shell needs and the DOM cannot work out for
   * itself: whether to call `preventDefault()` on the browser's wheel
   * event. Preventing unconditionally makes the canvas a scroll trap
   * on a page it is embedded in — the wheel dies over a canvas with
   * nothing to scroll — and never preventing lets a scroll the
   * runtime already consumed move the page as well. Neither is
   * knowable without asking whether a container took the delta, which
   * is what this reports.
   *
   * False at the end of a chain that found no room, unless something
   * along it asked to keep the overscroll with
   * `overscrollBehavior="contain"`.
   */
  get consumed(): boolean {
    return this.consumedFlag;
  }

  override reset(): void {
    super.reset();
    this.consumedFlag = false;
  }
}
