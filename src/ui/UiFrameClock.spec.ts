import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UiAnimationFrameClock, UiManualFrameClock, UiTimerFrameClock } from './UiFrameClock';

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
