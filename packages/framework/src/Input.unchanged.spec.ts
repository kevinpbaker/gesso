import { describe, expect, it } from 'vitest';

import { input, InputCell } from './Input';

describe('an input cell given the value it holds', () => {
  it('tells nobody', () => {
    const cell = new InputCell(1);
    const seen: number[] = [];
    cell.subscribe(value => seen.push(value));

    cell.next(1);
    cell.next(2);
    cell.next(2);
    cell.next(Number.NaN);
    cell.next(Number.NaN); // the same value by `Object.is`, though not by `===`

    expect(seen).toEqual([1, 2, Number.NaN]);
  });

  it('still tells everyone about a new object, however alike', () => {
    const first = { size: 1 };
    const cell = new InputCell(first);
    const seen: object[] = [];
    cell.subscribe(value => seen.push(value));

    cell.next(first);
    cell.next({ size: 1 });

    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toBe(first);
  });

  it('tells nobody when a fallback cell lands back on the value it shows', () => {
    const source = new InputCell<number | undefined>(undefined);
    const size = input(source, 16);
    const seen: number[] = [];
    size.subscribe(value => seen.push(value));

    source.next(16); // the fallback was already showing 16
    source.next(20);
    source.next(undefined);

    expect(seen).toEqual([16, 20, 16]);
  });
});
