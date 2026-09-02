import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { pick, pickKeys } from './pick';

interface View {
  readonly count: number;
  readonly items: readonly string[];
}

describe('pick', () => {
  it('emits a key only when that key changes', () => {
    const view = new BehaviorSubject<View>({ count: 1, items: ['a'] });
    const counts: number[] = [];
    pick(view, 'count').subscribe(count => counts.push(count));

    view.next({ count: 1, items: ['a', 'b'] });
    view.next({ count: 2, items: ['a', 'b'] });

    expect(counts).toEqual([1, 2]);
  });

  it('splits a view into one Observable per key', () => {
    const first = ['a'];
    const view = new BehaviorSubject<View>({ count: 1, items: first });
    const split = pickKeys(view, ['count', 'items']);
    const items: (readonly string[])[] = [];
    split.items.subscribe(list => items.push(list));

    // A view model that keeps the same array when the list did not
    // change costs its followers nothing; a new array is a change, and
    // the differ downstream decides whether it patches anything.
    view.next({ count: 2, items: first });
    expect(items).toHaveLength(1);
    view.next({ count: 2, items: ['b'] });
    expect(items).toEqual([['a'], ['b']]);
  });
});
