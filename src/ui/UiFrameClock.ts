/**
 * A time value, in milliseconds.
 *
 * The value is sourced from the frame clock so it stays
 * meaningful both in the browser main thread and in a Worker.
 */
export type UiFrameTime = number;

/**
 * An abstract frame clock.
 *
 * The core runtime never touches requestAnimationFrame or
 * setTimeout directly. It only asks the clock to arm a frame
 * and to cancel one, which keeps the runtime usable in a
 * Worker or under a test clock.
 */
export interface UiFrameClock {
  requestFrame(): void;
  cancelFrame(): void;
}

/**
 * Builds a clock wired to a callback.
 *
 * A clock delivers ticks through the callback supplied to its
 * constructor, so a scheduler asks for a fresh clock through a
 * factory rather than holding a half-wired instance.
 */
export type UiFrameClockFactory = (onFrame: (time: UiFrameTime) => void) => UiFrameClock;

interface AnimationFrameHost {
  requestAnimationFrame?: (callback: (time: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
}

/**
 * Browser main-thread clock backed by requestAnimationFrame.
 *
 * Fails fast when requestAnimationFrame is unavailable (for
 * example in a Worker) instead of silently doing nothing.
 */
export class UiAnimationFrameClock implements UiFrameClock {
  private readonly requestAnimationFrame: (callback: (time: number) => void) => number;
  private readonly cancelAnimationFrame: (handle: number) => void;
  private handle: number | null = null;

  constructor(private readonly onFrame: (time: UiFrameTime) => void) {
    const host = globalThis as AnimationFrameHost;
    if (typeof host.requestAnimationFrame !== 'function' || typeof host.cancelAnimationFrame !== 'function') {
      throw new Error('requestAnimationFrame is not available in this environment.');
    }
    this.requestAnimationFrame = host.requestAnimationFrame.bind(host);
    this.cancelAnimationFrame = host.cancelAnimationFrame.bind(host);
  }

  requestFrame(): void {
    if (this.handle !== null) {
      return;
    }
    this.handle = this.requestAnimationFrame((time: number) => {
      this.handle = null;
      this.onFrame(time);
    });
  }

  cancelFrame(): void {
    if (this.handle === null) {
      return;
    }
    this.cancelAnimationFrame(this.handle);
    this.handle = null;
  }
}

export interface UiTimerFrameClockOptions {
  /** Delay between requestFrame and the tick, in milliseconds. */
  intervalMs?: number;
  /** Time source used for the delivered tick. */
  now?: () => UiFrameTime;
}

/**
 * Timer-backed clock that works in the browser main thread,
 * in a Worker, and in Node.
 */
export class UiTimerFrameClock implements UiFrameClock {
  private readonly intervalMs: number;
  private readonly now: () => UiFrameTime;
  private handle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onFrame: (time: UiFrameTime) => void,
    options: UiTimerFrameClockOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 16;
    this.now = options.now ?? (() => performance.now());
  }

  requestFrame(): void {
    if (this.handle !== null) {
      return;
    }
    this.handle = setTimeout(() => {
      this.handle = null;
      this.onFrame(this.now());
    }, this.intervalMs);
  }

  cancelFrame(): void {
    if (this.handle === null) {
      return;
    }
    clearTimeout(this.handle);
    this.handle = null;
  }
}

/**
 * Deterministic clock for tests.
 *
 * Frames are delivered by calling tick(). tick() throws when
 * no frame is pending, which catches accidental double-arming.
 */
export class UiManualFrameClock implements UiFrameClock {
  private pending = false;

  constructor(private onFrame: (time: UiFrameTime) => void) {}

  setCallback(onFrame: (time: UiFrameTime) => void): void {
    this.onFrame = onFrame;
  }

  requestFrame(): void {
    this.pending = true;
  }

  cancelFrame(): void {
    this.pending = false;
  }

  get isPending(): boolean {
    return this.pending;
  }

  tick(time: UiFrameTime = 0): void {
    if (!this.pending) {
      throw new Error('No frame is pending.');
    }
    this.pending = false;
    this.onFrame(time);
  }
}
