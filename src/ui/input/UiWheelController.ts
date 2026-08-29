import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { noModifiers, UiEventType, UiWheelEvent, type UiModifiers } from './UiInputEvent';
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
}

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

  wheel(x: number, y: number, deltaX: number, deltaY: number, modifiers: UiModifiers = noModifiers()): UiWheelEvent {
    const target = this.hitTester.hitTest(x, y)?.node ?? null;
    const event = new UiWheelEvent(UiEventType.Wheel, x, y, deltaX, deltaY, modifiers);
    if (target !== null) {
      this.dispatcher.dispatch(event, target);
    }
    if (!event.defaultPrevented && target !== null) {
      const container = this.nearestScrollable(target);
      if (container !== null) {
        const state = this.scrollSink.containerState(container);
        if (state !== undefined) {
          this.applyDelta(container, state, deltaX, deltaY);
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

  private applyDelta(container: UiNode, state: ScrollContainerState, deltaX: number, deltaY: number): void {
    if (state.horizontal) {
      this.scrollSink.scrollBy(container, deltaX, 0);
    } else {
      this.scrollSink.scrollBy(container, 0, deltaY);
    }
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
