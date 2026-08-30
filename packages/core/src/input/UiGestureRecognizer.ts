import type { UiNode } from '../graph/UiNode';
import { UiEventType, UiPointerEvent } from './UiInputEvent';
import type { UiInputDispatcher } from './UiInputDispatcher';

export interface GestureRecognizerOptions {
  /**
   * Movement (px) beyond which a press cancels a pending LongPress and
   * is claimed as a Pan.
   */
  slop?: number;
  /** Hold time (ms) before a still press becomes a LongPress. */
  longPressDelay?: number;
}

/**
 * Pointer-feed interface consumed by the pointer controller.
 *
 * The controller is the single owner of the press sequence and feeds
 * each raw pointer event plus the captured target here; the
 * recognizer turns them into gesture events on the same dispatcher.
 */
export interface GestureInput {
  pointerDown(event: UiPointerEvent, target: UiNode): void;
  pointerMove(event: UiPointerEvent, target: UiNode): void;
  pointerUp(event: UiPointerEvent, target: UiNode): void;
  pointerCancel(): void;
  /** Whether the current press produced a gesture that should suppress Click. */
  claimed(): boolean;
}

type GestureState = 'idle' | 'pressing' | 'longPressed' | 'panning' | 'dragging';

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
 */
export class UiGestureRecognizer implements GestureInput {
  private readonly slop: number;
  private readonly longPressDelay: number;

  private state: GestureState = 'idle';
  private startX = 0;
  private startY = 0;
  private claimedPress = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly dispatcher: UiInputDispatcher,
    options: GestureRecognizerOptions = {}
  ) {
    this.slop = options.slop ?? 8;
    this.longPressDelay = options.longPressDelay ?? 500;
  }

  pointerDown(event: UiPointerEvent, target: UiNode): void {
    if (this.state !== 'idle') {
      return;
    }
    this.state = 'pressing';
    this.claimedPress = false;
    this.startX = event.x;
    this.startY = event.y;
    this.armLongPress(target, event);
  }

  pointerMove(event: UiPointerEvent, target: UiNode): void {
    if (event.defaultPrevented) {
      return;
    }
    if (this.state === 'pressing') {
      if (Math.hypot(event.x - this.startX, event.y - this.startY) > this.slop) {
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
    if (this.state === 'panning') {
      this.dispatch(UiEventType.PanEnd, target, event.x, event.y, event);
    }
    if (this.state === 'dragging') {
      this.dispatch(UiEventType.DragEnd, target, event.x, event.y, event);
    }
    this.clearTimer();
    this.state = 'idle';
  }

  pointerCancel(): void {
    this.clearTimer();
    this.state = 'idle';
  }

  claimed(): boolean {
    return this.claimedPress;
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
      this.dispatch(UiEventType.LongPress, target, this.startX, this.startY, down);
    }, this.longPressDelay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private dispatch(type: UiEventType, target: UiNode, x: number, y: number, source: UiPointerEvent): void {
    const event = new UiPointerEvent(type, x, y, source.buttons, source.modifiers);
    this.dispatcher.dispatch(event, target);
  }
}
