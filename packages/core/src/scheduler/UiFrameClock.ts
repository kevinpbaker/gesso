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
  /**
   * This thread's own `requestAnimationFrame`, where it has one.
   *
   * Defaults to looking for it, which is the whole point: a dedicated
   * worker has one, and using it removes the host from the frame path
   * entirely. Pass `null` to force the hosted path, which specs do and
   * which is also the escape hatch if a browser's worker frames ever
   * turn out to be worse than its host's.
   */
  requestAnimationFrame?: ((callback: (time: number) => void) => number) | null;
  /** This thread's `performance.timeOrigin`, to read the host's times on this clock. Injectable for specs. */
  timeOrigin?: number;
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
 * A render worker's frames were once paced by `UiTimerFrameClock` at a
 * fixed 16ms — roughly sixty a second on any display, aligned to none
 * of them. On a 165Hz monitor that is not merely slower than it could
 * be: an unaligned timer lands two frames inside one refresh, or none,
 * so the pacing is uneven as well as capped.
 *
 * **A dedicated worker can ask the compositor itself**, and this clock
 * does so when it can. `DedicatedWorkerGlobalScope.requestAnimationFrame`
 * has been in Chrome since 69, Firefox since 99 and Safari since 16.4,
 * which makes it baseline as of March 2023; this file used to say it
 * "exists only on the main thread", which was true when it was written
 * and is not now. Measured in the render worker: a median interval of
 * 16.7ms with a spread of 0.2, which is vsync and not a timer. Its
 * timestamps are on this thread's own `performance.now()` timeline, so
 * nothing has to be translated.
 *
 * That path costs the shell nothing at all: no loop, and no message
 * per refresh. `onActive` is never called, so a host that was
 * forwarding ticks simply stops being asked to.
 *
 * **The hosted path remains for where it is not available**, which is
 * an older browser and, on Chromium, a *nested* worker. Then this
 * clock does no timing of its own: it reports when it wants frames and
 * delivers whatever ticks it is handed, which lets the shell supply
 * the display's cadence on its behalf. It is the same contract either
 * way, which is why the choice can be made at construction and
 * forgotten.
 *
 * Neither path's refreshes come for a hidden tab: a worker's animation
 * frames are serviced by its **owner window's** rendering, and a window
 * that is not rendering services none. A frame asked for then is paced
 * by a timer instead (`setHidden`). The battery properties hold anyway,
 * because the runtime asks for nothing on a hidden page's account (no
 * caret blink, no animation ticks); what it still asks for is a real
 * change, such as a channel's patch, and a frame that never came left
 * that change unapplied: an answer the application thread had sent
 * never reached the code awaiting it, for as long as the tab stayed
 * hidden or behind another window.
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
/**
 * This thread's `requestAnimationFrame`, if it has a real one.
 *
 * Checked for rather than assumed, because the answer differs by
 * thread and by browser: a window always has one, a dedicated worker
 * has had one for years, and a *nested* worker on Chromium has not.
 * The feature test is the whole guard; there is no version to compare.
 */
/** This thread's refreshes seen before they are compared with the display's. */
const LOCAL_SAMPLES = 8;
/** How much slower than the display's this thread's refreshes may be and still be kept, as a fraction. */
const OFF_BEAT = 0.06;
/** The host's refreshes the beat's phase is read from: about a sixth of a second at 120 Hz. */
const BEAT_SAMPLES = 20;

/** Frames whose cost decides the stride. */
const COST_SAMPLES = 30;
/** Frames seen before the stride is lengthened. */
const SLOW_SAMPLES = 12;
/** A frame costing more than this share of its refreshes is too slow for them. */
const SLOW_FRAME = 0.75;
/** And less than this share of one fewer is cheap enough to take one fewer. */
const FAST_FRAME = 0.6;
/** How far off the measured interval the refreshes must come to be another display's, as a fraction. */
const NEW_DISPLAY = 0.15;
/** Times the interval is read again on its own result. */
const BEAT_PASSES = 3;
/** Refreshes apart the two an interval is read between must be, at least. */
const MIN_BEAT_SPAN = 6;
/**
 * The most refreshes a frame waits for a tick that has not sat in this
 * thread's queue (see `tick`): a frame is drawn on a stale one after
 * that, so a thread that is always behind still draws.
 */
const MAX_QUEUED_REFRESHES = 8;
/** How long, at least, between timing this thread's refreshes again once they were given up; see `retryLocal`. */
const RETRY_LOCAL_MS = 2000;
/** The most refreshes a frame is given: two, sixty at 120 Hz; slower than that is no smoother. */
const MAX_STRIDE = 2;

function localAnimationFrame(): ((callback: (time: number) => void) => number) | null {
  const host = globalThis as { requestAnimationFrame?: (callback: (time: number) => void) => number };
  return typeof host.requestAnimationFrame === 'function' ? host.requestAnimationFrame.bind(host) : null;
}

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
  /** This thread's own `requestAnimationFrame`, or null where there is none. */
  private local: ((callback: (time: number) => void) => number) | null;
  private localHandle: number | null = null;
  /** Whether the page is hidden, when this thread's refreshes do not come. */
  private hidden = false;
  private readonly timeOrigin: number;
  /** Gaps between this thread's own refreshes while frames ran back to back. */
  private readonly localIntervals: number[] = [];
  private lastLocalTime: number | null = null;
  /** How long the frame drawn at `lastLocalTime` took, which says whether the gap after it was the refresh's or the frame's. */
  private lastLocalCost = 0;
  /** The display's interval and the host's time origin, once the host has said. */
  private display: { readonly interval: number; readonly origin: number } | null = null;
  /**
   * Set once this thread's refreshes have shown they keep no display's
   * time: frames are then timed here, on the beat the host's refreshes
   * show (see \`displayInterval\`).
   */
  private locked = false;
  /** This thread's own `requestAnimationFrame` once given up, kept to see whether it keeps time after all. */
  private givenUp: ((callback: (time: number) => void) => number) | null = null;
  /** When this thread's refreshes were last timed again, and their times while they are being. */
  private lastRetry = -Infinity;
  private retrying: number[] | null = null;
  /** The host's recent refresh times, which give the beat its phase. */
  private readonly refreshes: number[] = [];
  /** Host refreshes since the last frame drawn on the beat. */
  private refreshesSinceFrame = 0;
  /** The refresh the last frame here was drawn for: a frame is never drawn for one twice. */
  private lastLocked = -Infinity;
  /** How long recent frames took here, which decides how many refreshes each one gets. */
  private readonly costs: number[] = [];
  /** Refreshes per frame on the beat: 1, or more when frames cost more than a refresh can hold. */
  private stride = 1;

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
    this.local = options.requestAnimationFrame === undefined ? localAnimationFrame() : options.requestAnimationFrame;
    this.timeOrigin = options.timeOrigin ?? (typeof performance !== 'undefined' ? performance.timeOrigin : 0);
  }

  /** Whether this clock is driving itself from the compositor. */
  get isLocal(): boolean {
    return this.local !== null;
  }

  requestFrame(): void {
    this.pending = true;
    if (this.local !== null) {
      if (this.hidden) {
        // No refresh is coming; a timer stands in for it.
        this.armTimer();
        return;
      }
      // The compositor is answering directly, so there is no host to
      // tell and no timer to arm: no message per refresh, and, on a page
      // that is shown, no fallback to pace, because a missing frame here
      // would mean the display itself had stopped.
      if (this.localHandle === null) {
        this.localHandle = this.local(time => {
          this.localHandle = null;
          // Drawn either way; the next frame is timed by the display's beat
          // if this refresh showed it keeps none.
          this.recordLocal(time);
          if (this.pending) {
            const started = this.now();
            this.deliver(time);
            this.lastLocalCost = this.now() - started;
          } else {
            this.lastLocalCost = 0;
          }
        });
      }
      return;
    }
    this.setActive(true);
    this.armTimer();
  }

  /**
   * The page was hidden or shown. While it is hidden this thread's own
   * refreshes stop, so a frame asked for is paced by the timer, as a
   * hosted clock is when its host stops ticking; one already waiting
   * for a refresh that will not come is handed to the timer.
   */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden && this.pending && this.local !== null) {
      this.armTimer();
    }
  }

  /**
   * Tells the clock the display's interval, measured on the host's own
   * refreshes, and the host's \`timeOrigin\`, which puts the host's frame
   * times on this thread's clock.
   *
   * A worker's own refreshes are not always the display's. WebKit's come
   * from a timer near 65 Hz that keeps no display's time: on a 120 Hz
   * MacBook its frames fell 15 to 16.4 ms apart, so each was shown after
   * one refresh, two or three, and a scroll juddered at a steady sixty.
   * Driving frames from the host's ticks instead put the host's thread in
   * every frame, and WebKit's is uneven while scrolling: at 120 a seventh
   * of the frames missed their refresh. So once this thread's refreshes
   * have shown they keep no display's time, frames follow the host's
   * refreshes, which are the only ones a worker's canvas is shown on in
   * WebKit anyway, with two differences from a plain hosted clock: each
   * frame is stamped with its refresh on the display's beat and on this
   * thread's clock, which is the clock a wheel step's time is on; and
   * frames too costly for one refresh are given an even two (see
   * \`recordCost\`).
   */
  displayInterval(ms: number, origin: number): void {
    if (ms > 0 && ms < MAX_CADENCE_MS) {
      this.display = { interval: ms, origin };
      this.compareLocal();
    }
  }

  /** Whether frames are timed here on the display's beat; see \`displayInterval\`. */
  get isDisplayLocked(): boolean {
    return this.locked;
  }

  private recordLocal(time: number): void {
    const previous = this.lastLocalTime;
    this.lastLocalTime = time;
    // Only gaps between frames that ran back to back measure the
    // refresh: a gap across an idle stretch measures the idleness. And
    // only after a frame that left room: one that took most of the gap
    // made the gap, and says how slow the frame was, not the refresh.
    // Counted, a scroll whose frames took 8 ms on a 165 Hz display gave
    // the refreshes up a second after `retryLocal` had taken them back.
    if (previous !== null && this.pending) {
      const interval = time - previous;
      if (interval > 0 && interval < MAX_CADENCE_MS && this.lastLocalCost < interval / 2) {
        this.localIntervals.push(interval);
        if (this.localIntervals.length > LOCAL_SAMPLES) {
          this.localIntervals.shift();
        }
      }
    }
    this.compareLocal();
  }

  /**
   * Gives this thread's refreshes up when they come well slower than the
   * display's: they cost frames, and in WebKit keep no display's beat
   * either. Faster than the display is left alone, because that is the
   * display the measurement was taken on going stale (a window dragged to
   * a faster screen), not a worker failing to keep up with it.
   */
  private compareLocal(): void {
    if (this.local === null || this.display === null || this.localIntervals.length < LOCAL_SAMPLES) {
      return;
    }
    const sorted = [...this.localIntervals].sort((a, b) => a - b);
    const ratio = sorted[Math.floor(sorted.length / 2)]! / this.display.interval;
    if (ratio <= 1 + OFF_BEAT) {
      return;
    }
    this.givenUp = this.local;
    this.local = null;
    this.locked = true;
  }

  /**
   * Times this thread's own refreshes again, now and then, once they were
   * given up, and takes them back if they keep the display's time.
   *
   * Given up for good, a worker's refreshes stayed given up whatever had
   * made them slow. A Chrome worker busy between its frames, opening a
   * large file or scrolling through lines it has never drawn, refreshes
   * late and unevenly, which no measure of the gaps alone told from
   * WebKit's timer: 5.5, 25.5, 10.9, 25 ms on a 165 Hz display one time,
   * 12.1, 6.1, 12.2, 24.2 the next. Its frames then went through the
   * host's ticks for as long as the page was open, a message and a hop
   * through the page's thread each. Timed again while frames are cheap,
   * they come a refresh apart and are taken back; WebKit's come 15 ms
   * apart on a 120 Hz display however idle the thread is, and stay given
   * up. Nine refreshes every two seconds or more, while frames come cheap.
   */
  private retryLocal(interval: number): void {
    if (this.givenUp === null || this.hidden || this.costs.length < SLOW_SAMPLES) {
      return;
    }
    // One under way is waited for, but not for ever: a page hidden during it stops its refreshes.
    const now = this.now();
    if (now - this.lastRetry < RETRY_LOCAL_MS) {
      return;
    }
    const sorted = [...this.costs].sort((a, b) => a - b);
    if (sorted[Math.floor(sorted.length / 2)]! > interval * FAST_FRAME) {
      return;
    }
    this.lastRetry = now;
    const local = this.givenUp;
    const times: number[] = [];
    this.retrying = times;
    const step = (time: number): void => {
      if (this.retrying !== times) {
        return;
      }
      times.push(time);
      if (times.length <= LOCAL_SAMPLES) {
        local(step);
        return;
      }
      this.retrying = null;
      const gaps = times
        .slice(1)
        .map((value, index) => value - times[index]!)
        .sort((a, b) => a - b);
      if (this.givenUp === null || this.display === null || gaps[Math.floor(gaps.length / 2)]! / this.display.interval > 1 + OFF_BEAT) {
        return;
      }
      this.local = this.givenUp;
      this.givenUp = null;
      this.locked = false;
      this.localIntervals.length = 0;
      this.lastLocalTime = null;
      this.costs.length = 0;
      this.stride = 1;
      this.clearFallback();
      this.setActive(false);
      if (this.pending) {
        this.requestFrame();
      }
    };
    local(step);
  }

  /** A time on the host's clock, on this thread's. */
  private toLocal(host: number): number {
    return this.display === null ? host : host - this.timeOrigin + this.display.origin;
  }

  /**
   * When the display's refreshes start, on the host's clock: the earliest
   * in phase of the host's recent refresh times, since a host's callback
   * can only run late, never early.
   */
  private beat(): { readonly start: number; readonly interval: number } | null {
    if (this.display === null || this.refreshes.length === 0) {
      return null;
    }
    // Roughly: the interval measured at start, unless the refreshes now come
    // at another rate (a window dragged from a 120 Hz screen to a 165 Hz one).
    const cadence = this.cadenceMs();
    let interval =
      cadence !== null && Math.abs(cadence - this.display.interval) > this.display.interval * NEW_DISPLAY
        ? cadence
        : this.display.interval;
    // Exactly: between the most punctual refresh of the older half and of the
    // newer, a callback that ran late being the only kind there is. Which is
    // most punctual depends on the interval it is judged by, so the reading
    // is taken again on its own result until it settles.
    for (let pass = 0; pass < BEAT_PASSES; pass++) {
      interval = this.refineInterval(interval);
    }
    const latest = this.refreshes[this.refreshes.length - 1]!;
    let earliest = Infinity;
    for (const time of this.refreshes) {
      let residual = (((time - latest) % interval) + interval) % interval;
      // Past half an interval is earlier in phase, not later.
      if (residual > interval / 2) {
        residual -= interval;
      }
      earliest = Math.min(earliest, residual);
    }
    return { start: latest + earliest, interval };
  }

  /** The interval between the most punctual early and late refreshes, judged by `rough`. */
  private refineInterval(rough: number): number {
    // Each refresh is counted from the one before it, which a rough interval
    // gets right; counted from the first, its error would add up.
    const half = Math.floor(this.refreshes.length / 2);
    const first = this.refreshes[0]!;
    let early: { index: number; residual: number; time: number } | null = null;
    let late: { index: number; residual: number; time: number } | null = null;
    let index = 0;
    for (let i = 0; i < this.refreshes.length; i++) {
      const time = this.refreshes[i]!;
      if (i > 0) {
        index += Math.max(1, Math.round((time - this.refreshes[i - 1]!) / rough));
      }
      const residual = time - first - index * rough;
      if (i < half) {
        if (early === null || residual < early.residual) early = { index, residual, time };
      } else if (late === null || residual < late.residual) {
        late = { index, residual, time };
      }
    }
    return early !== null && late !== null && late.index - early.index >= MIN_BEAT_SPAN
      ? (late.time - early.time) / (late.index - early.index)
      : rough;
  }

  /**
   * Draws the frame a host refresh asked for, stamped with that refresh on
   * the display's beat rather than with when its callback happened to run,
   * and on this thread's clock.
   */
  private deliverOnBeat(time: number): void {
    const beat = this.beat()!;
    const since = (((time - beat.start) % beat.interval) + beat.interval) % beat.interval;
    let refresh = time - since;
    // Never a refresh already drawn for, nor fewer than a stride after it.
    while (refresh < this.lastLocked + (this.stride - 0.5) * beat.interval) {
      refresh += beat.interval;
    }
    this.lastLocked = refresh;
    this.refreshesSinceFrame = 0;
    const started = this.now();
    this.deliver(this.toLocal(refresh));
    this.recordCost(this.now() - started, beat.interval);
    this.retryLocal(beat.interval);
  }

  /**
   * Keeps the stride to what frames cost: every refresh while the typical
   * frame fits in most of one, two once it no longer does. Decided by the
   * typical frame, not the slow ones: a slow frame (a few rows mounted at
   * once) shown a refresh late is a moment's hitch, where two refreshes a
   * frame for a whole scroll halves the rate. Ruled by the slow quarter,
   * a 165 Hz display drew at 82 with its typical frame in half a refresh.
   */
  private recordCost(cost: number, interval: number): void {
    this.costs.push(cost);
    if (this.costs.length > COST_SAMPLES) {
      this.costs.shift();
    }
    if (this.costs.length < SLOW_SAMPLES) {
      return;
    }
    const sorted = [...this.costs].sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length / 2)]!;
    if (typical > interval * this.stride * SLOW_FRAME && this.stride < MAX_STRIDE) {
      this.stride++;
      this.costs.length = 0;
    } else if (
      this.stride > 1 &&
      this.costs.length >= COST_SAMPLES &&
      typical < interval * (this.stride - 1) * FAST_FRAME
    ) {
      // Back to one fewer once the typical frame has fitted for a while:
      // a cost near the line would otherwise change the pace back and
      // forth mid-scroll.
      this.stride--;
      this.costs.length = 0;
    }
  }

  /** Refreshes per frame while timed on the display's beat; see \`recordCost\`. */
  get displayStride(): number {
    return this.stride;
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
        this.deliver(this.locked ? this.now() : this.hostTime());
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
    // The local handle is deliberately left armed. There is no way to
    // cancel it without the matching `cancelAnimationFrame`, and one
    // refresh that finds nothing pending costs a comparison, which is
    // what `tick` already does for the hosted path.
    this.clearFallback();
    if (this.local === null) {
      this.setActive(false);
    }
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
    if (this.locked && this.display !== null) {
      this.refreshes.push(time);
      if (this.refreshes.length > BEAT_SAMPLES) {
        this.refreshes.shift();
      }
      this.refreshesSinceFrame++;
      if (this.pending) {
        this.clearFallback();
        this.idleTicks = 0;
        // A tick that sat in this thread's queue, behind a frame that took
        // longer than a refresh, is passed over while one has not: what is
        // queued with it is let through first. The queue alternates ticks
        // and the pointer's moves, and drawing on each tick let one move
        // through a frame, so a scrollbar thumb dragged through a large
        // file, at 15 ms a frame on a 165 Hz display, fell a second behind
        // the pointer and went on scrolling after it stopped.
        const queued = this.now() - this.toLocal(time) > this.display.interval;
        if (this.refreshesSinceFrame >= this.stride && (!queued || this.refreshesSinceFrame >= MAX_QUEUED_REFRESHES)) {
          this.deliverOnBeat(time);
        }
        return;
      }
    }
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
