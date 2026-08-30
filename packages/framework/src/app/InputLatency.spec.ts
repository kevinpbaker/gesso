import { describe, expect, it } from 'vitest';

import { InputLatencyTracker } from './InputLatency';

describe('InputLatencyTracker', () => {
  it('measures from the stamp to the end of the frame', () => {
    const tracker = new InputLatencyTracker();
    tracker.mark(1000, true);
    expect(tracker.take(1012)).toBe(12);
  });

  it('reports nothing when no input is waiting', () => {
    const tracker = new InputLatencyTracker();
    expect(tracker.take(1000)).toBeNull();
  });

  it('ignores an input that armed no frame', () => {
    const tracker = new InputLatencyTracker();
    // A pointer move over empty space dirties nothing. Attributing it
    // to the next frame — possibly seconds away — would read as a stall.
    tracker.mark(1000, false);
    expect(tracker.hasPending).toBe(false);
    expect(tracker.take(9000)).toBeNull();
  });

  it('keeps the earliest stamp across a burst', () => {
    const tracker = new InputLatencyTracker();
    tracker.mark(1000, true);
    tracker.mark(1005, true);
    tracker.mark(1009, true);
    expect(tracker.take(1010)).toBe(10);
  });

  it('clears the mark, so the next frame does not repeat it', () => {
    const tracker = new InputLatencyTracker();
    tracker.mark(1000, true);
    expect(tracker.take(1010)).toBe(10);
    expect(tracker.take(1020)).toBeNull();
  });

  it('ignores an unstamped message', () => {
    const tracker = new InputLatencyTracker();
    tracker.mark(undefined, true);
    expect(tracker.take(1000)).toBeNull();
  });

  it('reports nothing rather than a negative reading', () => {
    const tracker = new InputLatencyTracker();
    tracker.mark(1000, true);
    expect(tracker.take(999)).toBeNull();
  });

  it('forgets a pending mark on reset', () => {
    const tracker = new InputLatencyTracker();
    tracker.mark(1000, true);
    tracker.reset();
    expect(tracker.take(1010)).toBeNull();
  });
});
