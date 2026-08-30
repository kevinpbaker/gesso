import { DirtyFlags } from '../graph/DirtyFlags';
import { DirtyNodeSet } from '../graph/DirtyNodeSet';
import { UiFrame } from './UiFrame';
import type { UiFrameClock, UiFrameClockFactory, UiFrameTime } from './UiFrameClock';
import type { UiNode } from '../graph/UiNode';

export type UiFrameCallback = (frame: UiFrame) => void;

export interface UiSchedulerOptions {
  /**
   * Builds the frame clock for this scheduler.
   */
  clock: UiFrameClockFactory;
  /**
   * The shared dirty set. The graph marks into it and the
   * scheduler drains it on each frame.
   */
  dirty: DirtyNodeSet;
  /**
   * Receives one UiFrame per processed tick.
   */
  onFrame: UiFrameCallback;

  /**
   * Runs immediately before the dirty set is snapshotted.
   *
   * For work that produces dirt of its own — applying store patches,
   * propagating environment, advancing animations — so the nodes it
   * dirties belong to the frame about to be collected rather than the
   * one after it. Anything reading the dirty set after collection sees
   * an empty one, so this hook is the only place such work can go.
   *
   * It receives the frame's time, so a phase that advances with the
   * clock advances on *this* clock: under a manual clock in a spec
   * `performance.now()` is a different number entirely, and an
   * animation reading it would not be reproducible.
   */
  beforeCollect?: (time: UiFrameTime) => void;
}

/**
 * Decides when a dirty graph gets processed.
 *
 * No observable emission reaches this directly. Marking a node
 * dirty only calls notifyDirty(), which arms a frame at most
 * once. Additional marks are coalesced into the pending frame.
 *
 * The scheduler is timing agnostic: it drives whatever clock it
 * is given, so the same runtime works on the main thread, in a
 * Worker, and in tests.
 */
export class UiScheduler {
  private readonly clock: UiFrameClock;
  private readonly dirty: DirtyNodeSet;
  private readonly onFrame: UiFrameCallback;
  private readonly beforeCollect: ((time: UiFrameTime) => void) | undefined;

  private disposed = false;
  private active = true;
  private pending = false;
  private frames = 0;

  /**
   * Scratch space for draining the dirty set.
   *
   * Kept for the life of the scheduler: this drain happens on every
   * frame, and the nodes are copied straight into the frame's map, so
   * nothing outside collectFrame ever sees the array.
   */
  private readonly drained: UiNode[] = [];

  constructor(options: UiSchedulerOptions) {
    this.dirty = options.dirty;
    this.onFrame = options.onFrame;
    this.beforeCollect = options.beforeCollect;
    this.clock = options.clock((time: UiFrameTime) => {
      this.handleFrame(time);
    });
  }

  /**
   * Called whenever a node becomes dirty.
   *
   * Arms a frame only when none is already pending.
   */
  notifyDirty(): void {
    this.wake();
  }

  /**
   * Arms a frame for work that is not in the dirty set.
   *
   * `notifyDirty` is the graph's call and means "a node changed"; this
   * means "run a frame anyway", which is what an animation needs.
   * Nothing an animation writes can be what arms its own frame: its
   * writes happen in `beforeCollect`, inside a frame that has to exist
   * already. Something outside the graph has to ask, and this is the
   * asking. Safe to call from inside `beforeCollect` — `pending` is
   * cleared before that hook runs, so it arms the next frame and not
   * the one in progress.
   */
  wake(): void {
    if (this.disposed || !this.active || this.pending) {
      return;
    }
    this.pending = true;
    this.clock.requestFrame();
  }

  start(): void {
    if (this.disposed) {
      throw new Error('UiScheduler is disposed.');
    }
    if (this.active) {
      return;
    }
    this.active = true;
    if (!this.dirty.isEmpty()) {
      this.notifyDirty();
    }
  }

  stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.pending = false;
    this.clock.cancelFrame();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.active = false;
    this.pending = false;
    this.clock.cancelFrame();
  }

  get running(): boolean {
    return this.active;
  }

  get framePending(): boolean {
    return this.pending;
  }

  get frameCount(): number {
    return this.frames;
  }

  /**
   * Processes the pending frame now, in the caller's task.
   *
   * For work that has already made the surface stale — a resize clears
   * the backing store — where waiting for the clock would present the
   * cleared surface for a frame.
   */
  flush(time: UiFrameTime): void {
    if (this.disposed || !this.active) {
      return;
    }
    this.clock.cancelFrame();
    this.pending = false;
    this.handleFrame(time);
  }

  private handleFrame(time: UiFrameTime): void {
    this.pending = false;
    this.beforeCollect?.(time);
    const frame = this.collectFrame(time);
    if (frame.size > 0) {
      this.onFrame(frame);
    }
    // Work may have arrived while the frame was being processed.
    // The dirty listener also arms a frame, but this covers a
    // scheduler used without a listener wired to the graph.
    if (!this.dirty.isEmpty()) {
      this.notifyDirty();
    }
  }

  private collectFrame(time: UiFrameTime): UiFrame {
    const count = this.dirty.drainInto(this.drained);
    const dirty = new Map<UiNode, DirtyFlags>();
    for (let i = 0; i < count; i++) {
      const node = this.drained[i];
      dirty.set(node, node.dirtyFlags);
      node.dirtyFlags = DirtyFlags.None;
    }
    const frame = new UiFrame(this.frames, time, dirty);
    if (dirty.size > 0) {
      this.frames++;
    }
    return frame;
  }
}
