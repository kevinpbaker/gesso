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
