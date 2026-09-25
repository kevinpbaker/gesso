import { DirtyFlags } from '../graph/DirtyFlags';
import { DirtyNodeSet } from '../graph/DirtyNodeSet';
import { markNow, measureSpan, performanceMarksEnabled } from './PerformanceMarks';
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

  /**
   * Told when a frame throws, instead of the clock simply stopping.
   *
   * A frame is the only thing that drives a Gesso application, so an
   * exception escaping one used to end it: the throw unwound past the
   * re-arm at the bottom of `handleFrame`, `pending` was already
   * false, and nothing ever asked for another frame. The application
   * did not crash — it *stopped*, with its last frame still on screen
   * and every click landing in a surface nobody was listening to. The
   * worker sat idle, so a debugger attached to it reported nothing
   * running and nothing to pause.
   *
   * That failure is silent, indistinguishable from a hang, and was
   * found by typing quickly into a spreadsheet. The scheduler now
   * survives it: the frame is abandoned, this is called, and the
   * clock keeps running so the next frame can try again.
   *
   * Defaults to reporting on `console.error`, because a frame that
   * threw is a bug somewhere and the one thing that must not happen
   * is for nobody to hear about it.
   */
  onFrameError?: (error: unknown, time: UiFrameTime) => void;
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
  private readonly onFrameError: (error: unknown, time: UiFrameTime) => void;

  private disposed = false;
  private active = true;
  private pending = false;
  /** True between a frame starting and its dirty set being taken. */
  private collecting = false;
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
    this.onFrameError =
      options.onFrameError ??
      ((error: unknown) => {
        console.error('A Gesso frame threw. The frame was abandoned and the clock kept running.', error);
      });
    this.clock = options.clock((time: UiFrameTime) => {
      this.handleFrame(time);
    });
  }

  /**
   * Called whenever a node becomes dirty.
   *
   * Arms a frame only when none is already pending — and not at all
   * while a frame is between starting and collecting its dirty set,
   * because that frame is about to collect this very node. The work
   * happens either way; what a frame armed here would add is a second
   * frame with nothing left to do.
   *
   * This is the difference between `notifyDirty` and `wake`, and it
   * only became visible when frames started following the display.
   * `beforeCollect` is where animations run, and an animation that
   * writes through the graph — `videoSource` presenting the frame due
   * at its position is the one that found this — marked a node dirty
   * from inside the frame that was going to draw it, and armed
   * another. Against a fixed 16ms timer the spare frame was simply the
   * next scheduled one and cost nothing; against a 165Hz display it
   * doubled the rate of everything a video was playing behind.
   */
  notifyDirty(): void {
    if (this.collecting) {
      return;
    }
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

  /**
   * Runs one frame, and names its three parts for the browser's
   * profiler when anything is recording (`PerformanceMarks`).
   *
   * The three are the ones this class owns the boundaries of, and they
   * are exact rather than reconstructed: the work before the dirty set
   * is taken (animations, patches, environment, virtualisation), the
   * taking of it, and everything the frame callback does with it
   * (layout, semantics, render). The per-phase breakdown inside those
   * belongs to whoever runs the phases and reaches a panel as
   * `FrameMetrics.phases`.
   *
   * `measuring` is read once and the clock is read only when it is
   * true, so a frame nobody is profiling pays one boolean read.
   */
  private handleFrame(time: UiFrameTime): void {
    const measuring = performanceMarksEnabled();
    const started = measuring ? markNow() : 0;
    this.pending = false;
    this.collecting = true;
    let frame: UiFrame | undefined;
    let collected = 0;
    /**
     * Everything a frame does, inside one guard.
     *
     * The guard is the whole point: an exception used to unwind past
     * the re-arm at the bottom of this method, and since `pending` had
     * already been cleared at the top, nothing asked for another
     * frame. One throw stopped the application for good.
     */
    try {
      try {
        this.beforeCollect?.(time);
        if (measuring) {
          collected = markNow();
          measureSpan('before collect', started, collected);
        }
        frame = this.collectFrame(time);
      } finally {
        this.collecting = false;
      }
      let processed = 0;
      if (measuring) {
        processed = markNow();
        measureSpan('collect', collected, processed);
      }
      if (frame.size > 0) {
        this.onFrame(frame);
      }
      if (measuring) {
        const finished = markNow();
        const detail = { frame: frame.id, nodes: frame.size };
        measureSpan('process', processed, finished, detail);
        measureSpan('frame', started, finished, detail);
      }
    } catch (error) {
      this.onFrameError(error, time);
    }
    // Work may have arrived while the frame was being processed, or
    // the frame threw and left its nodes dirty. Either way the clock
    // has to be asked for another one: this is the line that decides
    // whether a thrown frame is a bad frame or the end of the
    // application.
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
