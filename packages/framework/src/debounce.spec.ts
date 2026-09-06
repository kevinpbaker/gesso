import { Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computed } from './computed';
import { debounced, throttled } from './debounce';
import { internalState } from './InternalState';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounced', () => {
  it('holds a burst back and lets the last of it through', () => {
    const query = internalState('');
    const term = debounced(query, 200);
    const seen: string[] = [];
    const following = term.subscribe(value => seen.push(value));

    query.value = 'a';
    query.value = 'ab';
    query.value = 'abc';
    vi.advanceTimersByTime(199);
    expect(seen).toEqual(['']);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['', 'abc']);
    following.unsubscribe();
  });

  it('has the value the source already held, on the first frame', () => {
    const query = internalState('hello');
    const term = debounced(query, 200);
    const seen: string[] = [];
    const following = term.subscribe(value => seen.push(value));

    // A cell has a current value, so a screen built from this draws
    // now rather than 200ms from now.
    expect(seen).toEqual(['hello']);
    expect(term.value).toBe('hello');
    following.unsubscribe();
  });

  it('does not repeat a value it already holds', () => {
    const query = internalState('a');
    const term = debounced(query, 100);
    const seen: string[] = [];
    const following = term.subscribe(value => seen.push(value));

    query.value = 'a';
    vi.advanceTimersByTime(200);
    expect(seen).toEqual(['a']);
    following.unsubscribe();
  });

  it('is a cell, so a computed follows it and reads it with .value', () => {
    const query = internalState('');
    const term = debounced(query, 100);
    const upper = computed(() => term.value.toUpperCase());
    const seen: string[] = [];
    const following = upper.subscribe(value => seen.push(value));

    query.value = 'ab';
    vi.advanceTimersByTime(100);
    expect(seen).toEqual(['', 'AB']);
    following.unsubscribe();
  });

  it('reads the source directly when nothing is following it', () => {
    const query = internalState('now');
    const term = debounced(query, 1000);
    // No timer is running, so there is nothing being held back and the
    // source's value is the honest answer.
    expect(term.value).toBe('now');
  });

  it('takes one subscription upstream however many followers it has', () => {
    const inner = new Subject<string>();
    let live = 0;
    const source = new Observable<string>(subscriber => {
      live++;
      const following = inner.subscribe(subscriber);
      return () => {
        live--;
        following.unsubscribe();
      };
    });
    const term = debounced(source, 50);
    const first = term.subscribe(() => {});
    const second = term.subscribe(() => {});
    expect(live).toBe(1);
    first.unsubscribe();
    expect(live).toBe(1);
    second.unsubscribe();
    expect(live).toBe(0);
  });
});

describe('throttled', () => {
  it('lets the first through at once and the last at the end of the window', () => {
    const position = new Subject<number>();
    const shown = throttled(position, 100);
    const seen: number[] = [];
    const following = shown.subscribe(value => seen.push(value));

    position.next(1);
    position.next(2);
    position.next(3);
    expect(seen).toEqual([undefined, 1]);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([undefined, 1, 3]);
    following.unsubscribe();
  });

  it('follows the source again once the window has closed', () => {
    const position = new Subject<number>();
    const shown = throttled(position, 100);
    const seen: number[] = [];
    const following = shown.subscribe(value => seen.push(value));

    position.next(1);
    vi.advanceTimersByTime(200);
    position.next(2);
    expect(seen.at(-1)).toBe(2);
    following.unsubscribe();
  });
});
