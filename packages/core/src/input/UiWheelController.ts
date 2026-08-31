import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { noKeyModifiers, UiEventType, UiWheelDeltaMode, UiWheelEvent, type UiKeyModifiers } from './UiInputEvent';
import type { HitTester } from './UiHitTester';
import type { ScrollbarThumb } from '../layout/Scrollbars';
import type { UiInputDispatcher } from './UiInputDispatcher';

/**
 * Scroll projection of a scroll container queried by the wheel
 * controller so it can decide how a wheel delta maps onto the
 * container's scroll axis.
 */
export interface ScrollContainerState {
  scrollX: number;
  scrollY: number;
  maxScrollX: number;
  maxScrollY: number;
  /** True when the container scrolls horizontally (row layout). */
  horizontal: boolean;
  /**
   * The visible extent, which is what a page-mode wheel delta means.
   *
   * Optional because a wheel that reports its deltas in pixels — every
   * wheel on Chrome, and every trackpad everywhere — never needs it,
   * and a sink written before page mode existed should not have to
   * grow a field to keep compiling. A page delta with no extent falls
   * back to a screenful of lines.
   */
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * A line, in pixels, for a wheel that measures its deltas in lines.
 *
 * There is no API that says what a line is, so this is a choice: one
 * line of default body text, near enough. Firefox reports three of
 * them per notch, which lands close to the distance a notch moves a
 * document there.
 */
const LINE_HEIGHT_PX = 16;

/**
 * Bridges wheel scroll consumption to the layout system. The app
 * layer provides an implementation backed by LayoutEngine (or the
 * scheduler's incremental scroll-only pass); tests use a harness
 * sink. The sink owns clamping and re-layout after a scroll.
 */
export interface ScrollSink {
  containerState(node: UiNode): ScrollContainerState | undefined;
  /**
   * Moves the container, either at once or over time.
   *
   * `behavior` is a hint and defaults to `'instant'`, which is what
   * every caller but the wheel wants and what a sink that does not
   * animate should do with `'smooth'` as well. Animating belongs to
   * the sink rather than to a caller stepping this in a loop: a
   * playground harness sink echoes every write to another thread, and
   * a scrollbar thumb drag reads the offset back on each pointer move,
   * so a caller-driven animation would drive both of those too.
   */
  scrollBy(node: UiNode, dx: number, dy: number, behavior?: UiScrollBehavior): void;
  /** Show the container's scrollbars, as hovering near them or dragging one does. */
  revealScrollbars?(node: UiNode): void;
  /** Geometry of one scrollbar, for dragging its thumb. */
  scrollbar?(node: UiNode, axis: 'x' | 'y'): ScrollbarThumb | null;
}

/** Whether a scroll lands at once or is animated to its destination. */
export type UiScrollBehavior = 'instant' | 'smooth';

/**
 * Whether this wheel event came from something with detents.
 *
 * Only a notched wheel is worth animating. It delivers one large jump
 * per detent and nothing in between, which is the whole of the problem
 * smooth scrolling solves. A trackpad already delivers a fine-grained
 * inertial stream from the operating system, and animating that would
 * integrate an inertia curve on top of one — a rubbery lag laid over
 * scrolling that was already smooth, which is worse than the jumps.
 *
 * There is no honest way to *ask* what a device is, so this reads the
 * evidence a `WheelEvent` carries and **only smooths on a positive
 * answer**:
 *
 *   - A delta measured in lines or pages is never a precision device.
 *   - `wheelDeltaY` is the legacy field, and a detented wheel reports
 *     it in multiples of 120. A precision device does not.
 *
 * Anything else is treated as precise, so the failure direction is the
 * behaviour that shipped before this existed.
 */
export function isNotchedWheel(deltaMode: UiWheelDeltaMode, wheelDeltaY: number | undefined): boolean {
  if (deltaMode !== UiWheelDeltaMode.Pixel) {
    return true;
  }
  if (wheelDeltaY === undefined) {
    return false;
  }
  const magnitude = Math.abs(wheelDeltaY);
  // Half a detent is not one. This is what keeps a trackpad's small
  // deltas out, since the test below would otherwise read anything
  // near zero as a whole number of detents.
  if (magnitude < NOTCH_WHEEL_DELTA / 2) {
    return false;
  }
  const remainder = magnitude % NOTCH_WHEEL_DELTA;
  return remainder <= NOTCH_TOLERANCE || NOTCH_WHEEL_DELTA - remainder <= NOTCH_TOLERANCE;
}

/** What a detent is worth in the legacy `wheelDelta` field. */
const NOTCH_WHEEL_DELTA = 120;
/**
 * How far off a whole detent still counts as one.
 *
 * An exact multiple is too much to ask, and real hardware said so: the
 * same mouse reports `wheelDeltaY` of exactly -120 on one monitor and
 * **-119** on another, with a `deltaY` of 119.99999642372141 rather
 * than a round number. Chrome scales a wheel delta per display, and
 * the scaled value is truncated on its way into the legacy field. An
 * equality test therefore classified every notch on that display as a
 * precision device and scrolling never smoothed at all.
 *
 * Five percent of a detent, which is far tighter than the gap to
 * anything a trackpad sends and loose enough for that scaling.
 */
const NOTCH_TOLERANCE = 6;

/**
 * Routes wheel input. Dispatches a bubbling Wheel event to the node
 * under the pointer, then, unless the event was defaultPrevented,
 * scrolls the nearest scroll container by the delta. preventDefault()
 * on Wheel therefore opts out of automatic scroll consumption.
 */
export class UiWheelController {
  constructor(
    private readonly hitTester: HitTester,
    private readonly dispatcher: UiInputDispatcher,
    private readonly scrollSink: ScrollSink
  ) {}

  wheel(
    x: number,
    y: number,
    deltaX: number,
    deltaY: number,
    modifiers: UiKeyModifiers = noKeyModifiers(),
    deltaMode: UiWheelDeltaMode = UiWheelDeltaMode.Pixel,
    wheelDeltaY?: number
  ): UiWheelEvent {
    const target = this.hitTester.hitTest(x, y)?.node ?? null;
    const event = new UiWheelEvent(UiEventType.Wheel, x, y, deltaX, deltaY, modifiers, deltaMode, wheelDeltaY);
    if (target !== null) {
      this.dispatcher.dispatch(event, target);
    }
    if (!event.defaultPrevented && target !== null) {
      const container = this.nearestScrollable(target);
      if (container !== null) {
        const state = this.scrollSink.containerState(container);
        if (state !== undefined) {
          this.applyDelta(container, state, deltaX, deltaY, deltaMode, behaviorFor(container, deltaMode, wheelDeltaY));
        }
      }
    }
    return event;
  }

  private nearestScrollable(node: UiNode): UiNode | null {
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      if (isScrollContainer(current)) {
        return current;
      }
    }
    return null;
  }

  private applyDelta(
    container: UiNode,
    state: ScrollContainerState,
    deltaX: number,
    deltaY: number,
    deltaMode: UiWheelDeltaMode,
    behavior: UiScrollBehavior
  ): void {
    if (state.horizontal) {
      this.scrollSink.scrollBy(container, this.toPixels(deltaX, deltaMode, state.viewportWidth), 0, behavior);
    } else {
      this.scrollSink.scrollBy(container, 0, this.toPixels(deltaY, deltaMode, state.viewportHeight), behavior);
    }
  }

  /**
   * A wheel delta in whatever unit it arrived in, as pixels.
   *
   * A `WheelEvent`'s delta is only a distance when `deltaMode` is
   * `Pixel`. Chrome reports pixels; Firefox reports **lines**, three
   * per notch, so a delta taken at face value there moves the view
   * three pixels — a scroll that looks broken rather than fast or
   * slow. Page mode exists too, and means a screenful.
   */
  private toPixels(delta: number, mode: UiWheelDeltaMode, extent: number | undefined): number {
    if (mode === UiWheelDeltaMode.Line) {
      return delta * LINE_HEIGHT_PX;
    }
    if (mode === UiWheelDeltaMode.Page) {
      // A screenful, less nothing: this matches paging the scrollbar
      // track, which already moves by exactly one viewport.
      return delta * (extent ?? LINE_HEIGHT_PX * 25);
    }
    return delta;
  }
}

/**
 * Whether this wheel should animate the container it is over.
 *
 * Both halves have to agree: the device has to be one that jumps, and
 * the container has not to have opted out with
 * `scrollBehavior="instant"`.
 */
function behaviorFor(
  container: UiNode,
  deltaMode: UiWheelDeltaMode,
  wheelDeltaY: number | undefined
): UiScrollBehavior {
  if (container.getProperty('scrollBehavior') === 'instant') {
    return 'instant';
  }
  return isNotchedWheel(deltaMode, wheelDeltaY) ? 'smooth' : 'instant';
}

/** A ScrollView, or any node with overflow 'scroll' or 'auto'. */
export function isScrollContainer(node: UiNode): boolean {
  if (node.type === UiNodeType.ScrollView) {
    return true;
  }
  const overflow = node.properties.get('overflow');
  return overflow === 'scroll' || overflow === 'auto';
}
