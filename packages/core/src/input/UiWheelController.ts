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
  /**
   * True when the container lays its children out in a row.
   *
   * The wheel no longer reads this: it asks each axis whether it has
   * room, so a container that overflows both ways takes both deltas.
   * `UiTouchScroller` still reads it to pick the axis a drag and its
   * inertia run along, which is a single-axis model — a two-axis
   * container is panned on whichever axis this names.
   */
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
  /**
   * Every scroll container currently laid out, in no order.
   *
   * Only the tree-level question needs this — "does this runtime
   * scroll at all", which is what a touchscreen's `touch-action` has
   * to be set from, since that is latched before the finger lands and
   * there is no position to ask about yet. Optional, so a sink
   * written before this existed still compiles; a sink that omits it
   * is read as scrolling nothing.
   */
  scrollContainers?(): Iterable<UiNode>;
  /** Show the container's scrollbars, as hovering near them or dragging one does. */
  revealScrollbars?(node: UiNode): void;
  /** Geometry of one scrollbar, for dragging its thumb. */
  scrollbar?(node: UiNode, axis: 'x' | 'y'): ScrollbarThumb | null;
}

/** Whether a scroll lands at once or is animated to its destination. */
export type UiScrollBehavior = 'instant' | 'smooth';

/**
 * Which way a wheel at some point would move something in the
 * runtime.
 *
 * Four directions rather than one flag because the interesting case
 * is a container at an edge: a list scrolled to its top has to keep
 * upward wheels away from itself and hand them to the page, and
 * answering "is anything scrollable here" with a single boolean gets
 * that exactly backwards.
 */
export interface UiScrollability {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Nothing under the pointer takes a wheel in any direction. */
const NOTHING_SCROLLABLE: UiScrollability = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false
});

/** Every direction is kept, which is what containing overscroll means. */
const EVERYTHING_SCROLLABLE: UiScrollability = Object.freeze({
  up: true,
  down: true,
  left: true,
  right: true
});

/**
 * How much remaining range still counts as room to scroll.
 *
 * Offsets are floats — a fractional device pixel ratio and a clamped
 * scroll both produce them — so an exact comparison against the
 * maximum leaves a container permanently a hair off its own edge,
 * claiming room it cannot use. Half a pixel is below anything a
 * person can see move and well above that noise.
 */
const SCROLL_EPSILON = 0.5;

/** Whether an offset can still move in the direction `delta` points. */
export function hasScrollRoom(offset: number, max: number, delta: number): boolean {
  return delta > 0 ? offset < max - SCROLL_EPSILON : offset > SCROLL_EPSILON;
}

/** Whether this node keeps overscroll rather than chaining it outwards. */
function containsOverscroll(node: UiNode | null): boolean {
  return node !== null && node.getProperty('overscrollBehavior') === 'contain';
}

/** The topmost ancestor of a node — the app root, in a mounted tree. */
function rootOf(node: UiNode): UiNode {
  let current = node;
  while (current.parent !== null) {
    current = current.parent;
  }
  return current;
}

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
 * walks the scroll chain from that node outwards and gives the delta
 * to the first container with room for it. preventDefault() on Wheel
 * therefore opts out of automatic scroll consumption.
 *
 * The returned event says whether anything took the delta, via
 * `consumed`. A shell needs that answer to decide whether to prevent
 * the browser's default: a canvas that prevents unconditionally is a
 * scroll trap on the page around it, and one that never prevents lets
 * a scroll happen twice.
 */
export class UiWheelController {
  constructor(
    private readonly hitTester: HitTester,
    private readonly dispatcher: UiInputDispatcher,
    private readonly scrollSink: ScrollSink,
    /**
     * The tree's root, when the host knows it.
     *
     * Only `scrollsAnything()` needs it, and only to honour an
     * `overscrollBehavior="contain"` root in a tree that has no scroll
     * container to walk up from. Optional so every existing caller
     * still constructs; without it such a root is read as the default.
     */
    private readonly rootNode: (() => UiNode | null) | null = null
  ) {}

  /**
   * The node the last wheel landed on, or null before any.
   *
   * A wheel is evidence of where the pointer is, and sometimes the
   * only evidence there is: scrolling a page slides a canvas under a
   * cursor that never moved, so no pointer event ever told the
   * runtime it was hovered. A host reporting scrollability falls back
   * to this when nothing is hovered, which is what makes the second
   * wheel of a burst land correctly even though the first could not.
   */
  lastWheelTarget: UiNode | null = null;

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
    this.lastWheelTarget = target;
    const event = new UiWheelEvent(UiEventType.Wheel, x, y, deltaX, deltaY, modifiers, deltaMode, wheelDeltaY);
    if (target !== null) {
      this.dispatcher.dispatch(event, target);
    }
    if (!event.defaultPrevented && target !== null) {
      this.scrollChain(target, event, deltaX, deltaY, deltaMode, wheelDeltaY);
    }
    return event;
  }

  /**
   * Whether a wheel at this point would move anything, without moving
   * it.
   *
   * The same walk `wheel()` does, stopping short of scrolling. It
   * exists for a shell that has to answer *before* the delta arrives:
   * one driving the runtime across a worker boundary cannot ask
   * synchronously inside a DOM wheel handler, and a touchscreen's
   * `touch-action` has to be set in CSS before the finger lands. Both
   * read this after a pointer move and cache the answer.
   *
   * Application listeners are not consulted — they are not run for a
   * question — so a handler that would call `preventDefault()` on the
   * real event is invisible here. That is a deliberate limit and the
   * safe direction: it can only under-report a trap, never invent one.
   */
  scrollabilityAt(x: number, y: number): UiScrollability {
    return this.scrollabilityOf(this.hitTester.hitTest(x, y)?.node ?? null);
  }

  /**
   * `scrollabilityAt` for a node already in hand.
   *
   * The runtime answers from the hovered node rather than a point,
   * since it has one and re-running a hit test to rediscover it would
   * be the same walk twice. A null node — the pointer over empty
   * space, or never yet moved — scrolls nothing.
   */
  scrollabilityOf(target: UiNode | null): UiScrollability {
    if (target === null) {
      // A root that contains its overscroll says nothing leaves the
      // canvas, and that has to hold before anything has been
      // hovered — otherwise a full-viewport app leaks its first wheel
      // to the page it is mounted in.
      return containsOverscroll(this.rootNode?.() ?? null) ? EVERYTHING_SCROLLABLE : NOTHING_SCROLLABLE;
    }
    let up = false;
    let down = false;
    let left = false;
    let right = false;
    for (let node: UiNode | null = target; node !== null; node = node.parent) {
      if (!isScrollContainer(node)) {
        continue;
      }
      const state = this.scrollSink.containerState(node);
      if (state === undefined) {
        continue;
      }
      left ||= hasScrollRoom(state.scrollX, state.maxScrollX, -1);
      right ||= hasScrollRoom(state.scrollX, state.maxScrollX, 1);
      up ||= hasScrollRoom(state.scrollY, state.maxScrollY, -1);
      down ||= hasScrollRoom(state.scrollY, state.maxScrollY, 1);
      if (containsOverscroll(node)) {
        // Nothing past here can be reached by chaining, so nothing
        // past here is worth reporting — and the contained node keeps
        // every direction whether or not it has room left.
        return EVERYTHING_SCROLLABLE;
      }
    }
    if (containsOverscroll(rootOf(target))) {
      return EVERYTHING_SCROLLABLE;
    }
    return { up, down, left, right };
  }

  /**
   * Whether anything in the tree scrolls at all.
   *
   * The coarse, position-free form of `scrollabilityAt`, and the only
   * one a touchscreen can use: `touch-action` is latched when the
   * finger lands, so there is no hover position to have asked about
   * and no later moment at which changing it would still count. A
   * runtime with nothing scrollable can hand every gesture to the
   * page; one with a scrollable container anywhere has to keep them,
   * because it cannot know yet where the finger will land.
   */
  scrollsAnything(): boolean {
    if (containsOverscroll(this.rootNode?.() ?? null)) {
      return true;
    }
    for (const node of this.scrollSink.scrollContainers?.() ?? []) {
      const state = this.scrollSink.containerState(node);
      if (state === undefined) {
        continue;
      }
      if (state.maxScrollX > SCROLL_EPSILON || state.maxScrollY > SCROLL_EPSILON) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gives the delta to the first container along the chain with room
   * for it, marking the event consumed when one takes it.
   *
   * "Room" means room in the direction of travel, not room for the
   * whole delta: a container part-way down its range takes a wheel
   * that would overshoot and clamps, which is what a browser does and
   * what keeps a fast flick from jumping out to the page.
   */
  private scrollChain(
    target: UiNode,
    event: UiWheelEvent,
    deltaX: number,
    deltaY: number,
    deltaMode: UiWheelDeltaMode,
    wheelDeltaY: number | undefined
  ): void {
    for (let node: UiNode | null = target; node !== null; node = node.parent) {
      if (!isScrollContainer(node)) {
        continue;
      }
      const state = this.scrollSink.containerState(node);
      if (state === undefined) {
        continue;
      }
      // Each axis is asked for separately, because a container may
      // scroll on both. A spreadsheet is the case that found this: its
      // viewport is one ScrollView whose content overflows in both
      // directions, and a container classified as one or the other
      // dropped every horizontal delta on the floor and then found no
      // horizontal container to chain to either. A container that
      // overflows on one axis only is unaffected — the axis it does
      // not scroll has no room, so it is not taken.
      const takesX = deltaX !== 0 && hasScrollRoom(state.scrollX, state.maxScrollX, deltaX);
      const takesY = deltaY !== 0 && hasScrollRoom(state.scrollY, state.maxScrollY, deltaY);
      if (takesX || takesY) {
        this.applyDelta(
          node,
          state,
          takesX ? deltaX : 0,
          takesY ? deltaY : 0,
          deltaMode,
          behaviorFor(node, deltaMode, wheelDeltaY)
        );
        event.markConsumed();
        return;
      }
      if (containsOverscroll(node)) {
        event.markConsumed();
        return;
      }
    }
    // Nothing had room. The root has the last word on whether the
    // leftover leaves the canvas: by default it does, so a page
    // around an embedded runtime goes on scrolling.
    if (containsOverscroll(rootOf(target))) {
      event.markConsumed();
    }
  }

  private applyDelta(
    container: UiNode,
    state: ScrollContainerState,
    deltaX: number,
    deltaY: number,
    deltaMode: UiWheelDeltaMode,
    behavior: UiScrollBehavior
  ): void {
    // A page-mode delta means a screenful, and a screenful is a
    // different number on each axis, so each is converted in its own
    // viewport extent rather than one of them borrowing the other's.
    this.scrollSink.scrollBy(
      container,
      deltaX === 0 ? 0 : this.toPixels(deltaX, deltaMode, state.viewportWidth),
      deltaY === 0 ? 0 : this.toPixels(deltaY, deltaMode, state.viewportHeight),
      behavior
    );
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
