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
  PanEnd = 'panend'
}

/**
 * Keyboard modifier state attached to events that carry one.
 *
 * Named `UiKeyModifiers`, not `UiModifiers`: a modifier in
 * `MODIFIERS_ROADMAP.md` is a behaviour attached to an element, and one
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
 * bitmask and the keyboard modifiers present when the event was
 * produced. Used for every raw Pointer* event and for the Click
 * gesture, so listeners never need a browser-specific event shape.
 */
export class UiPointerEvent extends UiInputEvent {
  constructor(
    type: UiEventType,
    readonly x: number,
    readonly y: number,
    readonly buttons: number = 0,
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
}
