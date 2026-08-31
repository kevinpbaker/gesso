import { DirtyFlags, UiSpring, type AnimatedCell, type UiGraph, type UiNode } from '@gesso/core';
import type { AnimationService } from './AnimationService';

/** Which offset is moving. */
type Axis = 'scrollX' | 'scrollY';

interface AxisState {
  readonly cell: AnimatedCell<number>;
  /**
   * The last value this wrote, so a write by anyone else is
   * detectable. See the setter in `cellFor`.
   */
  lastWritten: number | undefined;
}

interface Axes {
  scrollX?: AxisState;
  scrollY?: AxisState;
}

/**
 * Animates a scroll container towards an offset instead of jumping to
 * it.
 *
 * One wheel notch is one large step and nothing in between, which is
 * the whole of what this smooths. `decisions/0008-overflow-scrolling`
 * deferred it in as many words — "momentum for discrete wheel ticks
 * needs the animation clock" — and that clock has existed since F4.
 *
 * **It owns no time.** Every offset is an ordinary `AnimatedCell`
 * driven by the runtime's `AnimationDriver` through `AnimationService`,
 * so a scroll is scheduled by the same `ticks` phase as everything
 * else, keeps its own frames coming through the same `nextTickAt`, and
 * stops arming them when the spring settles. Going through the service
 * rather than building a `UiSpring` directly buys two things: an
 * application's own motion vocabulary (`setMotion`), and the
 * velocity-carrying retarget, which is the difference between a second
 * notch extending the first and a second notch restarting it.
 *
 * **Reduced motion needs no code here.** A spring's default policy is
 * `snap`, and the driver snaps before the animation ever enters its
 * running set — synchronously, in the caller's turn, arming no frames.
 * So under reduced motion a wheel behaves exactly as it did before any
 * of this existed.
 */
export class SmoothScroller {
  /** One cell per (node, axis), kept for the node's life. */
  private readonly cells = new Map<UiNode, Axes>();

  constructor(
    private readonly graph: UiGraph,
    private readonly animations: AnimationService,
    /** The container's clamp, read fresh because content grows. */
    private readonly limitOf: (node: UiNode, axis: Axis) => number
  ) {}

  /**
   * Moves the container by a delta, animating to the sum.
   *
   * `from` is the container's **effective** offset — the clamped one
   * the last layout settled on — and is used only when nothing is
   * already in flight. While a scroll is running the delta is added to
   * where it is *going*, not to where it currently is: a notch arriving
   * mid-scroll must add a whole notch to the journey, and adding it to
   * the moving position instead makes every notch after the first
   * travel less than it asked for.
   */
  scrollBy(node: UiNode, axis: Axis, delta: number, from: number): void {
    const cell = this.cellFor(node, axis).cell;
    const pending = this.destinationOf(cell);
    const limit = this.limitOf(node, axis);
    const target = clamp((pending ?? from) + delta, 0, limit);
    if (pending !== undefined && target === pending) {
      return;
    }
    this.animations.spring(cell, target, { spring: 'snappy' });
  }

  /**
   * Shifts a running scroll by a coordinate correction.
   *
   * For virtualization, which holds a lazy list's anchor while the
   * estimated heights above it are replaced by measured ones. That
   * correction is not a scroll — the content moved under the viewport,
   * and the viewport has to move with it — so both ends have to shift:
   * the position, or the list slips by the correction on the next tick,
   * and the destination, or the scroll ends somewhere the anchor did
   * not put it.
   *
   * Expressed by moving the cell and re-aiming rather than by reaching
   * into the spring, because a fresh spring reads the cell at
   * construction and `AnimationService` seeds it with the outgoing
   * one's velocity — so the correction lands with no seam in the
   * motion.
   */
  adjust(node: UiNode, axis: Axis, delta: number): void {
    const state = this.cells.get(node)?.[axis];
    if (state === undefined || delta === 0) {
      return;
    }
    const pending = this.destinationOf(state.cell);
    if (pending === undefined) {
      return;
    }
    // The caller has already written the corrected offset to the
    // property, so adopt it as ours rather than reading it as someone
    // else's write and standing down.
    state.lastWritten = state.cell.value;
    this.animations.spring(state.cell, pending + delta, { spring: 'snappy' });
  }

  /** Whether this container is being animated right now. */
  isScrolling(node: UiNode): boolean {
    const axes = this.cells.get(node);
    if (axes === undefined) {
      return false;
    }
    return (
      (axes.scrollX !== undefined && this.destinationOf(axes.scrollX.cell) !== undefined) ||
      (axes.scrollY !== undefined && this.destinationOf(axes.scrollY.cell) !== undefined)
    );
  }

  /**
   * Abandons any animation on this container, leaving the offset
   * wherever it had reached.
   *
   * What every *other* way of scrolling calls before it writes. A focus
   * reveal, a caret reveal and a scrollbar thumb drag each know exactly
   * where they want the container to be, and a spring still running
   * would overwrite that on its next tick — for the caret, on every
   * keystroke.
   */
  stop(node: UiNode): void {
    const axes = this.cells.get(node);
    if (axes === undefined) {
      return;
    }
    for (const state of [axes.scrollX, axes.scrollY]) {
      if (state !== undefined) {
        this.animations.stop(state.cell);
        state.lastWritten = undefined;
      }
    }
  }

  /**
   * Releases a removed subtree.
   *
   * The graph reports one removal per subtree *root*, so this sweeps
   * for descendants the way the layout engine's own detach does. An
   * animation outliving its node is the leak the driver's `stop`
   * docblock names: the driver holds the cell and the cell holds the
   * node.
   */
  handleNodeRemoved(node: UiNode): void {
    const gone: UiNode[] = [];
    for (const held of this.cells.keys()) {
      if (held === node || isDescendantOf(held, node)) {
        gone.push(held);
      }
    }
    for (const held of gone) {
      this.stop(held);
      this.cells.delete(held);
    }
  }

  /**
   * The cell one axis animates through, kept for the node's life.
   *
   * Kept, rather than made per notch, because the driver keys its
   * running set by cell **identity**: a fresh cell each time would
   * leave the previous animation running and two springs would fight
   * over one offset. `NodeTransitions.cellFor` memoises for the same
   * reason and says so.
   */
  private cellFor(node: UiNode, axis: Axis): AxisState {
    let axes = this.cells.get(node);
    if (axes === undefined) {
      axes = {};
      this.cells.set(node, axes);
    }
    const existing = axes[axis];
    if (existing !== undefined) {
      return existing;
    }
    const graph = this.graph;
    const animations = this.animations;
    const state: AxisState = { cell: undefined as unknown as AnimatedCell<number>, lastWritten: undefined };
    const cell: AnimatedCell<number> = {
      get value(): number {
        return node.getProperty<number>(axis) ?? 0;
      },
      set value(next: number) {
        // Someone else moved this container since the last tick — a
        // bound `scrollY` emitting, or a component revealing a row.
        // A programmatic write wins: stand down rather than dragging
        // the container back to a destination chosen before it.
        const current = node.getProperty<number>(axis) ?? 0;
        if (state.lastWritten !== undefined && current !== state.lastWritten) {
          state.lastWritten = undefined;
          animations.stop(cell);
          return;
        }
        state.lastWritten = next;
        // Deliberately `setProperty` and a Transform mark — exactly
        // what the instant path does. The plain write keeps the runtime
        // writing the element's *declared* offset and creates no
        // override, which is what `modifiers/scroll.ts` requires: an
        // override on `scrollY` would shadow every wheel for the life
        // of the node.
        node.setProperty(axis, next);
        graph.markDirty(node, DirtyFlags.Transform);
      }
    };
    (state as { cell: AnimatedCell<number> }).cell = cell;
    axes[axis] = state;
    return state;
  }

  /** Where the running spring is going, or undefined when at rest. */
  private destinationOf(cell: AnimatedCell<number>): number | undefined {
    const running = this.animations.animationFor(cell);
    return running instanceof UiSpring ? running.destination : undefined;
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function isDescendantOf(node: UiNode, ancestor: UiNode): boolean {
  for (let current: UiNode | null = node.parent; current !== null; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}
