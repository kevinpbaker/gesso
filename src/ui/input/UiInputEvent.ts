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
  Click = 'click',
  LongPress = 'longpress',
  DragStart = 'dragstart',
  DragMove = 'dragmove',
  DragEnd = 'dragend',
  PanStart = 'panstart',
  PanMove = 'panmove',
  PanEnd = 'panend'
}

/** Keyboard modifier state attached to events that carry one. */
export interface UiModifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export function noModifiers(): UiModifiers {
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
    readonly modifiers: UiModifiers = noModifiers()
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
    readonly modifiers: UiModifiers = noModifiers()
  ) {
    super(type);
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
export class UiWheelEvent extends UiInputEvent {
  constructor(
    type: UiEventType.Wheel,
    readonly x: number,
    readonly y: number,
    readonly deltaX: number,
    readonly deltaY: number,
    readonly modifiers: UiModifiers = noModifiers()
  ) {
    super(type);
  }
}
