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
  scrollBy(node: UiNode, dx: number, dy: number): void;
  /** Show the container's scrollbars, as hovering near them or dragging one does. */
  revealScrollbars?(node: UiNode): void;
  /** Geometry of one scrollbar, for dragging its thumb. */
  scrollbar?(node: UiNode, axis: 'x' | 'y'): ScrollbarThumb | null;
}

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
    deltaMode: UiWheelDeltaMode = UiWheelDeltaMode.Pixel
  ): UiWheelEvent {
    const target = this.hitTester.hitTest(x, y)?.node ?? null;
    const event = new UiWheelEvent(UiEventType.Wheel, x, y, deltaX, deltaY, modifiers, deltaMode);
    if (target !== null) {
      this.dispatcher.dispatch(event, target);
    }
    if (!event.defaultPrevented && target !== null) {
      const container = this.nearestScrollable(target);
      if (container !== null) {
        const state = this.scrollSink.containerState(container);
        if (state !== undefined) {
          this.applyDelta(container, state, deltaX, deltaY, deltaMode);
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
    deltaMode: UiWheelDeltaMode
  ): void {
    if (state.horizontal) {
      this.scrollSink.scrollBy(container, this.toPixels(deltaX, deltaMode, state.viewportWidth), 0);
    } else {
      this.scrollSink.scrollBy(container, 0, this.toPixels(deltaY, deltaMode, state.viewportHeight));
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

/** A ScrollView, or any node with overflow 'scroll' or 'auto'. */
export function isScrollContainer(node: UiNode): boolean {
  if (node.type === UiNodeType.ScrollView) {
    return true;
  }
  const overflow = node.properties.get('overflow');
  return overflow === 'scroll' || overflow === 'auto';
}
