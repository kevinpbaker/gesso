import { BehaviorSubject, Observable, Subject, type Subscriber } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

import { fanOut } from './fanOut';

/**
 * Budgets for `fanOut`, against the spelling it replaces.
 *
 * The risk this guards is the one the whole primitive exists for. Ten
 * thousand cells on a screen, each reading its own slice of one
 * upstream value, is the shape a spreadsheet, a timeline and a log
 * viewer all arrive at, and the natural spelling —
 * `source.pipe(map(v => v[key]), distinctUntilChanged())` per cell —
 * costs work proportional to the *screen* on every emission and
 * tears down in the square of it. Gessosheet found that three separate
 * times, at 0.2 ms of median frame and five milliseconds of input
 * latency for a single such binding per cell, and wrote the fan-out by
 * hand each time.
 *
 * Counts and not timings, in the shape `reactive.budget.spec.ts` and
 * `LayoutEngine.budget.spec.ts` set: a count says which quantity the
 * work is proportional to, which is the claim, where a millisecond
 * says only what this machine did today. Each budget here is asserted
 * against the natural spelling in the same test, so a regression that
 * made both slow would still fail rather than quietly move the
 * baseline.
 */
const LIVE = 10_000;
const WIDE = 100_000;

/**
 * A source that counts subscriptions to it: the most open at once, and
 * how many were ever opened.
 *
 * Both, because they answer different questions. The peak is how many
 * followers a stream carries while a screen holds it, which is the
 * budget. The total is how many times it was picked up and put down,
 * which is how you tell "it let go" from "it never attached".
 */
function counted<T>(inner: Observable<T>): { source: Observable<T>; peak: () => number; opens: () => number } {
  let live = 0;
  let peak = 0;
  let opens = 0;
  const source = new Observable<T>((subscriber: Subscriber<T>) => {
    live++;
    opens++;
    peak = Math.max(peak, live);
    const subscription = inner.subscribe(subscriber);
    return () => {
      live--;
      subscription.unsubscribe();
    };
  });
  return { source, peak: () => peak, opens: () => opens };
}

function grid(size: number): Record<number, number> {
  const values: Record<number, number> = {};
  for (let index = 0; index < size; index++) {
    values[index] = index;
  }
  return values;
}

describe('fanOut budgets', () => {
  it('holds one subscription on the source where a pipe per key holds one each', () => {
    const inner = new BehaviorSubject(grid(LIVE));

    const piped = counted(inner);
    for (let index = 0; index < LIVE; index++) {
      piped.source.pipe(map(values => values[index])).subscribe();
    }

    const fanned = counted(inner);
    const cells = fanOut(fanned.source, (values: Record<number, number>, key) => values[key as number], {
      initial: 0
    });
    for (let index = 0; index < LIVE; index++) {
      cells.for(index).subscribe();
    }

    expect(piped.peak()).toBe(LIVE);
    expect(fanned.peak()).toBe(1);
  });

  it('reads the live keys and not the source, which may be a hundred times larger', () => {
    const wide = grid(WIDE);
    const source = new BehaviorSubject(wide);
    let reads = 0;
    const cells = fanOut(
      source,
      (values: Record<number, number>, key) => {
        reads++;
        return values[key as number];
      },
      { initial: 0 }
    );
    for (let index = 0; index < LIVE; index++) {
      cells.for(index).subscribe();
    }
    reads = 0;

    source.next({ ...wide, 0: -1 });

    // The window, not the document. The natural spelling is the same
    // here — this budget is the floor, and the next one is the point.
    expect(reads).toBe(LIVE);
  });

  it('reads one key for a change of one key, where a pipe per key reads all of them', () => {
    const values = grid(LIVE);

    let pipeReads = 0;
    const pipeSource = new BehaviorSubject(values);
    for (let index = 0; index < LIVE; index++) {
      pipeSource
        .pipe(
          map(snapshot => {
            pipeReads++;
            return snapshot[index];
          }),
          distinctUntilChanged()
        )
        .subscribe();
    }
    pipeReads = 0;

    let fanReads = 0;
    let touched: readonly number[] = [];
    const fanSource = new BehaviorSubject(values);
    const cells = fanOut(
      fanSource,
      (snapshot: Record<number, number>, key) => {
        fanReads++;
        return snapshot[key as number];
      },
      { initial: 0, changed: () => touched }
    );
    for (let index = 0; index < LIVE; index++) {
      cells.for(index).subscribe();
    }
    fanReads = 0;

    touched = [0];
    pipeSource.next({ ...values, 0: -1 });
    fanSource.next({ ...values, 0: -1 });

    expect(pipeReads).toBe(LIVE);
    expect(fanReads).toBe(1);
  });

  it('never puts more than one observer on any one subject', () => {
    // This is the count form of "teardown is not quadratic". RxJS
    // removes an observer from a Subject by scanning its observer list,
    // so the cost of unsubscribing one of N followers of a single
    // subject is N, and of unsubscribing all of them is N². The fix is
    // structural rather than algorithmic: no subject is ever asked to
    // carry the crowd.
    const source = new BehaviorSubject(grid(LIVE));
    const cells = fanOut(source, (values: Record<number, number>, key) => values[key as number], { initial: 0 });
    for (let index = 0; index < LIVE; index++) {
      cells.for(index).subscribe();
    }

    let widest = 0;
    for (let index = 0; index < LIVE; index++) {
      widest = Math.max(widest, cells.peek(index)?.subject.observers.length ?? 0);
    }

    expect(widest).toBe(1);
  });

  it('costs nothing until a key is taken', () => {
    const inner = new Subject<Record<number, number>>();
    const { source, opens } = counted(inner);

    const cells = fanOut(source, (values: Record<number, number>, key) => values[key as number], { initial: 0 });

    expect(opens()).toBe(0);
    cells.for(0);
    expect(opens()).toBe(1);
  });

  it('lets go of the source when the last key goes, and takes it up again', () => {
    const inner = new BehaviorSubject(grid(4));
    const { source, peak, opens } = counted(inner);
    const cells = fanOut(source, (values: Record<number, number>, key) => values[key as number], { initial: 0 });
    cells.for(0);
    cells.for(1);

    cells.release(0);
    cells.release(1);
    cells.for(2);

    // Two subscriptions over the registry's life and never two at once:
    // a registry whose screen has gone stops following the channel, and
    // one whose screen comes back follows it again.
    expect(opens()).toBe(2);
    expect(peak()).toBe(1);
  });
});
