import { Observable, Subject } from 'rxjs';

import type { FrameMetrics } from './GessoRuntime';

/**
 * Every frame the runtime draws, as a component can hear it.
 *
 * The shell already receives these as `onFrame`, for an FPS readout or
 * a profiler on the host thread. A screen that wants to show its own
 * frame gap or input latency, as a demo of the thread model does,
 * needs them on this thread, and this is where the runtime puts them.
 * Injected like any service: `ctx.inject(FrameService).frames`.
 */
export class FrameService {
  private readonly subject = new Subject<FrameMetrics>();
  private flusher: (() => void) | null = null;
  /** Emits after each frame finishes, with what it cost and what it answered. */
  readonly frames: Observable<FrameMetrics> = this.subject.asObservable();

  /** Called by the runtime; not for components. */
  publish(metrics: FrameMetrics): void {
    this.subject.next(metrics);
  }

  /** Called by the shell that drives the frames; not for components. */
  setFlush(flush: (() => void) | null): void {
    this.flusher = flush;
  }

  /**
   * Draws a pending frame now, rather than when the display next asks
   * for one; nothing when none is pending.
   *
   * A tab in the background is sent no frames. A design editor's tool,
   * called by an agent while the editor's window is behind another,
   * changes the screen and waits for it to be drawn before reading it:
   * without this, it waits for a frame that never comes. The agent's
   * own screen tools (`uiSurface`) do the same after each action.
   */
  flush(): void {
    this.flusher?.();
  }
}
