import type { UiNode } from '../graph/UiNode';
import { UiEventType, type UiInputEvent, type UiPointerEvent } from './UiInputEvent';
import type { UiInputDispatcher } from './UiInputDispatcher';
import { hasScrollRoom, isScrollContainer, type ScrollContainerState, type ScrollSink } from './UiWheelController';

export interface TouchScrollerOptions {
  /**
   * How far a flick coasts, in milliseconds of its release speed.
   *
   * The projected distance is `velocity * momentum`, which is the
   * closed form of an exponential deceleration: a fling that leaves the
   * finger at 2px/ms travels 600px and settles. Raising it makes the
   * content run further from the same flick.
   */
  momentum?: number;
  /**
   * Speed (px/ms) a release must exceed to coast at all.
   *
   * Below it the finger was placing the content, not throwing it, and
   * carrying on moving would be the content sliding out from under
   * someone who had stopped.
   */
  flingVelocity?: number;
  /**
   * How much of the recent movement the release speed is measured over
   * (ms).
   *
   * A whole gesture is the wrong window — a long slow drag that ends in
   * a flick would average out to nothing. Only the last moments count.
   */
  velocityWindow?: number;
  /**
   * The clock, for specs that need to drive velocity without waiting.
   *
   * `performance.now()` where there is one; the samples are only ever
   * subtracted from each other, so any monotonic millisecond source
   * will do.
   */
  now?: () => number;
}

/** A container that will take a gesture, and the axes it will take it on. */
interface ResolvedScroll {
  node: UiNode;
  state: ScrollContainerState;
  takesX: boolean;
  takesY: boolean;
}

/** One position of the finger, kept only long enough to measure speed. */
interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * Scrolls a container by dragging its contents, the way a touchscreen
 * does.
 *
 * A wheel is the only thing that scrolled anything, and a finger
 * produces no wheel events, so a scroll container on a touchscreen was
 * simply stuck. The gesture already existed — the recognizer
 * synthesizes Pan from any press that moves — and nothing consumed it.
 *
 * ## Why a listener rather than a hook in the controller
 *
 * This registers Pan listeners on the **root**, in the bubble phase, so
 * a pan reaches it only if nothing on the way up claimed it. That is
 * not an implementation convenience: it is the whole opt-out mechanism,
 * and it was already the documented contract before anything
 * implemented it. `Slider` and `SplitPane` both call
 * `stopPropagation()` on their pans and both say why — "keeps a scroll
 * container above from panning at the same time". A widget that owns
 * the drag therefore keeps it, with no new API and no list of
 * exceptions in here.
 *
 * ## What it does
 *
 * Each move scrolls by how far the finger travelled, inverted: the
 * content follows the finger rather than the viewport following it.
 * When the innermost scroll container has reached its end the next one
 * out takes over, so a list inside a page hands the page its scroll
 * instead of stopping dead. On release a flick coasts, as a projected
 * distance handed to the sink's smooth path rather than a loop of our
 * own — the sink already owns animating a scroll, and a second animator
 * driving the same offset would fight it.
 *
 * Touch only, deliberately. A mouse drag inside a scroll container is
 * how text is selected, and a pen is used for exactly that precision,
 * so neither can be read as a scroll without taking something away.
 */
export class UiTouchScroller {
  private readonly momentum: number;
  private readonly flingVelocity: number;
  private readonly velocityWindow: number;
  private readonly now: () => number;

  private container: UiNode | null = null;
  private lastX = 0;
  private lastY = 0;
  private samples: Sample[] = [];
  private readonly detach: () => void;

  constructor(
    dispatcher: UiInputDispatcher,
    root: UiNode,
    private readonly scrollSink: ScrollSink,
    options: TouchScrollerOptions = {}
  ) {
    this.momentum = options.momentum ?? 300;
    this.flingVelocity = options.flingVelocity ?? 0.1;
    this.velocityWindow = options.velocityWindow ?? 100;
    this.now = options.now ?? defaultClock;

    const start = (event: UiInputEvent): void => this.panStart(event as UiPointerEvent);
    const move = (event: UiInputEvent): void => this.panMove(event as UiPointerEvent);
    const end = (event: UiInputEvent): void => this.panEnd(event as UiPointerEvent);
    dispatcher.addEventListener(root, UiEventType.PanStart, start);
    dispatcher.addEventListener(root, UiEventType.PanMove, move);
    dispatcher.addEventListener(root, UiEventType.PanEnd, end);
    this.detach = () => {
      dispatcher.removeEventListener(root, UiEventType.PanStart, start);
      dispatcher.removeEventListener(root, UiEventType.PanMove, move);
      dispatcher.removeEventListener(root, UiEventType.PanEnd, end);
    };
  }

  /** The container this pan is scrolling, or null when it is not scrolling one. */
  get scrollingNode(): UiNode | null {
    return this.container;
  }

  /** Stops listening. */
  dispose(): void {
    this.detach();
    this.container = null;
    this.samples = [];
  }

  private panStart(event: UiPointerEvent): void {
    this.container = null;
    this.samples = [];
    if (event.pointer.kind !== 'touch') {
      return;
    }
    this.lastX = event.x;
    this.lastY = event.y;
    // No velocity sample here. A PanStart carries the point the press
    // began at, timestamped now — so the slop the finger crossed before
    // the gesture was recognized would be counted as distance covered
    // in no time at all, and the first flick of every gesture would
    // coast several times too far.
    //
    // The node is resolved per move rather than here, so a pan that
    // exhausts one container can hand over to the next without the
    // finger being lifted.
    this.container = event.target;
  }

  private panMove(event: UiPointerEvent): void {
    if (this.container === null) {
      return;
    }
    // Inverted: dragging the finger up moves the content up, which
    // means scrolling further down.
    const dx = this.lastX - event.x;
    const dy = this.lastY - event.y;
    this.lastX = event.x;
    this.lastY = event.y;
    this.sample(event.x, event.y);

    const resolved = this.resolve(event.target, dx, dy);
    if (resolved === null) {
      return;
    }
    const { node, takesX, takesY } = resolved;
    this.scrollSink.scrollBy(node, takesX ? dx : 0, takesY ? dy : 0);
    // A touchscreen has no hover, so this is the only chance the person
    // gets to see where they are in the content.
    this.scrollSink.revealScrollbars?.(node);
  }

  private panEnd(event: UiPointerEvent): void {
    const target = this.container;
    this.container = null;
    if (target === null) {
      return;
    }
    this.sample(event.x, event.y);
    const velocity = this.releaseVelocity();
    this.samples = [];
    if (velocity === null) {
      return;
    }
    const resolved = this.resolve(event.target, velocity.x, velocity.y);
    if (resolved === null) {
      return;
    }
    const { node, takesX, takesY } = resolved;
    // Each axis passes the threshold on its own, so a diagonal throw
    // coasts on both and a vertical one with a pixel of drift coasts on
    // neither sideways. One threshold on the combined speed would let a
    // fast vertical fling drag the content sideways by whatever the
    // thumb happened to do.
    const flingX = takesX && Math.abs(velocity.x) >= this.flingVelocity ? velocity.x * this.momentum : 0;
    const flingY = takesY && Math.abs(velocity.y) >= this.flingVelocity ? velocity.y * this.momentum : 0;
    if (flingX === 0 && flingY === 0) {
      return;
    }
    this.scrollSink.scrollBy(node, flingX, flingY, 'smooth');
  }

  private sample(x: number, y: number): void {
    const t = this.now();
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - (this.samples[0] as Sample).t > this.velocityWindow) {
      this.samples.shift();
    }
  }

  /**
   * The speed of the content at the moment of release, px/ms, in the
   * same inverted sense as a move: positive means the offset is growing.
   */
  private releaseVelocity(): { x: number; y: number } | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (first === undefined || last === undefined) {
      return null;
    }
    const elapsed = last.t - first.t;
    if (elapsed <= 0) {
      return null;
    }
    return { x: (first.x - last.x) / elapsed, y: (first.y - last.y) / elapsed };
  }

  /**
   * The container that should take this movement, and which of its axes.
   *
   * The nearest scroll container that can still move in the direction
   * asked for, walking outward. A container already at its end is
   * skipped rather than ending the gesture, which is what lets a list
   * that has hit its bottom keep scrolling the page it sits in. When
   * nothing can move, the innermost container is returned so the
   * gesture still belongs somewhere.
   *
   * **Each axis is asked for separately**, because a container may
   * scroll on both, and this used to pick one from the container's
   * flex direction and drop the other on the floor. A spreadsheet is
   * the case that found it on the wheel in 38e70a3: one `ScrollView`
   * whose content overflows in both directions, classified as vertical,
   * so a sideways drag moved nothing at all. This is the same fix on
   * the same shared state, so the two input paths cannot disagree about
   * which container takes a gesture.
   *
   * A container that overflows on one axis only is unaffected: the axis
   * it does not scroll has no room, so it is not taken.
   */
  private resolve(target: UiNode | null, dx: number, dy: number): ResolvedScroll | null {
    let innermost: ResolvedScroll | null = null;
    for (let node: UiNode | null = target; node !== null; node = node.parent) {
      if (!isScrollContainer(node)) {
        continue;
      }
      const state = this.scrollSink.containerState(node);
      if (state === undefined) {
        continue;
      }
      const takesX = dx !== 0 && hasScrollRoom(state.scrollX, state.maxScrollX, dx);
      const takesY = dy !== 0 && hasScrollRoom(state.scrollY, state.maxScrollY, dy);
      // The innermost is the fallback, and it takes nothing: a gesture
      // that nothing can move should belong somewhere without moving
      // anything.
      innermost ??= { node, state, takesX: false, takesY: false };
      if (takesX || takesY) {
        return { node, state, takesX, takesY };
      }
    }
    return innermost;
  }
}

function defaultClock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
