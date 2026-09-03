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
  /** Emits after each frame finishes, with what it cost and what it answered. */
  readonly frames: Observable<FrameMetrics> = this.subject.asObservable();

  /** Called by the runtime; not for components. */
  publish(metrics: FrameMetrics): void {
    this.subject.next(metrics);
  }
}
