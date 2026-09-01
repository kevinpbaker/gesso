import { describe, expect, it } from 'vitest';

import { HeavyWork, type HeavyStatus } from './HeavyWork';

/**
 * One press, one publication.
 *
 * The channel used to hold three cells written in a row under a
 * `combineLatest`, so a single `compute()` published three patch
 * batches and the middle two described states the work was never in: a
 * new checksum beside the previous run's duration and count. Nothing
 * on screen showed it, because the last of the three is correct and
 * they land in one frame. The action log showed it at once.
 */
describe('HeavyWork', () => {
  it('publishes one consistent status per run', () => {
    const heavy = new HeavyWork(5);
    const seen: HeavyStatus[] = [];
    heavy.status.subscribe(status => seen.push(status));
    // The initial value, then exactly one more.
    expect(seen).toHaveLength(1);

    heavy.compute();

    expect(seen).toHaveLength(2);
    expect(seen[1]?.runs).toBe(1);
    expect(seen[1]?.lastDurationMs).toBeGreaterThan(0);
  });

  it('counts runs without ever showing a torn one', () => {
    const heavy = new HeavyWork(5);
    const seen: HeavyStatus[] = [];
    heavy.status.subscribe(status => seen.push(status));

    heavy.compute();
    heavy.compute();

    // Every emission after the first has a duration and a checksum
    // belonging to the run it counts.
    expect(seen.map(status => status.runs)).toEqual([0, 1, 2]);
    for (const status of seen.slice(1)) {
      expect(status.lastDurationMs).toBeGreaterThan(0);
    }
  });
});
