import { Observable, Subject, type Subscriber } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computed } from './computed';
import { debounced, throttled } from './debounce';
import { internalState } from './InternalState';
import { mutate } from './mutate';
import { resource } from './resource';

/**
 * Budgets for the async helpers (roadmap X4).
 *
 * The risk §5 of the roadmap names is sugar that hides cost, and the
 * shape it would take here is a resource that re-subscribes upstream
 * per emission: one request re-opening the key source, or a status
 * cell opening its own subscription to the record it projects. A
 * screen holds one of these per list and one per page, so a helper
 * that costs a subscription per answer costs a subscription per
 * keystroke by the time it is used in earnest.
 *
 * Counts and not timings, in the shape `LayoutEngine.budget.spec.ts`
 * set and `reactive.budget.spec.ts` followed.
 */

/**
 * A stream that reports how many subscriptions to it are open, and the
 * most that were ever open at once.
 *
 * The peak rather than a total: a `.value` read of a stream nothing is
 * following opens one subscription and closes it in the same
 * statement, which a total would count and the peak correctly does
 * not.
 */
function counted<T>(initial?: T): {
  source: Observable<T>;
  next: (value: T) => void;
  live: () => number;
  peak: () => number;
} {
  const subject = new Subject<T>();
  let held = initial;
  let live = 0;
  let peak = 0;
  const source = new Observable<T>((subscriber: Subscriber<T>) => {
    live++;
    peak = Math.max(peak, live);
    if (held !== undefined) {
      subscriber.next(held);
    }
    const inner = subject.subscribe(subscriber);
    return () => {
      live--;
      inner.unsubscribe();
    };
  });
  return {
    source,
    next: value => {
      held = value;
      subject.next(value);
    },
    live: () => live,
    peak: () => peak
  };
}

/** Lets whatever a resolved promise scheduled actually run. */
const settle = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('resource budgets', () => {
  it('follows its key with one subscription, however many requests run through it', async () => {
    const key = counted<string>();
    const page = resource(key.source, async (one: string) => one.toUpperCase());
    const following = page.state.subscribe(() => {});

    for (let i = 0; i < 50; i++) {
      key.next(`k${i}`);
    }
    await settle();

    expect(page.value.value).toBe('K49');
    expect(key.peak()).toBe(1);
    expect(key.live()).toBe(1);
    following.unsubscribe();
    page.dispose();
    expect(key.live()).toBe(0);
  });

  it('asks once per request and never twice for the same one', async () => {
    const key = internalState<string | null>(null);
    let asked = 0;
    const page = resource(key, async (one: string) => {
      asked++;
      return one;
    });

    key.value = 'a';
    await page.settled;
    // Reading the three projections is not asking again.
    for (let i = 0; i < 20; i++) {
      void page.status.value;
      void page.value.value;
      void page.error.value;
    }
    expect(asked).toBe(1);
  });

  it('emits twice per request: what it starts with, and what it settled on', async () => {
    const key = internalState<string | null>(null);
    const page = resource(key, async (one: string) => one);
    const seen: string[] = [];
    const following = page.status.subscribe(status => seen.push(status));

    key.value = 'a';
    await page.settled;
    key.value = 'b';
    await page.settled;
    following.unsubscribe();

    // idle, then loading/ready for the first, then loading/ready for
    // the second: no intermediate state anybody has to draw.
    expect(seen).toEqual(['idle', 'loading', 'ready', 'loading', 'ready']);
  });

  it('holds the whole record once, and projects it without a second subscription', async () => {
    const key = internalState<string | null>(null);
    const page = resource(key, async (one: string) => one);
    let emissions = 0;
    const status = page.status.subscribe(() => emissions++);
    const value = page.value.subscribe(() => emissions++);
    const error = page.error.subscribe(() => emissions++);

    key.value = 'a';
    await page.settled;
    status.unsubscribe();
    value.unsubscribe();
    error.unsubscribe();

    // Three followers, three initial values, and then only the cells
    // whose field actually changed: two for the status, one for the
    // value, and none at all for the error, which was null throughout.
    expect(emissions).toBe(3 + 2 + 1);
  });

  it('does not re-emit for a peeked value that is what it already showed', async () => {
    const held = new Map([['a', 'stored']]);
    const key = internalState<string | null>(null);
    const page = resource(key, async () => 'stored', { peek: (one: string) => held.get(one) ?? null });
    let emissions = 0;
    const following = page.value.subscribe(() => emissions++);

    key.value = 'a';
    await page.settled;
    following.unsubscribe();
    // The initial null, then the stored value. The answer is the same
    // string, so nothing is pushed for it.
    expect(emissions).toBe(2);
  });
});

describe('mutate budgets', () => {
  it('writes the cell once per run, whatever the commit does', async () => {
    const list = internalState<readonly string[]>([]);
    let emissions = 0;
    const following = list.subscribe(() => emissions++);
    const like = mutate(
      list,
      (current, id: string) => [...current, id],
      async () => undefined
    );

    await like.run('a');
    await like.run('b');
    following.unsubscribe();
    // The initial value and one write each: a commit that goes through
    // touches the cell exactly once.
    expect(emissions).toBe(3);
  });

  it('writes it twice when the commit refuses, and not three times', async () => {
    const list = internalState<readonly string[]>([]);
    let emissions = 0;
    const following = list.subscribe(() => emissions++);
    const like = mutate(
      list,
      (current, id: string) => [...current, id],
      async () => false
    );

    await like.run('a');
    following.unsubscribe();
    // The initial value, the optimistic write, the rollback.
    expect(emissions).toBe(3);
  });
});

describe('gate budgets', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('costs one subscription upstream and one emission per settled burst', () => {
    const source = counted<string>('');
    const term = debounced(source.source, 100);
    let emissions = 0;
    const first = term.subscribe(() => emissions++);
    const second = term.subscribe(() => emissions++);

    for (let i = 0; i < 100; i++) {
      source.next(`q${i}`);
    }
    vi.advanceTimersByTime(100);

    expect(source.peak()).toBe(1);
    // Two initial values, then one emission each for the burst.
    expect(emissions).toBe(4);
    first.unsubscribe();
    second.unsubscribe();
    expect(source.live()).toBe(0);
  });

  it('lets a throttled burst through twice and not a hundred times', () => {
    const source = counted<number>();
    const shown = throttled(source.source, 100);
    let emissions = 0;
    const following = shown.subscribe(() => emissions++);

    for (let i = 0; i < 100; i++) {
      source.next(i);
    }
    vi.advanceTimersByTime(100);
    following.unsubscribe();

    // The initial undefined, the leading value, the trailing value.
    expect(emissions).toBe(3);
    expect(source.peak()).toBe(1);
  });

  it('is read by a computed as one source, not as a subscription per read', () => {
    const source = counted<string>('a');
    const term = debounced(source.source, 100);
    const shouted = computed(() => term.value.toUpperCase());
    const following = shouted.subscribe(() => {});

    source.next('b');
    vi.advanceTimersByTime(100);

    expect(shouted.value).toBe('B');
    expect(source.peak()).toBe(1);
    following.unsubscribe();
    expect(source.live()).toBe(0);
  });
});
