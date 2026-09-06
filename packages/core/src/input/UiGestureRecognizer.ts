import type { UiNode } from '../graph/UiNode';
import {
  noKeyModifiers,
  UiEventType,
  UiGestureEvent,
  UiPointerEvent,
  type UiKeyModifiers,
  type UiPointerDevice,
  type UiPointerKind
} from './UiInputEvent';
import type { UiInputDispatcher } from './UiInputDispatcher';
import { UiPinchRecognizer, type PinchRecognizerOptions } from './UiPinchRecognizer';

export interface GestureRecognizerOptions {
  /**
   * Movement (px) beyond which a press cancels a pending LongPress and
   * is claimed as a Pan.
   */
  slop?: number;
  /**
   * The same threshold for a finger.
   *
   * Larger, because a finger is not a cursor: it rolls as it presses
   * and the reported point wanders several pixels without the person
   * intending to move at all. At the mouse threshold a deliberate
   * long press on a touchscreen is claimed as a pan before the hold
   * time is up, so the gesture becomes unreachable.
   */
  touchSlop?: number;
  /** Hold time (ms) before a still press becomes a LongPress. */
  longPressDelay?: number;
  /**
   * How much of the recent movement the release speed is measured over
   * (ms).
   *
   * The whole gesture is the wrong window, for the reason
   * `UiTouchScroller` gives: a long slow drag that ends in a flick
   * averages out to nothing across the whole of it, and the flick is
   * the part the person meant.
   */
  velocityWindow?: number;
  /**
   * The clock the velocity is measured against, for specs that drive a
   * gesture without waiting. Any monotonic millisecond source will do,
   * since the samples are only ever subtracted from each other.
   */
  now?: () => number;
  /**
   * Whether a long press from a finger also asks for a context menu.
   * Default true; see `UiGestureRecognizer` for what suppresses it.
   */
  contextMenuOnLongPress?: boolean;
  /** Thresholds for the two-contact half. */
  pinch?: PinchRecognizerOptions;
}

/**
 * Pointer-feed interface consumed by the pointer controller.
 *
 * The controller is the single owner of the press sequence and feeds
 * each raw pointer event plus the captured target here; the
 * recognizer turns them into gesture events on the same dispatcher.
 *
 * The `contact*` half is separate and deliberately not an event: it is
 * fed for **every** contact the controller sees, including the ones it
 * refuses to give the press to, and building a `UiPointerEvent` for a
 * contact that is about to be ignored would allocate on a path that
 * runs at the pointer's sample rate.
 */
export interface GestureInput {
  pointerDown(event: UiPointerEvent, target: UiNode): void;
  pointerMove(event: UiPointerEvent, target: UiNode): void;
  pointerUp(event: UiPointerEvent, target: UiNode): void;
  pointerCancel(): void;
  /** Whether the current press produced a gesture that should suppress Click. */
  claimed(): boolean;
  /** A contact landed, whether or not it was given the press. */
  contactDown?(pointer: UiPointerDevice, x: number, y: number, target: UiNode | null, modifiers: UiKeyModifiers): void;
  /** A contact moved, whether or not it holds the press. */
  contactMove?(pointer: UiPointerDevice, x: number, y: number): void;
  /** A contact left. */
  contactUp?(pointer: UiPointerDevice): void;
}

type GestureState = 'idle' | 'pressing' | 'longPressed' | 'panning' | 'dragging';

/** How many positions the velocity window is measured over. */
const VELOCITY_SAMPLES = 8;

/** One position of the contact, written into a fixed slot. */
interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * Synthesizes discrete gestures from a press sequence.
 *
 * Each press resolves to exactly one of:
 *
 *   Pan        — the pointer moves beyond `slop` before the hold time
 *                elapses: PanStart/PanMove/PanEnd. For scrolling and
 *                panning containers.
 *   LongPress  — the pointer holds still within `slop` for
 *                `longPressDelay`: fires once. A subsequent move
 *                claims the press as a Drag.
 *   Drag       — LongPress, then movement: DragStart/DragMove/DragEnd.
 *                The classic long-press-to-pick-up drag.
 *
 * A press that is released before any of these (a tap) produces no
 * gesture events; Click synthesis lives in the pointer controller.
 *
 * A pointermove whose default was prevented (a consumer is handling
 * the move itself) never claims or advances a Pan/Drag. A cancelled
 * press aborts everything without gesture end events.
 *
 * ## The end of a gesture carries its speed
 *
 * `PanEnd` and `DragEnd` are `UiGestureEvent`s whose `velocityX` and
 * `velocityY` are the speed the contact left at, in pixels per second,
 * which is the unit `UiSpringOptions.velocity` takes. Without it every
 * spring handed a dropped card starts from rest, and a card thrown
 * across the screen stops dead the instant the finger leaves it.
 * Measured over the last `velocityWindow` milliseconds rather than the
 * whole gesture, and from a fixed ring of samples so a move allocates
 * nothing.
 *
 * ## A long press asks for a menu
 *
 * A finger has no second button, so a held finger is how a touchscreen
 * asks for the commands that apply to something. After the LongPress
 * has been dispatched, a `ContextMenu` event follows at the same point
 * unless the LongPress was `preventDefault()`ed, which is how a node
 * that means to be picked up rather than interrogated says so. A mouse
 * long press raises nothing: it has a secondary button, and the
 * pointer controller dispatches the event from that instead.
 *
 * ## Two contacts
 *
 * Every contact the controller sees is fed to a `UiPinchRecognizer`,
 * including the ones that are refused the press. When a second one
 * lands, whatever gesture the first was performing is **ended where it
 * stands** and the press stops synthesizing a Click, because the
 * person is no longer doing the thing they started. See
 * `UiPinchRecognizer` for how that answers what `decisions/0041`
 * deferred.
 */
export class UiGestureRecognizer implements GestureInput {
  private readonly slop: number;
  private readonly touchSlop: number;
  private readonly longPressDelay: number;
  private readonly velocityWindow: number;
  private readonly now: () => number;
  private readonly contextMenuOnLongPress: boolean;
  private readonly pinch: UiPinchRecognizer;

  private state: GestureState = 'idle';
  private startX = 0;
  private startY = 0;
  private startKind: UiPointerKind = 'mouse';
  private claimedPress = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** The press's recent positions, as a ring so a move allocates nothing. */
  private readonly samples: Sample[] = Array.from({ length: VELOCITY_SAMPLES }, () => ({ t: 0, x: 0, y: 0 }));
  private sampleCount = 0;
  private sampleNext = 0;

  /** What the in-flight press is against, kept so a pinch can end it. */
  private pressTarget: UiNode | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastButtons = 0;
  private lastModifiers: UiKeyModifiers = noKeyModifiers();
  private lastPointer: UiPointerDevice | null = null;

  constructor(
    private readonly dispatcher: UiInputDispatcher,
    options: GestureRecognizerOptions = {}
  ) {
    this.slop = options.slop ?? 8;
    this.touchSlop = options.touchSlop ?? 12;
    this.longPressDelay = options.longPressDelay ?? 500;
    this.velocityWindow = options.velocityWindow ?? 100;
    this.now = options.now ?? defaultClock;
    this.contextMenuOnLongPress = options.contextMenuOnLongPress ?? true;
    this.pinch = new UiPinchRecognizer(dispatcher, options.pinch);
  }

  pointerDown(event: UiPointerEvent, target: UiNode): void {
    if (this.state !== 'idle') {
      return;
    }
    this.state = 'pressing';
    this.claimedPress = false;
    this.startX = event.x;
    this.startY = event.y;
    // Read once at the press: the threshold must not change under a
    // gesture already being measured against it.
    this.startKind = event.pointer.kind;
    this.pressTarget = target;
    this.remember(event);
    this.resetSamples();
    this.armLongPress(target, event);
  }

  pointerMove(event: UiPointerEvent, target: UiNode): void {
    if (event.defaultPrevented) {
      return;
    }
    this.remember(event);
    if (this.state === 'pressing') {
      if (Math.hypot(event.x - this.startX, event.y - this.startY) > this.pressSlop()) {
        this.clearTimer();
        this.state = 'panning';
        this.claimedPress = true;
        this.dispatch(UiEventType.PanStart, target, this.startX, this.startY, event);
        this.dispatch(UiEventType.PanMove, target, event.x, event.y, event);
      }
      return;
    }
    if (this.state === 'panning') {
      this.dispatch(UiEventType.PanMove, target, event.x, event.y, event);
      return;
    }
    if (this.state === 'longPressed') {
      this.state = 'dragging';
      this.claimedPress = true;
      this.dispatch(UiEventType.DragStart, target, this.startX, this.startY, event);
      this.dispatch(UiEventType.DragMove, target, event.x, event.y, event);
      return;
    }
    if (this.state === 'dragging') {
      this.dispatch(UiEventType.DragMove, target, event.x, event.y, event);
    }
  }

  pointerUp(event: UiPointerEvent, target: UiNode): void {
    this.remember(event);
    if (this.state === 'panning') {
      this.dispatchEnd(UiEventType.PanEnd, target, event.x, event.y, event);
    }
    if (this.state === 'dragging') {
      this.dispatchEnd(UiEventType.DragEnd, target, event.x, event.y, event);
    }
    this.clearTimer();
    this.state = 'idle';
    this.pressTarget = null;
  }

  pointerCancel(): void {
    this.clearTimer();
    this.state = 'idle';
    this.pressTarget = null;
    this.pinch.cancel();
  }

  claimed(): boolean {
    return this.claimedPress;
  }

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------

  contactDown(pointer: UiPointerDevice, x: number, y: number, target: UiNode | null, modifiers: UiKeyModifiers): void {
    const second = this.pinch.contactDown(pointer, x, y, target ?? this.pressTarget, modifiers);
    if (second) {
      this.endForPinch();
    }
  }

  contactMove(pointer: UiPointerDevice, x: number, y: number): void {
    this.pinch.contactMove(pointer, x, y);
  }

  contactUp(pointer: UiPointerDevice): void {
    this.pinch.contactUp(pointer);
  }

  /**
   * Puts down whatever the first contact was carrying.
   *
   * The pan or drag gets a real end event at the point it reached, so
   * a `draggable` releases the card rather than holding it against a
   * finger whose gesture has become something else, and the press is
   * marked claimed so no Click follows the release of either contact.
   */
  private endForPinch(): void {
    if (this.state === 'panning' && this.pressTarget !== null) {
      this.dispatchEnd(UiEventType.PanEnd, this.pressTarget, this.lastX, this.lastY, null);
    }
    if (this.state === 'dragging' && this.pressTarget !== null) {
      this.dispatchEnd(UiEventType.DragEnd, this.pressTarget, this.lastX, this.lastY, null);
    }
    this.clearTimer();
    this.state = 'idle';
    this.claimedPress = true;
  }

  // -------------------------------------------------------------------------
  // LongPress timer
  // -------------------------------------------------------------------------

  private armLongPress(target: UiNode, down: UiPointerEvent): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state !== 'pressing') {
        return;
      }
      this.state = 'longPressed';
      this.claimedPress = true;
      const held = this.dispatch(UiEventType.LongPress, target, this.startX, this.startY, down);
      // A finger has no second button. A held finger is how a
      // touchscreen asks for the commands that apply to something, so
      // the menu request follows the press it was made with — unless a
      // listener said the press was for picking the node up.
      if (this.contextMenuOnLongPress && down.pointer.kind !== 'mouse' && !held.defaultPrevented) {
        this.dispatcher.dispatch(
          new UiPointerEvent(UiEventType.ContextMenu, this.startX, this.startY, down.buttons, down.modifiers, down.pointer),
          target
        );
      }
    }, this.longPressDelay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** The movement threshold for the device that started the press. */
  private pressSlop(): number {
    return this.startKind === 'touch' ? this.touchSlop : this.slop;
  }

  private dispatch(type: UiEventType, target: UiNode, x: number, y: number, source: UiPointerEvent): UiGestureEvent {
    // The device is carried onto the synthesized event: a listener
    // that has to size a drag handle for a finger learns it from the
    // DragStart, not from the raw press it never saw.
    const event = new UiGestureEvent(type, x, y, source.buttons, source.modifiers, source.pointer);
    this.dispatcher.dispatch(event, target);
    return event;
  }

  /**
   * The last event of a gesture, carrying the speed it ended at.
   *
   * `source` is null when the gesture is being ended by something other
   * than a release — a second contact landing — and the buttons,
   * modifiers and device of the last event seen are used instead.
   */
  private dispatchEnd(
    type: UiEventType,
    target: UiNode,
    x: number,
    y: number,
    source: UiPointerEvent | null
  ): void {
    const buttons = source?.buttons ?? this.lastButtons;
    const modifiers = source?.modifiers ?? this.lastModifiers;
    const pointer = source?.pointer ?? this.lastPointer ?? undefined;
    const event = new UiGestureEvent(
      type,
      x,
      y,
      buttons,
      modifiers,
      pointer,
      this.velocityAlong('x'),
      this.velocityAlong('y')
    );
    this.dispatcher.dispatch(event, target);
  }

  // -------------------------------------------------------------------------
  // Velocity
  // -------------------------------------------------------------------------

  private resetSamples(): void {
    this.sampleCount = 0;
    this.sampleNext = 0;
  }

  /** Records where the contact is, into the ring, without allocating. */
  private remember(event: UiPointerEvent): void {
    const slot = this.samples[this.sampleNext];
    slot.t = this.now();
    slot.x = event.x;
    slot.y = event.y;
    this.sampleNext = (this.sampleNext + 1) % VELOCITY_SAMPLES;
    if (this.sampleCount < VELOCITY_SAMPLES) {
      this.sampleCount += 1;
    }
    this.lastX = event.x;
    this.lastY = event.y;
    this.lastButtons = event.buttons;
    this.lastModifiers = event.modifiers;
    this.lastPointer = event.pointer;
  }

  /**
   * Pixels per second along one axis, over the recent window.
   *
   * The oldest sample still inside the window is the baseline, so a
   * gesture that dawdled and then flicked reports the flick. Fewer than
   * two samples, or two at the same instant, is no evidence of speed
   * and reports none rather than dividing by zero.
   */
  private velocityAlong(axis: 'x' | 'y'): number {
    if (this.sampleCount < 2) {
      return 0;
    }
    const newestIndex = (this.sampleNext - 1 + VELOCITY_SAMPLES) % VELOCITY_SAMPLES;
    const newest = this.samples[newestIndex];
    let oldest = newest;
    for (let back = 1; back < this.sampleCount; back += 1) {
      const candidate = this.samples[(newestIndex - back + VELOCITY_SAMPLES) % VELOCITY_SAMPLES];
      if (newest.t - candidate.t > this.velocityWindow) {
        break;
      }
      oldest = candidate;
    }
    const elapsed = newest.t - oldest.t;
    if (elapsed <= 0) {
      return 0;
    }
    const travelled = axis === 'x' ? newest.x - oldest.x : newest.y - oldest.y;
    return (travelled / elapsed) * 1000;
  }
}

function defaultClock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
