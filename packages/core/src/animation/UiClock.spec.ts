import { describe, expect, it } from 'vitest';

import { AnimationDriver } from './AnimationDriver';
import { createTween, type AnimatedCell } from './UiAnimation';
import { UiClock } from './UiClock';
import { linear } from './UiEasing';

function cell(initial: number): AnimatedCell<number> {
  let current = initial;
  return {
    get value(): number {
      return current;
    },
    set value(next: number) {
      current = next;
    }
  };
}

/** A 200 ms linear tween from 0 to 100, begun on the driver's first frame at `t0`. */
function started(driver: AnimationDriver, clock: UiClock | null, t0 = 1000): AnimatedCell<number> {
  const width = cell(0);
  driver.start(createTween(width, 100, { duration: 200, easing: linear })!, clock);
  driver.advance(t0);
  return width;
}

describe('UiClock', () => {
  it('runs an animation at its speed: a quarter of real time moves a quarter as far', () => {
    const driver = new AnimationDriver();
    const real = started(driver, null);
    const slow = started(driver, new UiClock({ speed: 0.25 }));

    driver.advance(1100);

    expect(real.value).toBeCloseTo(50, 5);
    expect(slow.value).toBeCloseTo(12.5, 5);
  });

  it('asks for frames in real time, and for none while paused', () => {
    const driver = new AnimationDriver();
    const clock = new UiClock({ speed: 0.5 });
    const width = started(driver, clock);
    expect(driver.nextTickAt(1000)).toBeLessThanOrEqual(1000 + 16);

    clock.speed = 0;
    driver.advance(1100);
    const paused = width.value;
    expect(driver.nextTickAt(1100)).toBeUndefined();
    driver.advance(5000);
    expect(width.value).toBe(paused);

    // On again from where it stood, not from where real time had got to.
    clock.speed = 1;
    driver.advance(5050);
    expect(width.value).toBeCloseTo(paused + 25, 5);
  });

  it('lands everything on a settled clock: at once when it starts there, on the next frame when it settles later', () => {
    const driver = new AnimationDriver();
    const board = started(driver, new UiClock({ settled: true }));
    expect(board.value).toBe(100);
    expect(driver.size).toBe(0);

    const clock = new UiClock();
    const played = started(driver, clock);
    driver.advance(1050);
    expect(played.value).toBeCloseTo(25, 5);
    clock.settled = true;
    expect(driver.nextTickAt(1060)).toBe(1060);
    driver.advance(1060);
    expect(played.value).toBe(100);
    expect(driver.isRunning).toBe(false);
  });

  it('lands a repeating animation too, which reduced motion would leave running', () => {
    const driver = new AnimationDriver();
    driver.setReducedMotion(true);
    const spin = cell(0);
    driver.start(
      createTween(spin, 360, { duration: 1000, easing: linear, repeat: true, reducedMotion: 'keep' })!,
      new UiClock({ settled: true })
    );

    expect(driver.isRunning).toBe(false);
  });

  it('refuses a speed that is not a number of 0 or more', () => {
    expect(() => new UiClock({ speed: -1 })).toThrow(/0 or more/);
    expect(() => new UiClock({ speed: Number.NaN })).toThrow(/0 or more/);
  });

  it('plays a held animation back and forth when paused and moved, as a scrubber does', () => {
    const driver = new AnimationDriver();
    const clock = new UiClock();
    const width = started(driver, clock);
    clock.speed = 0;
    clock.holding = true;
    const from = clock.now;

    clock.seek(from + 100);
    expect(driver.nextTickAt(1000)).toBe(1000);
    driver.advance(1000);
    expect(width.value).toBeCloseTo(50, 5);

    // Past its end: held there, not finished.
    clock.seek(from + 400);
    driver.advance(1000);
    expect(width.value).toBe(100);
    expect(driver.isRunning).toBe(true);

    // Back again, which a finished one could not do.
    clock.seek(from + 50);
    driver.advance(1000);
    expect(width.value).toBeCloseTo(25, 5);
    expect(driver.nextTickAt(1000)).toBeUndefined();

    // Let go, it finishes.
    clock.holding = false;
    clock.speed = 1;
    driver.advance(2000);
    expect(width.value).toBe(100);
    expect(driver.isRunning).toBe(false);
  });
});
