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
 * Refreshes to keep asking for after the last frame anybody wanted.
 *
 * Four is about a fortieth of a second at sixty and a fortieth at one
 * hundred and sixty-five, which covers the gap anything animating
 * leaves between frames without keeping an idle application awake for
 * a noticeable moment.
 */
const IDLE_TICKS_BEFORE_STOP = 4;

export interface UiHostFrameClockOptions {
  /** How long to wait for a host tick before pacing a frame anyway. */
  fallbackMs?: number;
  /**
   * How long a hosted clock waits for a tick that does not come before
   * deciding the host has stopped answering and pacing itself.
   *
   * Well beyond any display's frame time — a tenth of a second without
   * a refresh is a stalled host on a 30Hz panel as much as on a 165Hz
   * one — because a tick clears this timer, so a value close to the
   * refresh interval would race the host and draw frames it did not
   * ask for.
   */
  stallMs?: number;
  /** Time source for a fallback tick; host ticks carry their own. */
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
 * A clock whose frames arrive from somewhere else.
 *
 * The one thing a worker cannot do for itself. `requestAnimationFrame`
 * is tied to the compositor and exists only on the main thread, so a
 * render worker's frames were paced by `UiTimerFrameClock` at a fixed
 * 16ms — roughly sixty a second on any display, aligned to none of
 * them. On a 165Hz monitor that is not merely slower than it could be:
 * an unaligned timer lands two frames inside one refresh, or none, so
 * the pacing is uneven as well as capped.
 *
 * This clock does no timing at all. It reports when it wants frames
 * and delivers whatever ticks it is handed, which lets the shell —
 * the one thread with a `requestAnimationFrame` — supply the display's
 * own cadence. That is the narrow exception to keeping the shell
 * uninvolved: not work moved back onto the main thread for
 * convenience, but the single fact a worker has no way to observe.
 *
 * **Ticks are free-running while frames are wanted, not requested one
 * at a time.** A tick per request would cost a round trip inside every
 * frame: if the request reaches the shell after that vsync's callback
 * has run, the tick waits for the next one and the rate halves. So
 * `onActive(true)` means "keep ticking" and `onActive(false)` means
 * "stop"; a tick arriving with nothing pending is dropped, which costs
 * one comparison and makes the timing robust to whichever side is
 * late.
 */
export class UiHostFrameClock implements UiFrameClock {
  private pending = false;
  private active = false;
  /** Set by the first real tick; until then the fallback timer paces. */
  private hosted = false;
  /**
   * True while a host that was ticking has gone quiet, and this clock
   * is pacing itself again until it comes back.
   */
  private stalled = false;
  /** Refreshes arrived with nothing pending, before the loop stops. */
  private idleTicks = 0;
  private handle: ReturnType<typeof setTimeout> | null = null;
  private readonly fallbackMs: number;
  private readonly stallMs: number;
  private readonly now: () => UiFrameTime;

  constructor(
    private readonly onFrame: (time: UiFrameTime) => void,
    /** Told when this starts and stops wanting ticks. */
    private readonly onActive: (active: boolean) => void,
    options: UiHostFrameClockOptions = {}
  ) {
    this.fallbackMs = options.fallbackMs ?? 16;
    this.stallMs = options.stallMs ?? 100;
    this.now = options.now ?? (() => performance.now());
  }

  requestFrame(): void {
    this.pending = true;
    this.setActive(true);
    this.armTimer();
  }

  /**
   * Arms the timer that draws a frame the host did not ask for.
   *
   * It plays two roles with one mechanism. Before any tick has arrived
   * it *paces*: a host that does not forward refreshes is then merely
   * no better than the timer this clock replaced, rather than a frozen
   * application — which matters because the capability is not
   * negotiated, and the first real tick is the only evidence it exists.
   *
   * Once ticks are arriving it *watches*: set far beyond a refresh
   * interval, cleared by every tick, and therefore never fired while
   * the host is answering. When it does fire, the host has stopped —
   * a blocked main thread is the case that matters — and this clock
   * goes back to pacing itself until a tick says otherwise.
   *
   * Without that second role the render worker's frames stop dead
   * whenever the shell's thread is busy, which is the one thing the
   * whole architecture exists to prevent.
   */
  private armTimer(): void {
    if (this.handle !== null) {
      return;
    }
    const watching = this.hosted && !this.stalled;
    this.handle = setTimeout(
      () => {
        this.handle = null;
        if (!this.pending) {
          return;
        }
        // A tick would have cleared this timer, so its firing is the
        // evidence that none came.
        this.stalled = this.hosted;
        this.deliver(this.now());
      },
      watching ? this.stallMs : this.fallbackMs
    );
  }

  cancelFrame(): void {
    this.pending = false;
    this.clearFallback();
    this.setActive(false);
  }

  private clearFallback(): void {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }

  private deliver(time: UiFrameTime): void {
    this.pending = false;
    this.onFrame(time);
  }

  /**
   * Delivers a tick from the host. Ignored when no frame is pending,
   * which is what lets the host keep a loop running a beat longer than
   * it is needed rather than negotiating every frame.
   */
  tick(time: UiFrameTime): void {
    this.hosted = true;
    this.stalled = false;
    this.clearFallback();
    if (!this.pending) {
      // Not wanted *yet* is not the same as not wanted. Something
      // animating slower than the display asks for its next frame a
      // moment after finishing this one, so stopping the loop the
      // instant a frame ends and restarting it milliseconds later
      // trades one message per frame for three and a cancelled
      // `requestAnimationFrame` in between. A few idle refreshes of
      // patience costs a dropped tick each and removes all of it.
      this.idleTicks++;
      if (this.idleTicks >= IDLE_TICKS_BEFORE_STOP) {
        this.setActive(false);
      }
      return;
    }
    this.idleTicks = 0;
    this.deliver(time);
  }

  private setActive(active: boolean): void {
    if (active) {
      this.idleTicks = 0;
    }
    if (this.active === active) {
      return;
    }
    this.active = active;
    this.onActive(active);
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
