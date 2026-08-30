/**
 * Measures how long a user input waits for the frame that reflects it.
 *
 * The number this produces is the one thing `FrameMetrics` could not
 * already show. Frame *gap* — the distance between consecutive
 * `FrameMetrics.at` readings — is the honest measure of a stall on the
 * rendering thread, and it is deliberately blind to everything that
 * happens before an event reaches that thread: a shell too busy to
 * forward a pointer event costs the person a visibly late response
 * while the render worker, having nothing new to draw, reports a
 * perfectly even cadence.
 *
 * So latency is measured from the moment the shell received the event
 * to the moment the frame carrying its effect finished, on a clock
 * both threads agree on (see `epochNow` in `RenderWorkerProtocol`).
 */
export class InputLatencyTracker {
  private pendingAt: number | null = null;

  /**
   * Records an input that a frame will answer.
   *
   * `armedFrame` is the caller's reading of whether a frame is pending
   * once the input has been routed. An input that dirtied nothing —
   * a pointer move across empty space, a key the focused node ignored
   * — arms no frame, and there is no work whose latency could be
   * measured. Marking it anyway would attribute it to whatever
   * unrelated frame happened next, which at idle could be seconds
   * later and would make the metric read as a stall.
   *
   * The earliest pending stamp wins. A burst of pointer moves between
   * two frames coalesces into one frame's work, and the honest number
   * is how long the oldest of them waited, not the youngest.
   */
  mark(at: number | undefined, armedFrame: boolean): void {
    if (at === undefined || !armedFrame) {
      return;
    }
    this.pendingAt = this.pendingAt === null ? at : Math.min(this.pendingAt, at);
  }

  /**
   * Takes the latency for a frame that has just finished, in
   * milliseconds, or null when no input is waiting on this frame.
   *
   * Taking clears the mark, so a frame drawn for some other reason —
   * an animation tick, a patch — reports null rather than repeating
   * the last input's number.
   */
  take(frameEndEpoch: number): number | null {
    const markedAt = this.pendingAt;
    if (markedAt === null) {
      return null;
    }
    this.pendingAt = null;
    const elapsed = frameEndEpoch - markedAt;
    // A negative reading means the two threads disagreed about the
    // shared clock. Reporting nothing is better than reporting a
    // number that cannot be true.
    return elapsed >= 0 ? elapsed : null;
  }

  /** Whether an input is still waiting for its frame. */
  get hasPending(): boolean {
    return this.pendingAt !== null;
  }

  /** Forgets any pending mark, for a runtime being torn down or reset. */
  reset(): void {
    this.pendingAt = null;
  }
}
