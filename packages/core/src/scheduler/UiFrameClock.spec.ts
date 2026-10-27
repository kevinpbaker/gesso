import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UiAnimationFrameClock, UiHostFrameClock, UiManualFrameClock, UiTimerFrameClock } from './UiFrameClock';

describe('UiAnimationFrameClock', () => {
  let frameCallback: ((time: number) => void) | null = null;

  function stubAnimationFrame(): {
    raf: ReturnType<typeof vi.fn>;
    cancelAnimationFrame: ReturnType<typeof vi.fn>;
  } {
    frameCallback = null;
    const raf = vi.fn<(callback: (time: number) => void) => number>(callback => {
      frameCallback = callback;
      return 7;
    });
    const cancelAnimationFrame = vi.fn<(handle: number) => void>();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    return { raf, cancelAnimationFrame };
  }

  function fireFrame(time = 123): void {
    const callback = frameCallback;
    if (callback === null) {
      throw new Error('No frame callback captured.');
    }
    frameCallback = null;
    callback(time);
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when requestAnimationFrame is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    expect(() => new UiAnimationFrameClock(() => {})).toThrow(
      'requestAnimationFrame is not available in this environment.'
    );
  });

  it('arms a frame on requestFrame', () => {
    const { raf } = stubAnimationFrame();
    const clock = new UiAnimationFrameClock(() => {});
    clock.requestFrame();
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('invokes onFrame with the frame time', () => {
    const onFrame = vi.fn();
    stubAnimationFrame();
    const clock = new UiAnimationFrameClock(onFrame);
    clock.requestFrame();
    fireFrame();
    expect(onFrame).toHaveBeenCalledWith(123);
  });

  it('ignores a second request while a frame is pending', () => {
    const { raf } = stubAnimationFrame();
    const clock = new UiAnimationFrameClock(() => {});
    clock.requestFrame();
    clock.requestFrame();
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending frame', () => {
    const { cancelAnimationFrame } = stubAnimationFrame();
    const clock = new UiAnimationFrameClock(() => {});
    clock.requestFrame();
    clock.cancelFrame();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });

  it('arms again after the frame completes', () => {
    const { raf } = stubAnimationFrame();
    const clock = new UiAnimationFrameClock(() => {});
    clock.requestFrame();
    fireFrame();
    clock.requestFrame();
    expect(raf).toHaveBeenCalledTimes(2);
  });
});

describe('UiTimerFrameClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes onFrame after the interval', () => {
    const onFrame = vi.fn();
    const clock = new UiTimerFrameClock(onFrame, { intervalMs: 16, now: () => 100 });
    clock.requestFrame();
    expect(onFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(onFrame).toHaveBeenCalledWith(100);
  });

  it('ignores a second request while a frame is pending', () => {
    const onFrame = vi.fn();
    const clock = new UiTimerFrameClock(onFrame, { intervalMs: 16, now: () => 0 });
    clock.requestFrame();
    clock.requestFrame();
    vi.advanceTimersByTime(16);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending frame', () => {
    const onFrame = vi.fn();
    const clock = new UiTimerFrameClock(onFrame, { intervalMs: 16, now: () => 0 });
    clock.requestFrame();
    clock.cancelFrame();
    vi.advanceTimersByTime(32);
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('arms again after a frame completes', () => {
    const onFrame = vi.fn();
    const clock = new UiTimerFrameClock(onFrame, { intervalMs: 16, now: () => 0 });
    clock.requestFrame();
    vi.advanceTimersByTime(16);
    clock.requestFrame();
    vi.advanceTimersByTime(16);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });
});

describe('UiManualFrameClock', () => {
  it('arms on requestFrame', () => {
    const clock = new UiManualFrameClock(() => {});
    clock.requestFrame();
    expect(clock.isPending).toBe(true);
  });

  it('delivers the tick to onFrame', () => {
    const onFrame = vi.fn();
    const clock = new UiManualFrameClock(onFrame);
    clock.requestFrame();
    clock.tick(42);
    expect(onFrame).toHaveBeenCalledWith(42);
    expect(clock.isPending).toBe(false);
  });

  it('throws when ticked without a pending frame', () => {
    const clock = new UiManualFrameClock(() => {});
    expect(() => clock.tick(0)).toThrow('No frame is pending.');
  });

  it('clears a pending frame on cancelFrame', () => {
    const clock = new UiManualFrameClock(() => {});
    clock.requestFrame();
    clock.cancelFrame();
    expect(clock.isPending).toBe(false);
  });

  it('re-arms after a tick', () => {
    const onFrame = vi.fn();
    const clock = new UiManualFrameClock(onFrame);
    clock.requestFrame();
    clock.tick(0);
    clock.requestFrame();
    clock.tick(1);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });
});

describe('UiHostFrameClock', () => {
  /** A clock whose fallback timer is long enough never to fire by accident. */
  function hosted(): {
    clock: UiHostFrameClock;
    frames: number[];
    active: boolean[];
  } {
    const frames: number[] = [];
    const active: boolean[] = [];
    const clock = new UiHostFrameClock(
      time => frames.push(time),
      running => active.push(running),
      { fallbackMs: 100000 }
    );
    return { clock, frames, active };
  }

  /** A clock with a compositor of its own, as a dedicated worker has. */
  function local(): {
    clock: UiHostFrameClock;
    frames: number[];
    active: boolean[];
    refresh: (time: number) => void;
    armed: () => number;
  } {
    const frames: number[] = [];
    const active: boolean[] = [];
    const callbacks: ((time: number) => void)[] = [];
    const clock = new UiHostFrameClock(
      time => frames.push(time),
      running => active.push(running),
      {
        fallbackMs: 100000,
        requestAnimationFrame: callback => {
          callbacks.push(callback);
          return callbacks.length;
        }
      }
    );
    return {
      clock,
      frames,
      active,
      refresh: time => callbacks.shift()?.(time),
      armed: () => callbacks.length
    };
  }

  it('drives itself from the compositor where the thread has one', () => {
    // A dedicated worker has had `requestAnimationFrame` since Chrome
    // 69, Firefox 99 and Safari 16.4. Where it does, the host is not
    // in the frame path at all.
    const { clock, frames, refresh } = local();
    clock.requestFrame();
    refresh(1234.5);
    expect(frames).toEqual([1234.5]);
    expect(clock.isLocal).toBe(true);
  });

  it('never asks the host for ticks when it has its own', () => {
    // The saving is a whole message per refresh, which at 60Hz is the
    // difference between the shell running a loop for the worker and
    // the shell doing nothing at all.
    const { clock, active, refresh } = local();
    clock.requestFrame();
    refresh(16);
    clock.requestFrame();
    refresh(32);
    clock.cancelFrame();
    expect(active).toEqual([]);
  });

  it('drops a refresh that finds nothing pending', () => {
    const { clock, frames, refresh } = local();
    clock.requestFrame();
    refresh(16);
    clock.cancelFrame();
    // The armed callback cannot be cancelled without the matching
    // `cancelAnimationFrame`, so it fires and finds nothing to do.
    refresh(32);
    expect(frames).toEqual([16]);
  });

  it('arms one callback per frame, not one per request', () => {
    const { clock, refresh, armed } = local();
    clock.requestFrame();
    clock.requestFrame();
    clock.requestFrame();
    expect(armed()).toBe(1);
    refresh(16);
    expect(armed()).toBe(0);
  });

  it('keeps drawing from its own compositor while the host thread is blocked', () => {
    // The local path arms no timer at all, and that is deliberate
    // rather than an omission. This spec exists because the omission
    // reading is the tempting one: the hosted path below grew a
    // watchdog for a symptom described exactly this way — "the worker
    // stops drawing when the main thread is blocked" — and the obvious
    // next move is to add the same watchdog here.
    //
    // It would be wrong. The compositor answers *this* thread, so a
    // host that never ticks is not in the frame path to stall, and a
    // watchdog here would fire against a worker that is drawing
    // perfectly well. Measured in a browser before this was written:
    // with something animating throughout, a five-second block of the
    // shell's thread leaves the worker drawing 77 frames.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      const active: boolean[] = [];
      const callbacks: ((time: number) => void)[] = [];
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        running => active.push(running),
        {
          fallbackMs: 16,
          stallMs: 100,
          requestAnimationFrame: callback => {
            callbacks.push(callback);
            return callbacks.length;
          }
        }
      );

      // A compositor's timestamps, deliberately not on the same origin
      // as the fake wall clock. A frame delivered by a timer would
      // carry `hostTime()`, which under fake timers advances in step
      // with `advanceTimersByTime` and would otherwise be indis-
      // tinguishable from a real refresh.
      const refreshAt = (frame: number): number => 900_000 + frame * 16;

      // Five seconds at 60Hz with no host tick at any point. Time
      // passes between every refresh, so a fallback or a watchdog
      // would have had three hundred chances to fire.
      const expected: number[] = [];
      for (let frame = 1; frame <= 300; frame++) {
        clock.requestFrame();
        // The assertion this spec turns on: asking for a frame on the
        // local path arms nothing that can go off. A watchdog added
        // here fails on the first iteration, before any timing
        // coincidence can hide it.
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(16);
        callbacks.shift()!(refreshAt(frame));
        expected.push(refreshAt(frame));
      }

      // Every frame came from the compositor, in order, and none from
      // a timer standing in for a host that never spoke.
      expect(frames).toEqual(expected);
      // And the host was never asked to start ticking on this clock's
      // behalf, blocked or not.
      expect(active).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('paces a frame by a timer on a hidden page, whose refreshes do not come', () => {
    // Found in Easel with Chrome behind another window: the language
    // worker answered a request in a tenth of a second, and the answer,
    // a channel patch waiting for a frame, never reached the code
    // awaiting it, because the worker's refreshes had stopped.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      const active: boolean[] = [];
      const callbacks: ((time: number) => void)[] = [];
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        running => active.push(running),
        {
          fallbackMs: 16,
          now: () => Date.now(),
          requestAnimationFrame: callback => {
            callbacks.push(callback);
            return callbacks.length;
          }
        }
      );

      // Asked for while shown, and hidden before the refresh came.
      clock.requestFrame();
      clock.setHidden(true);
      vi.advanceTimersByTime(16);
      expect(frames).toHaveLength(1);

      // Asked for while hidden.
      clock.requestFrame();
      vi.advanceTimersByTime(16);
      expect(frames).toHaveLength(2);
      // The host is not asked to tick: its refreshes stop as well.
      expect(active).toEqual([]);

      // Shown again: the refreshes are the clock once more, the one asked
      // for before the page was hidden drawing what is asked for now.
      clock.setHidden(false);
      clock.requestFrame();
      expect(vi.getTimerCount()).toBe(0);
      expect(callbacks).toHaveLength(1);
      callbacks.shift()!(5000);
      expect(frames).toHaveLength(3);
      expect(frames[2]).toBe(5000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the host where the thread has no compositor of its own', () => {
    // An older browser, or a nested worker on Chromium.
    const { clock, frames, active } = hosted();
    expect(clock.isLocal).toBe(false);
    clock.requestFrame();
    expect(active).toEqual([true]);
    clock.tick(1234.5);
    expect(frames).toEqual([1234.5]);
  });

  it('delivers the host tick, on the host clock', () => {
    // The timestamp matters as much as the beat: a forwarded rAF time
    // keeps the runtime's frame times on the same clock the display
    // is on, which is what makes a frame budget comparable to a
    // refresh interval.
    const { clock, frames } = hosted();
    clock.requestFrame();
    clock.tick(1234.5);
    expect(frames).toEqual([1234.5]);
  });

  it('asks the host to keep ticking, and to stop when nobody wants one', () => {
    // Free-running while frames are wanted, rather than one tick per
    // request: a request that reaches the host after that refresh's
    // callback has run would wait for the next one, halving the rate.
    const { clock, active } = hosted();
    clock.requestFrame();
    expect(active).toEqual([true]);

    // A second request while one is pending is not a second start.
    clock.requestFrame();
    expect(active).toEqual([true]);

    // Not stopped the instant the frame ends: something animating
    // slower than the display asks again a moment later, and the loop
    // waits a few refreshes rather than being torn down and rebuilt.
    clock.tick(0);
    expect(active).toEqual([true]);
    for (let i = 0; i < 4; i++) {
      clock.tick(i);
    }
    expect(active).toEqual([true, false]);
  });

  it('keeps the loop running when the frame armed the next one', () => {
    // The animating case: `onFrame` runs the frame and anything still
    // moving arms the next from inside it, so whether the loop goes on
    // can only be answered after the frame, not before.
    const frames: number[] = [];
    const active: boolean[] = [];
    let clock!: UiHostFrameClock;
    clock = new UiHostFrameClock(
      time => {
        frames.push(time);
        if (frames.length < 3) {
          clock.requestFrame();
        }
      },
      running => active.push(running),
      { fallbackMs: 100000 }
    );
    clock.requestFrame();
    clock.tick(0);
    clock.tick(6);
    clock.tick(12);
    expect(frames).toEqual([0, 6, 12]);
    // Started once and never renegotiated: the whole point of a
    // free-running loop is that a continuously animating app exchanges
    // one message about pacing, not one per frame.
    expect(active).toEqual([true]);
  });

  it('drops a tick nobody asked for, and stops the loop', () => {
    const { clock, frames, active } = hosted();
    clock.tick(0);
    expect(frames).toEqual([]);
    expect(active).toEqual([]);

    clock.requestFrame();
    clock.tick(1);
    clock.tick(2);
    expect(frames).toEqual([1]);
    // Still running: one unwanted refresh is patience, not idleness.
    expect(active).toEqual([true]);
    for (let i = 0; i < 4; i++) {
      clock.tick(i);
    }
    expect(active).toEqual([true, false]);

    // And a request during the patient stretch never speaks to the
    // host at all, which is what removes the churn.
    clock.requestFrame();
    clock.tick(20);
    expect(frames).toEqual([1, 20]);
    expect(active).toEqual([true, false, true]);
  });

  it('paces itself until a real tick proves the host forwards them', () => {
    // The capability is never negotiated — the first tick is the only
    // evidence it exists. A host that forwards nothing must therefore
    // be no worse than the timer this replaced, not a frozen app.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        () => {},
        { fallbackMs: 16, now: () => 99 }
      );
      clock.requestFrame();
      vi.advanceTimersByTime(16);
      expect(frames).toEqual([99]);

      // Once a tick has arrived the timer stops *pacing* and becomes a
      // watchdog: a display-paced app is not running a timer per frame,
      // because every tick clears it before it can fire.
      clock.requestFrame();
      clock.tick(500);
      clock.requestFrame();
      vi.advanceTimersByTime(50);
      clock.tick(516);
      vi.advanceTimersByTime(50);
      expect(frames).toEqual([99, 500, 516]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes back to pacing itself when a host that was ticking goes quiet', () => {
    // The case the whole architecture exists for: the shell's thread is
    // busy, so no forwarded refresh arrives. Frames stopping then would
    // mean a render worker frozen by main-thread work, which is exactly
    // what it is supposed to be immune to.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      let now = 0;
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        () => {},
        { fallbackMs: 16, stallMs: 100, now: () => now }
      );

      // A live host: ticks arrive and the watchdog never fires.
      clock.requestFrame();
      clock.tick(0);
      clock.requestFrame();
      vi.advanceTimersByTime(90);
      expect(frames).toEqual([0]);

      // Now it stops answering. One watchdog interval later this clock
      // draws the frame the host did not ask for.
      now = 100;
      vi.advanceTimersByTime(20);
      expect(frames).toEqual([0, 100]);

      // And keeps pacing at the fallback interval while the quiet
      // lasts, rather than waiting a whole watchdog per frame.
      clock.requestFrame();
      now = 116;
      vi.advanceTimersByTime(16);
      expect(frames).toEqual([0, 100, 116]);

      // The host comes back; its cadence takes over again and the timer
      // returns to watching.
      clock.requestFrame();
      clock.tick(132);
      clock.requestFrame();
      vi.advanceTimersByTime(90);
      expect(frames).toEqual([0, 100, 116, 132]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('watches at the display it has been shown, not at a fixed ceiling', () => {
    // The ceiling is what it waits before it knows the cadence. Once
    // refreshes have been arriving, a stall costs about a frame rather
    // than a tenth of a second — which on a 60Hz panel is the
    // difference between one dropped frame and six.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      let now = 0;
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        () => {},
        { fallbackMs: 16, stallMs: 100, minStallMs: 12, now: () => now }
      );

      // Four refreshes at 16 ms: a 60Hz host, plainly stated.
      for (let i = 0; i < 5; i++) {
        now = i * 16;
        clock.requestFrame();
        clock.tick(i * 16);
      }
      clock.requestFrame();

      // Nothing at 30 ms, which is inside the two refreshes a live
      // host is allowed, so still watching.
      now = 64 + 30;
      vi.advanceTimersByTime(30);
      expect(frames).toHaveLength(5);

      // And drawn two refreshes after the last tick, not at the ceiling.
      now = 64 + 33;
      vi.advanceTimersByTime(3);
      expect(frames).toHaveLength(6);
      expect(frames.at(-1)).toBe(97);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not learn a cadence from the gap a stall left behind', () => {
    // The tick that ends a stall is a second apart from the one before
    // it. Treating that as the display's interval would set the watch a
    // second wide and make the next stall invisible.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      let now = 0;
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        () => {},
        { fallbackMs: 16, stallMs: 100, minStallMs: 12, now: () => now }
      );

      clock.requestFrame();
      clock.tick(0);
      clock.requestFrame();
      clock.tick(16);
      // A second of silence, then the host returns.
      clock.requestFrame();
      clock.tick(1016);
      clock.requestFrame();

      // Back to the ceiling, because the only intervals it now has are
      // none: the outlier cleared them rather than being averaged in.
      now = 1116;
      vi.advanceTimersByTime(99);
      expect(frames).toHaveLength(3);
      vi.advanceTimersByTime(2);
      expect(frames).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is not widened by one late refresh', () => {
    // The case that made this a median rather than a maximum: a page
    // doing something expensive in its own rAF delays one tick, and
    // taking the widest gap would then wait twice *that* before
    // noticing the next stall — a quarter of a second, measured.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      let now = 0;
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        () => {},
        { fallbackMs: 16, stallMs: 100, minStallMs: 12, now: () => now }
      );

      // Five refreshes at 16 ms with one 45 ms hitch in the middle.
      const times = [0, 16, 32, 77, 93, 109];
      for (const time of times) {
        now = time;
        clock.requestFrame();
        clock.tick(time);
      }
      clock.requestFrame();

      // The median is still 16, so the watch is ~32 and not ~90.
      now = 109 + 25;
      vi.advanceTimersByTime(25);
      expect(frames).toHaveLength(times.length);
      now = 109 + 40;
      vi.advanceTimersByTime(15);
      expect(frames).toHaveLength(times.length + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call a live 60Hz host stalled when its ticks jitter', () => {
    // The bug this guards. The watchdog was one refresh wide, and the
    // runtime asks for its next frame from inside the frame the tick
    // delivered, not after that frame's work — so the deadline fell
    // microseconds after the next tick was due and the race was
    // decided by the jitter on one `postMessage`. On a 60Hz panel it
    // fired on a large share of frames; on a 165Hz one the `minStall`
    // floor already bought two refreshes and hid it, which is why
    // scrolling was smooth on one monitor and ran at a third of the
    // rate on the other.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      let now = 0;
      let request = (): void => {};
      const clock = new UiHostFrameClock(
        time => {
          frames.push(time);
          // Where the runtime asks: inside the frame, before its work.
          request();
        },
        () => {},
        { fallbackMs: 16, stallMs: 100, minStallMs: 12, now: () => now }
      );
      request = () => clock.requestFrame();
      clock.requestFrame();

      // A 60Hz display forwarded across a port that adds a little to
      // each arrival, which is every real render worker.
      const jitter = [0, 1.5, 0.4, 2.1, 0.8, 1.2, 0.3, 1.9, 0.6, 1.1];
      const ticks = jitter.map((_, i) => i * 16.7);
      for (const [i, tick] of ticks.entries()) {
        const arrival = tick + jitter[i]!;
        vi.advanceTimersByTime(arrival - now);
        now = arrival;
        clock.tick(tick);
      }

      // Every frame came from a tick and none from the timer.
      expect(frames).toEqual(ticks);
    } finally {
      vi.useRealTimers();
    }
  });

  it('paces a stalled host on the host clock rather than its own', () => {
    // A worker's `performance.now()` counts from the worker's own
    // creation, so it trails the shell's timestamps by the page's age
    // at that moment. A raw local reading delivered in among host ones
    // reads downstream as a jump backwards through time, and the
    // runtime answers that by arming its next animation wake-up the
    // whole offset away: one self-paced frame stops a scroll spring
    // being advanced for as long as the worker is young.
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      // This thread's clock, five seconds behind the host's.
      let now = 0;
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        () => {},
        { fallbackMs: 16, stallMs: 100, minStallMs: 12, now: () => now }
      );

      for (let i = 0; i < 5; i++) {
        now = i * 16;
        clock.requestFrame();
        clock.tick(5000 + i * 16);
      }
      clock.requestFrame();

      // The host goes quiet and the watchdog draws two refreshes later.
      now = 64 + 33;
      vi.advanceTimersByTime(33);
      expect(frames).toHaveLength(6);
      // On the host's timeline, so the frame after the last tick is
      // later than it rather than five seconds earlier.
      expect(frames.at(-1)).toBe(5097);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending frame and its fallback', () => {
    vi.useFakeTimers();
    try {
      const frames: number[] = [];
      const clock = new UiHostFrameClock(
        time => frames.push(time),
        () => {},
        { fallbackMs: 16 }
      );
      clock.requestFrame();
      clock.cancelFrame();
      vi.advanceTimersByTime(10000);
      expect(frames).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('UiHostFrameClock on the display beat', () => {
  // WebKit: a worker's refreshes come from a timer near 65 Hz that keeps no
  // display's time, while the page's refreshes follow a 120 Hz display.
  const INTERVAL = 1000 / 120;

  function lockedClock() {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const frames: number[] = [];
    const callbacks: ((time: number) => void)[] = [];
    let continuous = false;
    const clock: UiHostFrameClock = new UiHostFrameClock(
      time => {
        frames.push(time);
        // A scroll under way asks for its next frame while drawing this one.
        if (continuous) clock.requestFrame();
      },
      () => {},
      {
        fallbackMs: 100000,
        now: () => Date.now(),
        timeOrigin: 0,
        requestAnimationFrame: callback => {
          callbacks.push(callback);
          return callbacks.length;
        }
      }
    );
    clock.displayInterval(INTERVAL, 0);
    // Nine of the worker's own refreshes, 15.4 ms apart, frames back to back.
    for (let k = 0; k < 9; k++) {
      clock.requestFrame();
      vi.setSystemTime(100 + k * 15.4);
      callbacks.shift()?.(100 + k * 15.4);
    }
    return { clock, frames, callbacks, scroll: () => (continuous = true) };
  }

  afterEach(() => vi.useRealTimers());

  it("gives up a worker's refreshes that keep no display's time", () => {
    const { clock } = lockedClock();
    expect(clock.isLocal).toBe(false);
    expect(clock.isDisplayLocked).toBe(true);
  });

  it('draws a frame just after every display refresh, however late the host says so', () => {
    const { clock, frames, scroll } = lockedClock();
    vi.setSystemTime(1000);
    frames.length = 0;
    scroll();
    clock.requestFrame();
    // The display refreshes at 1000 + k * INTERVAL; the host's callback for
    // each runs up to 3 ms late.
    for (let k = 0; k < 40; k++) {
      const late = (k * 7) % 4 === 0 ? 3 : (k % 3) * 0.4;
      vi.advanceTimersByTime(Math.max(0, 1000 + k * INTERVAL + late - Date.now()));
      clock.tick(1000 + k * INTERVAL + late);
    }
    // Once the beat is known, each frame is stamped with a refresh's time,
    // one refresh after the last: never a late callback's, none skipped.
    const settled = frames.slice(6);
    expect(settled.length).toBeGreaterThan(30);
    for (const time of settled) {
      const phase = (time - 1000) / INTERVAL;
      expect(Math.abs(phase - Math.round(phase))).toBeLessThan(0.02);
    }
    for (let k = 1; k < settled.length; k++) {
      expect(Math.round((settled[k]! - settled[k - 1]!) / INTERVAL)).toBe(1);
    }
  });

  it('passes over a tick that waited behind a slow frame, and draws on the next that did not', () => {
    const { clock, frames } = lockedClock();
    frames.length = 0;
    clock.requestFrame();
    // Three refreshes' ticks, handled together once a long frame let them through.
    vi.setSystemTime(2000 + 3.5 * INTERVAL);
    for (let k = 0; k < 3; k++) clock.tick(2000 + k * INTERVAL);
    expect(frames).toEqual([]);
    // The refresh after: handled as it comes.
    clock.tick(2000 + 3 * INTERVAL);
    expect(frames.length).toBe(1);
  });

  it('draws on a waiting tick in the end, when every tick has waited', () => {
    const { clock, frames } = lockedClock();
    frames.length = 0;
    clock.requestFrame();
    for (let k = 0; k < 8; k++) {
      vi.setSystemTime(3000 + (k + 2) * INTERVAL);
      clock.tick(3000 + k * INTERVAL);
    }
    expect(frames.length).toBe(1);
  });

  /** Cheap frames on the host's ticks until this thread's refreshes are timed again, which they then are, `gap` apart. */
  function retried(gap: number) {
    const { clock, callbacks, scroll } = lockedClock();
    scroll();
    clock.requestFrame();
    let time = 4000;
    for (let k = 0; k < 20; k++) {
      time = 4000 + k * INTERVAL;
      vi.setSystemTime(time + 0.2);
      clock.tick(time);
    }
    expect(callbacks.length).toBeGreaterThan(0);
    for (let k = 1; k <= 9; k++) {
      vi.setSystemTime(time + k * gap);
      callbacks.shift()?.(time + k * gap);
    }
    return clock;
  }

  it("takes its own refreshes back once they keep the display's time", () => {
    // Chrome: given up while the worker was busy, a refresh apart once it is not.
    const clock = retried(INTERVAL);
    expect(clock.isLocal).toBe(true);
    expect(clock.isDisplayLocked).toBe(false);
  });

  it('leaves them given up while they keep none', () => {
    // WebKit: a timer near 65 Hz however idle the worker is.
    const clock = retried(15.4);
    expect(clock.isLocal).toBe(false);
    expect(clock.isDisplayLocked).toBe(true);
  });

  it('keeps its own refreshes when its frames are what is slow', () => {
    // Chrome at 165 Hz, a scroll whose frames take 8 ms: drawn on every other refresh.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const callbacks: ((time: number) => void)[] = [];
    const clock: UiHostFrameClock = new UiHostFrameClock(
      () => {
        vi.setSystemTime(Date.now() + 8);
        clock.requestFrame();
      },
      () => {},
      {
        now: () => Date.now(),
        timeOrigin: 0,
        requestAnimationFrame: callback => {
          callbacks.push(callback);
          return callbacks.length;
        }
      }
    );
    clock.displayInterval(1000 / 165, 0);
    clock.requestFrame();
    for (let k = 0; k < 12; k++) {
      // The next refresh after the frame ends.
      const at = Math.ceil(Date.now() / (1000 / 165)) * (1000 / 165);
      vi.setSystemTime(at);
      callbacks.shift()?.(at);
    }
    expect(clock.isLocal).toBe(true);
    expect(clock.isDisplayLocked).toBe(false);
  });

  it('keeps its own refreshes when they are faster than the display it was told of', () => {
    // A window dragged from a 60 Hz screen to a 165 Hz one: the measurement is stale, not the worker slow.
    vi.useFakeTimers();
    const callbacks: ((time: number) => void)[] = [];
    const clock = new UiHostFrameClock(
      () => {},
      () => {},
      {
        now: () => Date.now(),
        timeOrigin: 0,
        requestAnimationFrame: callback => {
          callbacks.push(callback);
          return callbacks.length;
        }
      }
    );
    clock.displayInterval(1000 / 60, 0);
    for (let k = 0; k < 12; k++) {
      clock.requestFrame();
      callbacks.shift()?.(100 + k * (1000 / 165));
    }
    expect(clock.isLocal).toBe(true);
    expect(clock.isDisplayLocked).toBe(false);
  });

  it('gives frames too costly for one refresh an even two', () => {
    const { clock, frames, scroll } = lockedClock();
    vi.setSystemTime(1000);
    frames.length = 0;
    scroll();
    // Each frame takes 7 ms of an 8.3 ms refresh.
    const costly = frames.push.bind(frames);
    frames.push = (...times: number[]) => {
      vi.setSystemTime(Date.now() + 7);
      return costly(...times);
    };
    clock.requestFrame();
    for (let k = 0; k < 80; k++) {
      vi.advanceTimersByTime(Math.max(0, 1000 + k * INTERVAL - Date.now()));
      clock.tick(1000 + k * INTERVAL);
    }
    expect(clock.displayStride).toBe(2);
    const late = frames.slice(-20);
    for (let k = 1; k < late.length; k++) {
      expect(Math.round((late[k]! - late[k - 1]!) / INTERVAL)).toBe(2);
    }
  });

  it('follows the display it is on now, not the one it was measured on', () => {
    // Measured at 120 Hz as the app started; the window is now on a 165 Hz screen.
    const { clock, frames, scroll } = lockedClock();
    const now165 = 1000 / 165;
    vi.setSystemTime(1000);
    frames.length = 0;
    scroll();
    clock.requestFrame();
    for (let k = 0; k < 60; k++) {
      const late = (k * 7) % 4 === 0 ? 2 : (k % 3) * 0.3;
      vi.advanceTimersByTime(Math.max(0, 1000 + k * now165 + late - Date.now()));
      clock.tick(1000 + k * now165 + late);
    }
    const settled = frames.slice(15);
    expect(settled.length).toBeGreaterThan(30);
    for (let k = 1; k < settled.length; k++) {
      const gap = (settled[k]! - settled[k - 1]!) / now165;
      expect(Math.abs(gap - 1)).toBeLessThan(0.05);
    }
  });

  it('keeps every refresh while the typical frame fits, though a few do not', () => {
    // A scroll at 165 Hz: most frames take half a refresh; every fifth
    // mounts rows and takes more than one.
    const { clock, frames, scroll } = lockedClock();
    const refresh = 1000 / 165;
    vi.setSystemTime(1000);
    frames.length = 0;
    scroll();
    let count = 0;
    const timed = frames.push.bind(frames);
    frames.push = (...times: number[]) => {
      vi.setSystemTime(Date.now() + (count++ % 5 === 4 ? 7 : 3));
      return timed(...times);
    };
    clock.requestFrame();
    for (let k = 0; k < 120; k++) {
      vi.advanceTimersByTime(Math.max(0, 1000 + k * refresh - Date.now()));
      clock.tick(1000 + k * refresh);
    }
    expect(clock.displayStride).toBe(1);
  });
});
