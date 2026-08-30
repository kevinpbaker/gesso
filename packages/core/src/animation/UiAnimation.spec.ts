import { describe, expect, it } from 'vitest';

import { AnimationDriver } from './AnimationDriver';
import { interpolatorFor } from './Interpolate';
import { UiSpring, UiTween, createTween, type AnimatedCell } from './UiAnimation';
import { cubicBezier, easings, linear, steps } from './UiEasing';
import { defaultMotion } from '../environment/UiMotion';

function cell<T>(initial: T): AnimatedCell<T> & { written: T[] } {
  let current = initial;
  const written: T[] = [];
  return {
    written,
    get value(): T {
      return current;
    },
    set value(next: T) {
      current = next;
      written.push(next);
    }
  };
}

describe('easings', () => {
  it('every curve is pinned at both ends', () => {
    for (const easing of Object.values(easings)) {
      expect(easing(0)).toBeCloseTo(0, 6);
      expect(easing(1)).toBeCloseTo(1, 6);
    }
  });

  it('a cubic Bézier answers the y at the t where x matches', () => {
    // ease-in-out is symmetric about its midpoint, which is the one
    // value a solver can get wrong without failing at the ends.
    const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 4);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 3);
  });

  it('steps() takes exactly as many distinct values as it is asked for', () => {
    const eight = steps(8);
    const seen = new Set<number>();
    for (let i = 0; i <= 100; i++) {
      seen.add(eight(i / 100));
    }
    expect(seen.size).toBe(8);
    expect(eight(0)).toBe(0);
    expect(eight(0.99)).toBeCloseTo(7 / 8, 6);
  });
});

describe('interpolation', () => {
  it('blends numbers, colours and transforms', () => {
    expect(interpolatorFor(0, 10)?.(0 as never, 10 as never, 0.5)).toBe(5);
    expect(
      interpolatorFor({ r: 0, g: 0, b: 0, a: 1 }, { r: 1, g: 1, b: 1, a: 1 })?.(
        { r: 0, g: 0, b: 0, a: 1 } as never,
        { r: 1, g: 1, b: 1, a: 1 } as never,
        0.5
      )
    ).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 1 });
    expect(
      interpolatorFor({ scaleX: 1 }, { scaleX: 2 })?.({ scaleX: 1 } as never, { scaleX: 2 } as never, 0.5)
    ).toEqual({ x: 0, y: 0, scaleX: 1.5, scaleY: 1, rotation: 0 });
  });

  it('declines what it cannot honestly blend', () => {
    // A palette name and a typed length are the two cases that matter:
    // both resolve later, against something this code cannot see.
    expect(interpolatorFor('surface', 'controlAccent')).toBeUndefined();
    expect(interpolatorFor({ kind: 'percent', value: 50 }, { kind: 'percent', value: 80 })).toBeUndefined();
    expect(createTween(cell('surface'), 'controlAccent', { duration: 100 })).toBeUndefined();
  });
});

describe('a tween', () => {
  it('takes the whole duration to arrive, and lands exactly', () => {
    const target = cell(0);
    const tween = new UiTween(target, 100, { duration: 200, easing: linear }, (a, b, t) => a + (b - a) * t);
    tween.advance(1000);
    expect(target.value).toBe(0);
    tween.advance(1100);
    expect(target.value).toBeCloseTo(50, 6);
    tween.advance(1199);
    expect(tween.isFinished).toBe(false);
    tween.advance(1200);
    expect(target.value).toBe(100);
    expect(tween.isFinished).toBe(true);
  });

  it('starts from where the cell is when the first tick arrives, on the frame clock', () => {
    // The point of taking the start time from the first tick rather
    // than from construction: `animate()` is called on
    // `performance.now()` and sampled on the frame clock, and under a
    // manual clock those are different numbers entirely.
    const target = cell(0);
    const tween = new UiTween(target, 10, { duration: 100, easing: linear }, (a, b, t) => a + (b - a) * t);
    tween.advance(5_000_000);
    expect(target.value).toBe(0);
    tween.advance(5_000_050);
    expect(target.value).toBeCloseTo(5, 6);
  });

  it('writes nothing while a stepped easing holds one value', () => {
    const target = cell(0);
    const tween = new UiTween(target, 8, { duration: 800, easing: steps(8) }, (a, b, t) => a + (b - a) * t);
    for (let ms = 0; ms <= 90; ms += 10) {
      tween.advance(ms);
    }
    // Ten frames, one value: this is what keeps the Spinner's promise.
    expect(target.written).toEqual([0]);
  });

  it('a repeating tween never finishes and comes back round', () => {
    const target = cell(0);
    const tween = new UiTween(
      target,
      10,
      { duration: 100, easing: linear, repeat: true },
      (a, b, t) => a + (b - a) * t
    );
    tween.advance(0);
    tween.advance(50);
    expect(target.value).toBeCloseTo(5, 6);
    tween.advance(100);
    expect(target.value).toBeCloseTo(0, 6);
    expect(tween.isFinished).toBe(false);
  });
});

describe('a spring', () => {
  it('reaches its target and stops', () => {
    const target = cell(0);
    const animation = new UiSpring(target, 100, { spring: defaultMotion.springs.snappy });
    let time = 0;
    while (!animation.isFinished && time < 5000) {
      time += 16;
      animation.advance(time);
    }
    expect(animation.isFinished).toBe(true);
    expect(target.value).toBe(100);
    expect(time).toBeLessThan(2000);
  });

  it('reaches the same values whether it is sampled at 60 Hz or at 30', () => {
    // Fixed sub-steps rather than the frame delta, so a dropped frame
    // does not change where the spring is a second later.
    const fast = cell(0);
    const slow = cell(0);
    const a = new UiSpring(fast, 100, { spring: defaultMotion.springs.gentle });
    const b = new UiSpring(slow, 100, { spring: defaultMotion.springs.gentle });
    for (let t = 0; t <= 320; t += 16) {
      a.advance(t);
    }
    for (let t = 0; t <= 320; t += 32) {
      b.advance(t);
    }
    expect(fast.value).toBeCloseTo(slow.value, 6);
  });

  it('is not finished just because it is passing through its target', () => {
    const target = cell(0);
    const animation = new UiSpring(target, 100, { spring: { stiffness: 300, damping: 4, mass: 1 } });
    let crossed = false;
    for (let t = 0; t <= 400 && !animation.isFinished; t += 16) {
      animation.advance(t);
      crossed ||= target.value > 100;
    }
    expect(crossed).toBe(true);
    expect(animation.isFinished).toBe(false);
  });

  it('hands its velocity to whatever retargets it', () => {
    const target = cell(0);
    const animation = new UiSpring(target, 100, { spring: defaultMotion.springs.snappy });
    animation.advance(0);
    animation.advance(100);
    expect(animation.currentVelocity).toBeGreaterThan(0);
  });
});

describe('the driver', () => {
  it('runs one animation per cell; a second supersedes the first', () => {
    const driver = new AnimationDriver();
    const target = cell(0);
    const first = new UiTween(target, 100, { duration: 100, easing: linear }, (a, b, t) => a + (b - a) * t);
    let completed = false;
    driver.start(first).subscribe({ complete: () => (completed = true) });
    driver.advance(0);
    driver.advance(50);

    const second = new UiTween(target, 0, { duration: 100, easing: linear }, (a, b, t) => a + (b - a) * t);
    driver.start(second);

    expect(completed).toBe(true);
    expect(driver.size).toBe(1);
    // Blended from where the first one had got to, not from 0.
    driver.advance(50);
    driver.advance(100);
    expect(target.value).toBeCloseTo(25, 6);
  });

  it('reports nothing to do when it is empty, which is what makes ticks 0 honest', () => {
    const driver = new AnimationDriver();
    expect(driver.isRunning).toBe(false);
    expect(driver.nextTickAt(1000)).toBeUndefined();
  });

  it('asks for the next frame when something wants every frame', () => {
    const driver = new AnimationDriver();
    const target = cell(0);
    driver.start(new UiTween(target, 1, { duration: 100, easing: linear }, (a, b, t) => a + (b - a) * t));
    expect(driver.nextTickAt(1000)).toBe(1000);
    driver.advance(1000);
    expect(driver.nextTickAt(1000)).toBe(1000);
  });

  it('asks for a later frame when an animation only wants a few', () => {
    const driver = new AnimationDriver();
    const target = cell(0);
    driver.start(
      new UiTween(
        target,
        8,
        { duration: 880, easing: steps(8), stepMs: 110, repeat: true },
        (a, b, t) => a + (b - a) * t
      )
    );
    driver.advance(1000);
    // Eight wake-ups a second, not sixty.
    expect(driver.nextTickAt(1000)).toBe(1110);
    driver.advance(1050);
    expect(target.written).toEqual([0]);
  });

  it('drops a finished animation, so an app goes quiet by itself', () => {
    const driver = new AnimationDriver();
    const target = cell(0);
    driver.start(new UiTween(target, 1, { duration: 100, easing: linear }, (a, b, t) => a + (b - a) * t));
    driver.advance(0);
    driver.advance(100);
    expect(driver.isRunning).toBe(false);
    expect(driver.nextTickAt(100)).toBeUndefined();
  });

  it('stop() leaves the cell where it stands and completes the observable', () => {
    const driver = new AnimationDriver();
    const target = cell(0);
    let completed = false;
    driver
      .start(new UiTween(target, 100, { duration: 100, easing: linear }, (a, b, t) => a + (b - a) * t))
      .subscribe({ complete: () => (completed = true) });
    driver.advance(0);
    driver.advance(50);
    driver.stop(target);
    expect(completed).toBe(true);
    expect(target.value).toBeCloseTo(50, 6);
    expect(driver.isRunning).toBe(false);
  });
});

describe('reduced motion', () => {
  it('snaps a new animation to its target without running a single frame', () => {
    const driver = new AnimationDriver();
    driver.setReducedMotion(true);
    const target = cell(0);
    driver.start(new UiTween(target, 100, { duration: 400, easing: linear }, (a, b, t) => a + (b - a) * t));
    expect(target.value).toBe(100);
    expect(driver.isRunning).toBe(false);
    expect(driver.nextTickAt(0)).toBeUndefined();
  });

  it('finishes what is already in flight rather than leaving it half-way', () => {
    const driver = new AnimationDriver();
    const target = cell(0);
    driver.start(new UiTween(target, 100, { duration: 400, easing: linear }, (a, b, t) => a + (b - a) * t));
    driver.advance(0);
    driver.advance(100);
    expect(target.value).toBeCloseTo(25, 6);
    driver.setReducedMotion(true);
    expect(target.value).toBe(100);
    expect(driver.isRunning).toBe(false);
  });

  it('leaves alone an animation whose movement is the information', () => {
    const driver = new AnimationDriver();
    driver.setReducedMotion(true);
    const target = cell(0);
    driver.start(
      new UiTween(
        target,
        8,
        { duration: 880, easing: steps(8), repeat: true, reducedMotion: 'keep' },
        (a, b, t) => a + (b - a) * t
      )
    );
    // A spinner that stops turning says work has stopped.
    expect(driver.isRunning).toBe(true);
  });
});
