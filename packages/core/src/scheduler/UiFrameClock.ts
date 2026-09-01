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
/** How many refresh intervals the watch is measured over. */
const CADENCE_SAMPLES = 5;

/** Above this, a gap between ticks is a hiccup rather than a display's rate. */
const MAX_CADENCE_MS = 50;

/**
 * How many refresh intervals the watchdog waits before calling a host
 * stalled. See `watchMs` for why one is not enough.
 */
const WATCH_REFRESHES = 2;

const IDLE_TICKS_BEFORE_STOP = 4;

export interface UiHostFrameClockOptions {
  /** How long to wait for a host tick before pacing a frame anyway. */
  fallbackMs?: number;
  /**
   * The longest a hosted clock will wait for a tick before deciding the
   * host has stopped answering and pacing itself again.
   *
   * A ceiling rather than the usual figure: once ticks have been
   * arriving the clock knows the display's own interval and watches at
   * twice that, so this value only applies before it has seen enough
   * refreshes to say. Waiting a tenth of a second on every stall would
   * be six dropped frames on a 60Hz panel, which is visible.
   */
  stallMs?: number;
  /**
   * The shortest that watch can be, whatever the measured cadence.
   *
   * A floor exists because the estimate is taken from timestamps that
   * jitter: watching at exactly one refresh would fire on any tick that
   * arrived a moment late and draw a frame nobody asked for.
   */
  minStallMs?: number;
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
  /** The time the last tick carried, for measuring the display's interval. */
  private lastTickTime: UiFrameTime | null = null;
  /**
   * The host's clock minus this thread's, or null before a tick has
   * shown what it is. See `hostTime`.
   */
  private hostOffset: number | null = null;
  /**
   * The last few intervals between ticks, in arrival order.
   *
   * The watch is set from the *median* of them. The largest was the
   * first attempt and it is too generous: one late refresh — a page
   * doing something expensive in its own rAF, which is exactly what
   * happens the moment before a demonstration blocks the thread —
   * widened the watch to twice that late gap and made the next stall
   * take a quarter of a second to notice. A median ignores one
   * outlier in four and still describes the display.
   */
  private readonly intervals: number[] = [];
  private handle: ReturnType<typeof setTimeout> | null = null;
  private readonly fallbackMs: number;
  private readonly stallMs: number;
  private readonly minStallMs: number;
  private readonly now: () => UiFrameTime;

  constructor(
    private readonly onFrame: (time: UiFrameTime) => void,
    /** Told when this starts and stops wanting ticks. */
    private readonly onActive: (active: boolean) => void,
    options: UiHostFrameClockOptions = {}
  ) {
    this.fallbackMs = options.fallbackMs ?? 16;
    this.stallMs = options.stallMs ?? 100;
    this.minStallMs = options.minStallMs ?? 12;
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
        this.deliver(this.hostTime());
      },
      watching ? this.watchMs() : this.selfPaceMs()
    );
  }

  /**
   * How long to wait for a tick before concluding none is coming.
   *
   * Two refreshes: a live host always beats that, and a blocked one is
   * noticed a frame or two after it stops rather than a fixed tenth of
   * a second later. The ceiling applies until enough ticks have
   * arrived to say, which is three, because two timestamps make one
   * interval and one interval is not evidence of a cadence.
   *
   * One refresh was tried first and is the bug this constant exists to
   * record. The reasoning was that the timer is armed after the frame
   * the tick delivered has done its work, so the next tick is already
   * due by the deadline and wins the race whenever the host is alive.
   * It is not: `requestFrame` is called from the runtime's
   * `beforeCollect`, at the *start* of the frame, so the deadline
   * falls a few microseconds after the next tick is due rather than a
   * whole frame's work after it. The race is then decided by the
   * jitter on one `postMessage`, and the watchdog fires on a large
   * share of ordinary frames.
   *
   * It went unseen because the floor hides it on a fast display: at
   * 165Hz a 6ms cadence is raised to `minStallMs`, which is already
   * two refreshes, while at 60Hz a 16.7ms cadence is passed through
   * untouched. Scrolling was smooth on the one panel and ran at a
   * third of the rate on the other, which is exactly the asymmetry
   * this arithmetic produces.
   */
  private watchMs(): number {
    const cadence = this.cadenceMs();
    if (cadence === null) {
      return this.stallMs;
    }
    return Math.min(this.stallMs, Math.max(this.minStallMs, cadence * WATCH_REFRESHES));
  }

  /**
   * This thread's own clock, expressed on the host's.
   *
   * A tick carries the host's `requestAnimationFrame` timestamp, and a
   * self-paced frame has only `performance.now()` to offer. In a
   * worker those are not the same clock: `performance.now()` counts
   * from the worker's own creation, so it trails the shell's by the
   * page's age at the moment the worker was spawned, which is hundreds
   * of milliseconds in practice.
   *
   * Handing that raw reading to `onFrame` puts a timestamp from a
   * different origin into a stream of host ones, and everything
   * downstream reads the pair as a jump backwards through time. The
   * runtime's animation phase declines to sample, because every
   * running animation is due later than a `now` that far in the past,
   * and then arms its next wake-up for `next - now`, which is the
   * whole offset. One self-paced frame therefore silences the
   * animation clock for as long as the worker is young. A scroll
   * spring stops being advanced by the frame loop and only moves when
   * something else dirties the graph.
   *
   * So the offset is learned from every tick and added back here.
   * Before the first tick there is nothing to learn from and no host
   * timestamp has been delivered either, so the local reading is the
   * base and the first tick shifts it forward once.
   */
  private hostTime(): number {
    const local = this.now();
    return this.hostOffset === null ? local : local + this.hostOffset;
  }

  /** The median recent interval, or null before there are enough to say. */
  private cadenceMs(): number | null {
    if (this.intervals.length < 3) {
      return null;
    }
    const sorted = [...this.intervals].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  }

  /** The interval to pace at while the host is absent: the display's, if it is known. */
  private selfPaceMs(): number {
    const cadence = this.cadenceMs();
    return cadence === null ? this.fallbackMs : Math.max(1, Math.min(this.fallbackMs, cadence));
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
    // Every tick, not just the first: the two clocks drift, and a tab
    // that was suspended resumes with a different offset entirely.
    // Reading it here costs one subtraction and keeps a self-paced
    // frame on the same timeline as the ticks around it.
    this.hostOffset = time - this.now();
    this.recordCadence(time);
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

  /**
   * Keeps the last few gaps between ticks, which is where the watch
   * interval comes from.
   *
   * A gap wider than `MAX_CADENCE_MS` is not a refresh interval — no
   * display runs that slowly — so it is a hiccup, a stall ending, or a
   * tab coming back, and it is dropped rather than taught to the clock.
   * Only a gap wider than the ceiling clears what was learned, because
   * that is long enough that whatever cadence preceded it is stale.
   */
  private recordCadence(time: UiFrameTime): void {
    const previous = this.lastTickTime;
    this.lastTickTime = time;
    if (previous === null) {
      return;
    }
    const interval = time - previous;
    if (interval > this.stallMs) {
      this.intervals.length = 0;
      return;
    }
    if (interval <= 0 || interval > MAX_CADENCE_MS) {
      return;
    }
    this.intervals.push(interval);
    if (this.intervals.length > CADENCE_SAMPLES) {
      this.intervals.shift();
    }
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
