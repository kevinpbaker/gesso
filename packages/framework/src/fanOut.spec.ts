import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { computed } from './computed';
import { fanOut, type FanKey } from './fanOut';

/**
 * Many cells from one source.
 *
 * What it does. Why it is worth having is next door in
 * `fanOut.budget.spec.ts`, and that is the half that matters: a version
 * of this that got every value in this file right and none of the
 * counts in that one would be `source.pipe(map(...))` with extra steps,
 * which is exactly what three phases of gessosheet wrote, measured and
 * threw away.
 */
type Grid = Record<string, number>;

describe('fanOut', () => {
  it('gives a key the reading of the latest snapshot', () => {
    const source = new BehaviorSubject<Grid>({ a: 1, b: 2 });
    const cells = fanOut(source, (grid, key) => grid[key] ?? 0, { initial: 0 });

    expect(cells.for('a').value).toBe(1);
    expect(cells.for('b').value).toBe(2);
  });

  it('gives a key the initial value when the source has said nothing', () => {
    const cells = fanOut(new Subject<Grid>(), (grid, key) => grid[key] ?? 0, { initial: -1 });

    expect(cells.for('a').value).toBe(-1);
  });

  it('takes an initial that varies by key', () => {
    const cells = fanOut(new Subject<Grid>(), (grid, key) => grid[key] ?? 0, {
      initial: key => String(key).length
    });

    expect(cells.for('ab').value).toBe(2);
    expect(cells.for('abcd').value).toBe(4);
  });

  it('is the same cell every time a key is asked for', () => {
    const cells = fanOut(new BehaviorSubject<Grid>({}), (grid, key) => grid[key] ?? 0, { initial: 0 });

    expect(cells.for('a')).toBe(cells.for('a'));
  });

  it('pushes a new snapshot into the keys that changed', () => {
    const source = new BehaviorSubject<Grid>({ a: 1, b: 2 });
    const cells = fanOut(source, (grid, key) => grid[key] ?? 0, { initial: 0 });
    const a = vi.fn();
    const b = vi.fn();
    cells.for('a').subscribe(a);
    cells.for('b').subscribe(b);
    a.mockClear();
    b.mockClear();

    source.next({ a: 9, b: 2 });

    expect(a).toHaveBeenCalledExactlyOnceWith(9);
    expect(b).not.toHaveBeenCalled();
  });

  it('judges a rebuilt equal value unchanged, by structure', () => {
    const source = new BehaviorSubject<Record<string, readonly number[]>>({ a: [1, 2] });
    const cells = fanOut(source, (grid, key) => grid[key] ?? [], { initial: [] as readonly number[] });
    const seen = vi.fn();
    cells.for('a').subscribe(seen);
    seen.mockClear();

    source.next({ a: [1, 2] });
    expect(seen).not.toHaveBeenCalled();

    source.next({ a: [1, 3] });
    expect(seen).toHaveBeenCalledExactlyOnceWith([1, 3]);
  });

  it('refreshes by hand when the reading changed and the source did not', () => {
    // A selection moving across a grid whose values are all the same is
    // this case, and it is why the reader takes the key rather than the
    // registry taking one projection.
    let selected = 'a';
    const source = new BehaviorSubject<Grid>({ a: 1, b: 1 });
    const cells = fanOut(source, (_grid, key) => (key === selected ? 1 : 0), { initial: 0 });
    const a = cells.for('a');
    const b = cells.for('b');
    expect([a.value, b.value]).toEqual([1, 0]);

    selected = 'b';
    cells.refresh();

    expect([a.value, b.value]).toEqual([0, 1]);
  });

  it('refreshes only the keys it is given', () => {
    let selected = 'a';
    const source = new BehaviorSubject<Grid>({});
    const cells = fanOut(source, (_grid, key) => (key === selected ? 1 : 0), { initial: 0 });
    const a = cells.for('a');
    const b = cells.for('b');

    selected = 'b';
    cells.refresh(['b']);

    expect(a.value).toBe(1); // stale on purpose: it was not in the set
    expect(b.value).toBe(1);
  });

  it('completes a released cell rather than leaving it stale', () => {
    const source = new BehaviorSubject<Grid>({ a: 1 });
    const cells = fanOut(source, (grid, key) => grid[key] ?? 0, { initial: 0 });
    const done = vi.fn();
    cells.for('a').subscribe({ complete: done });

    cells.release('a');

    expect(done).toHaveBeenCalledOnce();
    expect(cells.peek('a')).toBeUndefined();
  });

  it('makes a fresh cell for a key taken again after release', () => {
    const source = new BehaviorSubject<Grid>({ a: 1 });
    const cells = fanOut(source, (grid, key) => grid[key] ?? 0, { initial: 0 });
    const first = cells.for('a');
    cells.release('a');

    const second = cells.for('a');

    expect(second).not.toBe(first);
    expect(second.value).toBe(1);
  });

  it('reads inside a computed as any other cell does', () => {
    const source = new BehaviorSubject<Grid>({ a: 2, b: 3 });
    const cells = fanOut(source, (grid, key) => grid[key] ?? 0, { initial: 0 });
    const a = cells.for('a');
    const b = cells.for('b');
    const total = computed(() => a.value + b.value);
    const seen = vi.fn();
    total.subscribe(seen);

    source.next({ a: 5, b: 3 });

    expect(seen).toHaveBeenLastCalledWith(8);
  });

  it('reads only what the source says it changed', () => {
    const source = new BehaviorSubject<Grid>({ a: 1, b: 1 });
    const read = vi.fn((grid: Grid, key: FanKey) => grid[key] ?? 0);
    const cells = fanOut(source, read, { initial: 0, changed: next => (next.a === 1 ? ['b'] : ['a']) });
    cells.for('a');
    cells.for('b');
    read.mockClear();

    source.next({ a: 1, b: 2 });

    expect(read).toHaveBeenCalledExactlyOnceWith({ a: 1, b: 2 }, 'b');
    expect(cells.for('b').value).toBe(2);
  });

  it('walks every live key when the source does not know what changed', () => {
    const source = new BehaviorSubject<Grid>({ a: 1, b: 1 });
    const read = vi.fn((grid: Grid, key: FanKey) => grid[key] ?? 0);
    const cells = fanOut(source, read, { initial: 0, changed: () => undefined });
    cells.for('a');
    cells.for('b');
    read.mockClear();

    source.next({ a: 2, b: 2 });

    expect(read).toHaveBeenCalledTimes(2);
  });

  it('asks what changed against the snapshot it is replacing', () => {
    const source = new BehaviorSubject<Grid>({ a: 1 });
    const seen: (Grid | undefined)[] = [];
    const cells = fanOut(source, (grid, key) => grid[key] ?? 0, {
      initial: 0,
      changed: (next, previous) => {
        seen.push(previous);
        return Object.keys(next);
      }
    });
    cells.for('a');

    source.next({ a: 2 });

    // `undefined` first: the subscription the first key opens carries
    // the source's current value straight away, and that emission has
    // nothing before it to be a delta against.
    expect(seen).toEqual([undefined, { a: 1 }]);
  });

  it('skips a changed key that is not live', () => {
    const source = new BehaviorSubject<Grid>({ a: 1 });
    const read = vi.fn((grid: Grid, key: FanKey) => grid[key] ?? 0);
    const cells = fanOut(source, read, { initial: 0, changed: () => ['a', 'nobody-is-watching'] });
    cells.for('a');
    read.mockClear();

    source.next({ a: 2 });

    expect(read).toHaveBeenCalledExactlyOnceWith({ a: 2 }, 'a');
  });

  it('says so when a closed registry is asked for a key', () => {
    const cells = fanOut(new BehaviorSubject<Grid>({}), (grid, key) => grid[key] ?? 0, {
      initial: 0,
      label: 'grid'
    });
    cells.close();

    expect(() => cells.for('a')).toThrowError(/fanOut\(grid\).*closed/s);
  });
});
