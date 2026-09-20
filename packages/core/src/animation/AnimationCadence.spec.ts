import { describe, expect, it } from 'vitest';

import { AnimationDriver } from './AnimationDriver';
import { interpolatorFor } from './Interpolate';
import { UiTween } from './UiAnimation';
import { linear } from './UiEasing';

/**
 * How often an animation that declared a rate actually gets sampled.
 *
 * The subject is not the values, which are a pure function of elapsed
 * time and were never in doubt. It is the *cadence*: how many times a
 * second the cell is written, which for a video is how many of its
 * pictures are shown and how many are dropped.
 *
 * This exists because that number was wrong in a way no other spec
 * could see. Frames arrive on a display's refreshes, so a sample is
 * nearly always served a little after it was due; deriving the next
 * due time from when the last one was *served* keeps that rounding and
 * compounds it. A 24fps clip on a 60Hz display ran at 20.
 */

/** Samples a clip of `fps` for `seconds`, driven by a `refreshHz` display. */
function cadence(fps: number, refreshHz: number, seconds: number): number {
  const driver = new AnimationDriver();
  let value = 0;
  const cell = {
    get value(): number {
      return value;
    },
    set value(next: number) {
      value = next;
    }
  };
  driver.start(
    new UiTween(
      cell,
      1e6,
      // A rate of zero means "every frame", which is `stepMs: 0`
      // rather than an infinite interval.
      { duration: 1e6, easing: linear, stepMs: fps <= 0 ? 0 : 1000 / fps, reducedMotion: 'keep' },
      interpolatorFor(0, 1)!
    )
  );

  const refresh = 1000 / refreshHz;
  let samples = 0;
  let seen = Number.NaN;
  for (let at = 0; at <= seconds * 1000; at += refresh) {
    driver.advance(at);
    if (value !== seen) {
      seen = value;
      samples++;
    }
  }
  // The first write is the animation starting, not a step.
  return (samples - 1) / seconds;
}

describe('sample cadence', () => {
  it('shows all of a 24fps clip on a 60Hz display', () => {
    // The case that was broken, and the commonest clip rate there is.
    // 41.67ms wanted, 16.67ms refreshes: the naive next-due lands on
    // 50ms every time, which is 20fps and one frame in six dropped.
    expect(cadence(24, 60, 4)).toBeCloseTo(24, 0);
  });

  it('shows all of a 30fps clip on a 60Hz display', () => {
    // A rate that divides the refresh exactly was never in trouble,
    // which is part of why this went unnoticed.
    expect(cadence(30, 60, 4)).toBeCloseTo(30, 0);
  });

  it('shows all of a 24fps clip on a 120Hz display', () => {
    expect(cadence(24, 120, 4)).toBeCloseTo(24, 0);
  });

  it('does not ask a 60Hz display for more than it has', () => {
    // 59.94fps against 60Hz is the case `dueSlackMs` was written for:
    // every due time falls a hair after a refresh, and turning those
    // refreshes away halves the rate.
    expect(cadence(59.94, 60, 4)).toBeCloseTo(60, 0);
  });

  it('wakes every frame for an animation that declared no rate', () => {
    // Every refresh, which over a window that does not divide evenly
    // is one fewer than the refresh rate rather than exactly it.
    expect(cadence(0, 60, 2)).toBeGreaterThan(59);
  });

  it('resynchronises after a stall rather than chasing the samples it missed', () => {
    const driver = new AnimationDriver();
    let value = 0;
    const cell = {
      get value(): number {
        return value;
      },
      set value(next: number) {
        value = next;
      }
    };
    driver.start(
      new UiTween(
        cell,
        1e6,
        { duration: 1e6, easing: linear, stepMs: 40, reducedMotion: 'keep' },
        interpolatorFor(0, 1)!
      )
    );
    driver.advance(0);

    // Nothing for a second: a blocked thread, or a hidden tab. That is
    // twenty-five steps of 40ms gone by.
    driver.advance(1000);

    // What follows is the ordinary rate, not a backlog worked through
    // a frame at a time. For a video the missed samples are pictures
    // already past, and presenting is a pure function of a position,
    // so catching up would sample twenty-five times to arrive exactly
    // where one sample arrives anyway.
    let samples = 0;
    let seen = value;
    for (let at = 1000 + 1000 / 60; at <= 1400; at += 1000 / 60) {
      driver.advance(at);
      if (value !== seen) {
        seen = value;
        samples++;
      }
    }
    // 400ms at one sample per 40ms.
    expect(samples).toBeGreaterThanOrEqual(9);
    expect(samples).toBeLessThanOrEqual(11);
  });
});
