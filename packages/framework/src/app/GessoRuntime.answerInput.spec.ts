import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Column, Text, UiManualFrameClock } from 'gesso-core';
import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';

/**
 * An input's frame drawn when the input has been routed, not at the next
 * refresh: what took keystroke to frame from p95 20.7 ms to 7.
 */
describe('GessoRuntime.answerInput', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function mount() {
    const text$ = new BehaviorSubject('a');
    let clock!: UiManualFrameClock;
    const runtime = new GessoRuntime({
      root: Column({}, Text({ text: text$ })),
      canvas: mockCanvas(400, 300),
      width: 400,
      height: 300,
      clock: cb => (clock = new UiManualFrameClock(cb))
    });
    const frames: number[] = [];
    runtime.onFrame(metrics => frames.push(metrics.frame));
    runtime.start();
    if (clock.isPending) clock.tick(0);
    frames.length = 0;
    return { runtime, clock, text$, frames };
  }

  it('draws the frame an input armed without waiting for the clock', () => {
    const { runtime, clock, text$, frames } = mount();
    text$.next('ab');
    expect(clock.isPending).toBe(true);
    runtime.answerInput();
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(0);
    expect(frames).toHaveLength(1);
    expect(clock.isPending).toBe(false);
    runtime.dispose();
  });

  it('draws nothing early when the input armed no frame', () => {
    const { runtime, frames } = mount();
    runtime.answerInput();
    vi.advanceTimersByTime(0);
    expect(frames).toHaveLength(0);
    runtime.dispose();
  });

  it('leaves a second input soon after to the clock', () => {
    const { runtime, clock, text$, frames } = mount();
    text$.next('ab');
    runtime.answerInput();
    vi.advanceTimersByTime(0);
    text$.next('abc');
    runtime.answerInput();
    vi.advanceTimersByTime(0);
    expect(frames).toHaveLength(1);
    expect(clock.isPending).toBe(true);
    runtime.dispose();
  });

  it("draws a channel's patch early when it answers a recent input", () => {
    const { runtime, clock, text$, frames } = mount();
    let arrived!: () => void;
    runtime.deferPatchesFrom([
      {
        deferPatches: schedule => (arrived = schedule),
        get hasPendingPatches() {
          return false;
        },
        flush: () => {}
      }
    ]);
    vi.advanceTimersByTime(20);
    runtime.answerInput();
    vi.advanceTimersByTime(20);
    text$.next('ab');
    arrived();
    vi.advanceTimersByTime(0);
    expect(frames).toHaveLength(1);
    expect(clock.isPending).toBe(false);

    vi.advanceTimersByTime(1000);
    text$.next('abc');
    arrived();
    vi.advanceTimersByTime(0);
    expect(frames).toHaveLength(1);
    expect(clock.isPending).toBe(true);
    runtime.dispose();
  });

  it('draws nothing after the runtime is disposed', () => {
    const { runtime, text$, frames } = mount();
    text$.next('ab');
    runtime.answerInput();
    runtime.dispose();
    vi.advanceTimersByTime(0);
    expect(frames).toHaveLength(0);
  });
});
