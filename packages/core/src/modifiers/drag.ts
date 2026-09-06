import type { Subject } from 'rxjs';

import { UiEventType, type UiGestureEvent, type UiPointerEvent } from '../input/UiInputEvent';
import { defineModifier, type UiModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/** How far the node has been moved from where the drag picked it up. */
export interface DragOffset {
  readonly x: number;
  readonly y: number;
  /**
   * How fast it was travelling when it was let go, in pixels per
   * second, along each axis.
   *
   * Zero everywhere but the offset handed to `onEnd`, because there is
   * no honest speed to report for a position half way through a drag
   * that the next move will replace. The unit is the one
   * `UiSpringOptions.velocity` takes, which is the whole reason it is
   * here: a spring given no velocity starts from rest, so a card
   * thrown across the screen used to stop dead the instant the finger
   * left it, and there was no way for the application to do better
   * because the drag never told it how fast the card was going.
   */
  readonly velocityX?: number;
  readonly velocityY?: number;
}

export interface DraggableOptions {
  /** Which axes the node may move on. Default `'both'`. */
  readonly axis?: 'x' | 'y' | 'both';
  /**
   * Whether the drag begins on a press and a move, or only after a
   * long press. Default `'press'`.
   *
   * The roadmap wrote this modifier as the `DragStart` gesture, and
   * `DragStart` is the long-press one: the recognizer resolves a press
   * to a Pan when it moves before the hold time and to a Drag only
   * after a LongPress. C5 found the same thing from the other side,
   * when a split pane's divider listened for `DragMove` and did not
   * move. A card the pointer picks up immediately is a Pan, so that is
   * the default here, and the long-press variety is an option rather
   * than the only behaviour.
   */
  readonly start?: 'press' | 'longPress';
  /** Every position while the drag runs, as an offset from the start. */
  readonly offset?: Subject<DragOffset>;
  readonly onStart?: () => void;
  readonly onEnd?: (offset: DragOffset) => void;
  /**
   * Properties to write while the drag runs, in the shape
   * `interactive` uses for hover and press: `{ opacity: 0.8, zIndex: 10 }`
   * lifts the node off the page and puts it over its neighbours.
   */
  readonly dragging?: Readonly<Record<string, unknown>>;
  /**
   * Whether the node stays where it was dropped. Default `true`.
   *
   * False is the right choice when the application moves the thing
   * itself: a list that reorders on drop wants the item back in the
   * flow at its new index, not held one row above it by a translation
   * nobody owns any more.
   */
  readonly keepOffset?: boolean;
}

/**
 * Moves a node with the pointer.
 *
 * It writes the movement as a translation on `transform`, through the
 * override cascade, so nothing about the node's layout changes: the
 * box stays where it was, its neighbours do not shuffle, and dropping
 * a node whose offset is released puts back exactly the transform the
 * element declared, including no transform at all. The declared
 * transform is read once at attach and composed with, so a node that
 * is already rotated goes on rotating while it is dragged.
 *
 * The gesture events are stopped from propagating while a drag is
 * running. `UiTouchScroller` listens for pans at the root, so without
 * that a card dragged inside a scroll view would move and scroll its
 * container at the same time; `SplitPane` stops them for the same
 * reason.
 *
 * Nothing here changes the cursor. That is a message to the shell
 * (`decisions/0016-cursor.md`), and a node's `cursor` property already
 * sends it, so an application says `cursor: 'grab'` on the element and
 * this modifier stays inside the render thread.
 */
const kind = defineModifier<DraggableOptions>({
  name: 'draggable',
  attach(host, options) {
    controllers.set(host, new Draggable(host, options).attach());
  },
  update(host, options) {
    // In place rather than a detach and a re-attach, so options that
    // change while a card is in the air do not drop it.
    controllers.get(host)?.setOptions(options);
  }
});

const controllers = new WeakMap<UiModifierHost, Draggable>();

/**
 * Moves a node with the pointer.
 *
 * Hoist the options object: arguments are compared by identity, so a
 * fresh literal every render is a fresh set of arguments.
 */
export function draggable(options: DraggableOptions = EMPTY_OPTIONS): UiModifier<DraggableOptions> {
  return kind(options);
}

const EMPTY_OPTIONS: DraggableOptions = Object.freeze({});

class Draggable {
  /** Where the pointer was when the gesture started. */
  private originX = 0;
  private originY = 0;
  /** The offset in force, which is what a later drag adds to. */
  private offsetX = 0;
  private offsetY = 0;
  /** The offset this gesture started from, so a second drag continues. */
  private startX = 0;
  private startY = 0;
  private dragging = false;

  /** What the element declared, which the translation is added to. */
  private basePivotX = 0;
  private basePivotY = 0;
  private baseScaleX = 1;
  private baseScaleY = 1;
  private baseRotation = 0;

  constructor(
    private readonly host: UiModifierHost,
    private options: DraggableOptions
  ) {}

  attach(): this {
    const declared = this.host.get<Record<string, unknown> | null | undefined>('transform');
    if (declared !== undefined && declared !== null) {
      this.basePivotX = numberOr(declared.x, 0);
      this.basePivotY = numberOr(declared.y, 0);
      this.baseScaleX = numberOr(declared.scaleX, 1);
      this.baseScaleY = numberOr(declared.scaleY, 1);
      this.baseRotation = numberOr(declared.rotation, 0);
    }
    const longPress = this.options.start === 'longPress';
    // Every gesture event is a pointer event; the listener signature is
    // the base class because a listener may be registered for any type.
    this.host.on(longPress ? UiEventType.DragStart : UiEventType.PanStart, event =>
      this.begin(event as UiPointerEvent)
    );
    this.host.on(longPress ? UiEventType.DragMove : UiEventType.PanMove, event => this.move(event as UiPointerEvent));
    this.host.on(longPress ? UiEventType.DragEnd : UiEventType.PanEnd, event => this.end(event as UiPointerEvent));
    return this;
  }

  setOptions(options: DraggableOptions): void {
    // `start` is read when the listeners are registered, so changing it
    // mid-life would leave the modifier listening for the other
    // gesture. The kind has no `update` path for that; say so rather
    // than half-applying it.
    if ((options.start ?? 'press') !== (this.options.start ?? 'press')) {
      console.warn(
        `draggable on node '${this.host.node.id}' changed 'start' after it attached; the gesture it listens for is fixed at attach.`
      );
    }
    this.options = options;
  }

  private begin(event: UiPointerEvent): void {
    event.stopPropagation();
    this.dragging = true;
    this.originX = event.x;
    this.originY = event.y;
    this.startX = this.offsetX;
    this.startY = this.offsetY;
    for (const [property, value] of Object.entries(this.options.dragging ?? {})) {
      this.host.set(property, value);
    }
    this.options.onStart?.();
  }

  private move(event: UiPointerEvent): void {
    if (!this.dragging) {
      return;
    }
    event.stopPropagation();
    const axis = this.options.axis ?? 'both';
    const x = axis === 'y' ? this.startX : this.startX + (event.x - this.originX);
    const y = axis === 'x' ? this.startY : this.startY + (event.y - this.originY);
    this.setOffset(x, y);
    this.options.offset?.next({ x, y });
  }

  private end(event: UiPointerEvent): void {
    if (!this.dragging) {
      return;
    }
    event.stopPropagation();
    this.dragging = false;
    for (const property of Object.keys(this.options.dragging ?? {})) {
      this.host.clear(property);
    }
    const dropped: DragOffset = {
      x: this.offsetX,
      y: this.offsetY,
      velocityX: velocityOf(event, 'x'),
      velocityY: velocityOf(event, 'y')
    };
    if (this.options.keepOffset === false) {
      this.setOffset(0, 0);
      this.options.offset?.next({ x: 0, y: 0 });
    }
    this.options.onEnd?.(dropped);
  }

  /**
   * Writes the offset as the transform's translation, or takes it away.
   *
   * At rest the override is dropped rather than written as an identity
   * translation, so a node that was dragged and put back is
   * indistinguishable from one that never moved: no transform in its
   * paint state, and no matrix to multiply per frame.
   */
  private setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
    if (x === 0 && y === 0) {
      this.host.clear('transform');
      return;
    }
    this.host.set('transform', {
      x: this.basePivotX,
      y: this.basePivotY,
      translateX: x,
      translateY: y,
      scaleX: this.baseScaleX,
      scaleY: this.baseScaleY,
      rotation: this.baseRotation
    });
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * The release speed the recognizer measured, or none.
 *
 * `PanEnd` and `DragEnd` are `UiGestureEvent`s and carry it. The check
 * is a property test rather than an `instanceof` because a spec that
 * dispatches a plain `UiPointerEvent` at the modifier is a legitimate
 * way to drive it, and reporting no speed is the right answer there.
 */
function velocityOf(event: UiPointerEvent, axis: 'x' | 'y'): number {
  const value = (event as Partial<UiGestureEvent>)[axis === 'x' ? 'velocityX' : 'velocityY'];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
