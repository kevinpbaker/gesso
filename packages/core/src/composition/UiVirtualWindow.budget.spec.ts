import { describe, expect, it } from 'vitest';

import { Text } from './UiComponents';
import { UiVirtualWindow, type VirtualItemMeasure } from './UiVirtualWindow';

/**
 * Lazy list budgets (in the shape of `LayoutEngine.budget.spec.ts`).
 *
 * What a scroll frame costs must not grow with how much of the list has
 * been seen. Every row scrolled past is measured, and a row of text is
 * rarely exactly the estimate, so a long scroll leaves a correction on
 * almost every row; a frame then finds the rows at both edges of the
 * viewport and the spacers around them. When the corrections were an
 * array walked from the start, that was tens of thousands of steps per
 * offset after scrolling through 10k rows, and the search for an edge
 * asks for an offset at every step of its own.
 *
 * So the same frames are timed on a list nothing was measured in and on
 * one every row was measured in. They do the same work, so the ratio is
 * a hard budget generous enough for a loaded CI machine; the walk it
 * replaced put it past twenty, and took half a minute to measure the
 * rows in the first place. The timings are printed so a trend is
 * visible.
 */
describe('UiVirtualWindow budgets', () => {
  const COUNT = 100_000;
  const ESTIMATE = 20;
  const VIEWPORT = 600;
  const FRAMES = 2_000;

  function timed<T>(label: string, run: () => T): { result: T; ms: number } {
    const start = performance.now();
    const result = run();
    const ms = performance.now() - start;
    // eslint-disable-next-line no-console
    console.info(`[lazy list budget] ${label}: ${ms.toFixed(2)} ms`);
    return { result, ms };
  }

  function list(): UiVirtualWindow {
    return new UiVirtualWindow('column', { count: COUNT, estimatedExtent: ESTIMATE, overscan: 3 }, () =>
      Text({ text: 'row' })
    );
  }

  /** Heights of rows of wrapped text: one to four lines, never the estimate. */
  const heightOf = (index: number): number => 17 + (index % 4) * 16;

  /** Scrolls from the top to the bottom, reporting the extent of every mounted row as the host would. */
  function scrollThrough(window: UiVirtualWindow): void {
    let scroll = 0;
    let atEnd = false;
    while (!atEnd) {
      // The rows the last frame mounted are the ones still to be measured when it reached the end.
      atEnd = window.range.last === COUNT - 1;
      const { first, last } = window.range;
      const measures: VirtualItemMeasure[] = [];
      for (let index = first; index <= last; index++) {
        measures.push({ index, extent: heightOf(index) });
      }
      // Half a viewport a frame, so every row is mounted, and measured, on the way.
      scroll += window.update({ scroll, extent: VIEWPORT }, measures).scrollAdjust + VIEWPORT / 2;
    }
  }

  /** Frames that jump around the list, so every one moves the window. */
  function scrollFrames(window: UiVirtualWindow): void {
    const total = window.totalExtent();
    for (let frame = 0; frame < FRAMES; frame++) {
      window.update({ scroll: ((frame * 7919) % FRAMES) * (total / FRAMES), extent: VIEWPORT }, []);
    }
  }

  it('measures every row of a long list within budget', () => {
    const window = list();
    const { ms } = timed(`scroll through ${COUNT} rows, measuring each`, () => scrollThrough(window));
    let expected = 0;
    for (let index = 0; index < COUNT; index++) {
      expected += heightOf(index);
    }
    expect(window.totalExtent()).toBe(expected);
    expect(ms).toBeLessThan(5000);
  });

  it('costs a frame the same after every row was measured as before any was', () => {
    const fresh = list();
    const seen = list();
    scrollThrough(seen);
    // Once each first, so neither run pays for warming the code up.
    scrollFrames(fresh);
    scrollFrames(seen);
    const before = timed(`${FRAMES} frames, nothing measured`, () => scrollFrames(fresh)).ms;
    const after = timed(`${FRAMES} frames, ${COUNT} rows measured`, () => scrollFrames(seen)).ms;
    expect(after).toBeLessThan(Math.max(before, 20) * 4);
  });
});
