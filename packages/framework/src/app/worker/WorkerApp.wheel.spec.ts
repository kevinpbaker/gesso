import { describe, expect, it } from 'vitest';

import { wheelConsumedBy } from './WorkerApp';

/**
 * The shell's half of the scroll-trap fix.
 *
 * `preventDefault()` has to be called synchronously inside the DOM
 * wheel handler, and on this path the runtime is a `postMessage`
 * away, so the shell cannot ask whether the delta will be used. It
 * used to prevent unconditionally, which meant a canvas embedded in
 * an ordinary page swallowed every wheel that crossed it — a scroll
 * trap, and one that was worst in exactly the case where the canvas
 * had nothing to scroll at all.
 *
 * It now answers from what the worker last reported about the
 * pointer's scroll chain.
 */
const NOTHING = { up: false, down: false, left: false, right: false };

describe('wheelConsumedBy', () => {
  it('lets a wheel through when nothing under the pointer scrolls', () => {
    expect(wheelConsumedBy(NOTHING, 0, 100)).toBe(false);
    expect(wheelConsumedBy(NOTHING, 0, -100)).toBe(false);
    expect(wheelConsumedBy(NOTHING, 100, 0)).toBe(false);
  });

  it('takes a wheel the chain has room for', () => {
    expect(wheelConsumedBy({ ...NOTHING, down: true }, 0, 100)).toBe(true);
    expect(wheelConsumedBy({ ...NOTHING, up: true }, 0, -100)).toBe(true);
  });

  it('answers per direction, not per axis', () => {
    // A list scrolled to its top is the case the whole design turns
    // on: it still takes downward wheels and must hand upward ones to
    // the page, and a single "is this scrollable" flag gets that
    // exactly backwards.
    const atTop = { ...NOTHING, down: true };

    expect(wheelConsumedBy(atTop, 0, 100)).toBe(true);
    expect(wheelConsumedBy(atTop, 0, -100)).toBe(false);
  });

  it('reads the dominant axis, as the runtime scrolls on one', () => {
    const horizontal = { ...NOTHING, right: true };

    // Mostly sideways: the horizontal answer.
    expect(wheelConsumedBy(horizontal, 100, 10)).toBe(true);
    // Mostly down, with sideways drift — a trackpad does this
    // constantly — so the vertical answer, which is no.
    expect(wheelConsumedBy(horizontal, 10, 100)).toBe(false);
  });

  it('consumes nothing when there is no delta', () => {
    expect(wheelConsumedBy({ up: true, down: true, left: true, right: true }, 0, 0)).toBe(false);
  });
});
