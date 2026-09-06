import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Text, type UiChild, type UiElement } from '@gesso/core';

import { createComponent } from './createComponent';
import { each } from './each';
import type { Inputs } from './FunctionComponent';

interface Row {
  readonly id: string;
  readonly label: string;
}

function Cell(inputs: Inputs<{ row: Row }>): UiChild {
  return Text({ text: inputs.row.value.label });
}

/** The children of one emission, as a list this file can assert on. */
function collect(children: UiChild): (readonly UiChild[])[] {
  const seen: (readonly UiChild[])[] = [];
  (children as Observable<readonly UiChild[]>).subscribe(list => seen.push(list));
  return seen;
}

function keysOf(list: readonly UiChild[]): unknown[] {
  return list.map(child => (child as UiElement).props.key);
}

describe('each', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keys every row from `by` and gives the parent one list per emission', () => {
    const rows = new BehaviorSubject<readonly Row[]>([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' }
    ]);
    const seen = collect(each(rows, 'id', row => Text({ text: row.label })));

    expect(seen).toHaveLength(1);
    expect(keysOf(seen[0] as readonly UiChild[])).toEqual(['a', 'b']);
  });

  it('takes the key from a function as readily as from a field name', () => {
    const rows = new BehaviorSubject<readonly Row[]>([{ id: 'a', label: 'A' }]);
    const seen = collect(
      each(
        rows,
        row => `row-${row.id}`,
        row => Text({ text: row.label })
      )
    );

    expect(keysOf(seen[0] as readonly UiChild[])).toEqual(['row-a']);
  });

  it('keeps a row that has not changed and rebuilds only the one that has', () => {
    const first: Row = { id: 'a', label: 'A' };
    const second: Row = { id: 'b', label: 'B' };
    const rows = new BehaviorSubject<readonly Row[]>([first, second]);
    const seen = collect(each(rows, 'id', row => Text({ text: row.label })));

    rows.next([first, { id: 'b', label: 'B2' }]);

    expect(seen).toHaveLength(2);
    const before = seen[0] as readonly UiChild[];
    const after = seen[1] as readonly UiChild[];
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });

  it('emits nothing when the list re-emits the same rows', () => {
    const rows: readonly Row[] = [{ id: 'a', label: 'A' }];
    const source = new BehaviorSubject<readonly Row[]>(rows);
    const seen = collect(each(source, 'id', row => Text({ text: row.label })));

    source.next(rows);
    source.next([...rows]);

    expect(seen).toHaveLength(1);
  });

  it('drops the rows that left and keeps the ones that stayed', () => {
    const a: Row = { id: 'a', label: 'A' };
    const b: Row = { id: 'b', label: 'B' };
    const rows = new BehaviorSubject<readonly Row[]>([a, b]);
    const seen = collect(each(rows, 'id', row => Text({ text: row.label })));

    rows.next([b]);

    const after = seen[1] as readonly UiChild[];
    expect(keysOf(after)).toEqual(['b']);
    expect(after[0]).toBe((seen[0] as readonly UiChild[])[1]);
  });

  it('reorders by moving the elements it already built', () => {
    const a: Row = { id: 'a', label: 'A' };
    const b: Row = { id: 'b', label: 'B' };
    const rows = new BehaviorSubject<readonly Row[]>([a, b]);
    const seen = collect(each(rows, 'id', row => Text({ text: row.label })));

    rows.next([b, a]);

    expect(keysOf(seen[1] as readonly UiChild[])).toEqual(['b', 'a']);
  });

  it('keys a component row without the row function naming a key', () => {
    const row: Row = { id: 'a', label: 'A' };
    const rows = new BehaviorSubject<readonly Row[]>([row]);
    const seen = collect(each(rows, 'id', item => createComponent(Cell, { row: item })));

    expect(((seen[0] as readonly UiChild[])[0] as { key?: unknown }).key).toBe('a');
  });

  it('leaves a key the row function set itself', () => {
    const rows = new BehaviorSubject<readonly Row[]>([{ id: 'a', label: 'A' }]);
    const seen = collect(each(rows, 'id', row => Text({ key: 'mine', text: row.label })));

    expect(keysOf(seen[0] as readonly UiChild[])).toEqual(['mine']);
  });

  it('takes a plain array, for a list that is not reactive at all', () => {
    const seen = collect(each([{ id: 'a', label: 'A' }] as readonly Row[], 'id', row => Text({ text: row.label })));

    expect(keysOf(seen[0] as readonly UiChild[])).toEqual(['a']);
  });

  it('refuses two rows claiming one key, rather than losing one of them', () => {
    const rows = new BehaviorSubject<readonly Row[]>([
      { id: 'a', label: 'A' },
      { id: 'a', label: 'B' }
    ]);

    let failure: Error | undefined;
    (each(rows, 'id', row => Text({ text: row.label })) as Observable<readonly UiChild[]>).subscribe({
      error: (thrown: Error) => (failure = thrown)
    });

    expect(failure?.message).toMatch(/Duplicate key 'a'/);
  });

  it('warns when a dynamic list is keyed by index', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = new Subject<readonly Row[]>();

    collect(each(rows, undefined, row => Text({ text: row.label })));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('keyed by index'));
  });
});
