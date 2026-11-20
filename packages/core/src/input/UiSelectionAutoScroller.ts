import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import { isScrollContainer, type ScrollSink } from './UiWheelController';

/**
 * How far inside a container's edge the pointer starts to scroll it, in
 * pixels. A browser scrolls only once the pointer is past the edge; a
 * band inside it is kinder to a container that reaches the window's
 * edge, where the pointer cannot go past.
 */
export const SELECTION_SCROLL_EDGE = 24;

/** Pixels a second per pixel of depth into the band or past the edge. */
const SPEED_PER_PIXEL = 18;

/** The fastest it scrolls, in pixels a second. */
const MAX_SPEED = 2400;

/** The longest gap between two frames it will scroll across at once. */
const MAX_STEP_MS = 50;

/** A press dragging out a selection; see `UiPointerController.selectionDrag`. */
export interface SelectionDrag {
  readonly node: UiNode;
  readonly x: number;
  readonly y: number;
}

/**
 * Scrolls the container a selection is being dragged in while the
 * pointer is held at or past its edge, as a browser does when text is
 * dragged out past the bottom of a page.
 *
 * Driven by the frame rather than by pointer moves, because the gesture
 * is to hold the pointer still below the text and wait, which produces
 * no moves at all. Each frame the runtime replays the last move first,
 * so the selection reaches the text that last frame's scroll brought
 * under the pointer, and then calls this. The speed grows with how far
 * into the edge band, or past the edge, the pointer is.
 *
 * The nearest scroll container around the node the press began on is
 * scrolled; one already at its end on that side hands the scroll to the
 * one around it, as a wheel does.
 */
export class UiSelectionAutoScroller {
  private lastTime: number | undefined;

  constructor(
    private readonly sink: ScrollSink,
    /** A node's border box in canvas coordinates, as drawn. */
    private readonly screenBox: (node: UiNode) => LayoutBox
  ) {}

  /**
   * One frame's scroll for `drag`, at `time` in milliseconds. Returns
   * whether it scrolled, which is whether the runtime should replay the
   * move and keep frames coming.
   */
  advance(drag: SelectionDrag | null, time: number): boolean {
    const last = this.lastTime;
    if (drag === null) {
      this.lastTime = undefined;
      return false;
    }
    this.lastTime = time;
    // The first frame of a hold has no interval to scroll across; it
    // scrolls one frame's worth.
    const elapsed = last === undefined ? 16 : Math.min(Math.max(time - last, 0), MAX_STEP_MS);
    for (let node: UiNode | null = drag.node.parent; node !== null; node = node.parent) {
      if (!isScrollContainer(node)) {
        continue;
      }
      const state = this.sink.containerState(node);
      if (state === undefined) {
        continue;
      }
      const box = this.screenBox(node);
      const vx = edgeSpeed(drag.x, box.x, box.x + box.width);
      const vy = edgeSpeed(drag.y, box.y, box.y + box.height);
      const dx = roomFor(vx, state.scrollX, state.maxScrollX) ? (vx * elapsed) / 1000 : 0;
      const dy = roomFor(vy, state.scrollY, state.maxScrollY) ? (vy * elapsed) / 1000 : 0;
      if (dx !== 0 || dy !== 0) {
        this.sink.scrollBy(node, dx, dy, 'instant');
        return true;
      }
      if (vx === 0 && vy === 0) {
        // Well inside this container: an outer one is not reached
        // through it.
        return false;
      }
    }
    return false;
  }
}

/** Signed speed along one axis: negative toward `low`, positive toward `high`, 0 in between. */
function edgeSpeed(at: number, low: number, high: number): number {
  if (high - low <= SELECTION_SCROLL_EDGE * 2) {
    // Too small to have a middle: only past an edge counts.
    return at < low ? -speedFor(low - at) : at > high ? speedFor(at - high) : 0;
  }
  if (at < low + SELECTION_SCROLL_EDGE) {
    return -speedFor(low + SELECTION_SCROLL_EDGE - at);
  }
  if (at > high - SELECTION_SCROLL_EDGE) {
    return speedFor(at - (high - SELECTION_SCROLL_EDGE));
  }
  return 0;
}

function speedFor(depth: number): number {
  return Math.min(depth * SPEED_PER_PIXEL, MAX_SPEED);
}

function roomFor(speed: number, offset: number, max: number): boolean {
  return speed < 0 ? offset > 0.5 : speed > 0 ? offset < max - 0.5 : false;
}
