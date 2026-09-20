import { Observable, Subject, type Subscriber } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Text, type UiChild } from 'gesso-core';

import { computed } from './computed';
import { each } from './each';
import { internalState } from './InternalState';
import { select } from './select';
import { show } from './show';

/**
 * Budgets for the reactive helpers.
 *
 * The risk these guard: sugar that
 * hides cost. A helper an author reaches for on every screen must do
 * work proportional to the change and not to the size of the list, and
 * it must not re-enter the builder when nothing changed. So each helper
 * is driven the way a screen drives it and the counts are asserted:
 * subscriptions opened upstream, row functions called, emissions handed
 * to the parent. They are counts and not timings on purpose, in the
 * shape `LayoutEngine.budget.spec.ts` set.
 */

/**
 * A stream that reports how many subscriptions to it are open, and the
 * most that were ever open at once.
 *
 * Live count rather than a total, because the interesting budget is how
 * many followers a stream carries while a screen holds it. A `.value`
 * read of a stream that nothing is following opens one subscription and
 * closes it in the same statement, which the total would count and the
 * peak correctly does not.
 */
function counted<T>(): {
  source: Observable<T>;
  next: (value: T) => void;
  live: () => number;
  peak: () => number;
} {
  const subject = new Subject<T>();
  let live = 0;
  let peak = 0;
  const source = new Observable<T>((subscriber: Subscriber<T>) => {
    live++;
    peak = Math.max(peak, live);
    const inner = subject.subscribe(subscriber);
    return () => {
      live--;
      inner.unsubscribe();
    };
  });
  return { source, next: value => subject.next(value), live: () => live, peak: () => peak };
}

interface Row {
  readonly id: string;
  readonly label: string;
}

function rows(count: number, from = 0): readonly Row[] {
  const list: Row[] = [];
  for (let index = 0; index < count; index++) {
    list.push({ id: `r${index + from}`, label: `Row ${index + from}` });
  }
  return list;
}

describe('reactive helper budgets', () => {
  describe('each', () => {
    const SIZE = 500;

    it('draws each row once for the first emission and no row twice', () => {
      const list = internalState<readonly Row[]>(rows(SIZE));
      let drawn = 0;
      const children = each(list, 'id', row => {
        drawn++;
        return Text({ text: row.label });
      });
      const emissions: unknown[] = [];
      (children as Observable<readonly UiChild[]>).subscribe(value => emissions.push(value));

      expect(drawn).toBe(SIZE);
      expect(emissions).toHaveLength(1);
    });

    it('draws nothing and emits nothing when the list re-emits the same rows', () => {
      const held = rows(SIZE);
      const list = internalState<readonly Row[]>(held);
      let drawn = 0;
      const children = each(list, 'id', row => {
        drawn++;
        return Text({ text: row.label });
      });
      const emissions: unknown[] = [];
      (children as Observable<readonly UiChild[]>).subscribe(value => emissions.push(value));
      drawn = 0;

      list.value = held;
      list.value = [...held];

      expect(drawn).toBe(0);
      expect(emissions).toHaveLength(1);
    });

    it('draws one row when one row changes, whatever the length of the list', () => {
      const held = rows(SIZE);
      const list = internalState<readonly Row[]>(held);
      let drawn = 0;
      const children = each(list, 'id', row => {
        drawn++;
        return Text({ text: row.label });
      });
      const emissions: (readonly UiChild[])[] = [];
      (children as Observable<readonly UiChild[]>).subscribe(value => emissions.push(value));
      drawn = 0;

      const edited = [...held];
      edited[250] = { id: 'r250', label: 'edited' };
      list.value = edited;

      expect(drawn).toBe(1);
      expect(emissions).toHaveLength(2);
      const before = emissions[0] as readonly UiChild[];
      const after = emissions[1] as readonly UiChild[];
      expect(after[0]).toBe(before[0]);
      expect(after[499]).toBe(before[499]);
    });

    it('draws one row when one row is appended', () => {
      const held = rows(SIZE);
      const list = internalState<readonly Row[]>(held);
      let drawn = 0;
      const children = each(list, 'id', row => {
        drawn++;
        return Text({ text: row.label });
      });
      (children as Observable<readonly UiChild[]>).subscribe();
      drawn = 0;

      list.value = [...held, { id: 'rNew', label: 'New' }];

      expect(drawn).toBe(1);
    });

    it('draws no row at all when rows are removed', () => {
      const held = rows(SIZE);
      const list = internalState<readonly Row[]>(held);
      let drawn = 0;
      const children = each(list, 'id', row => {
        drawn++;
        return Text({ text: row.label });
      });
      (children as Observable<readonly UiChild[]>).subscribe();
      drawn = 0;

      list.value = held.slice(0, SIZE - 10);

      expect(drawn).toBe(0);
    });

    it('opens one subscription to the list, however long it is', () => {
      const list = counted<readonly Row[]>();
      const children = each(list.source, 'id', row => Text({ text: row.label }));
      (children as Observable<readonly UiChild[]>).subscribe();

      list.next(rows(SIZE));

      expect(list.peak()).toBe(1);
    });
  });

  describe('show', () => {
    it('builds its child once, however often the condition is re-asserted', () => {
      const when = internalState(false);
      let built = 0;
      const children = show(when, () => {
        built++;
        return Text({ text: 'here' });
      });
      const emissions: unknown[] = [];
      (children as Observable<readonly UiChild[]>).subscribe(value => emissions.push(value));

      for (let i = 0; i < 100; i++) {
        when.value = true;
        when.value = false;
      }

      expect(built).toBe(1);
      // One for each real change of the condition, and one to begin with.
      expect(emissions).toHaveLength(201);
    });

    it('emits nothing when the condition changes without changing what it says', () => {
      const when = internalState<unknown>(1);
      const emissions: unknown[] = [];
      (show(when, () => Text({ text: 'here' })) as Observable<readonly UiChild[]>).subscribe(value =>
        emissions.push(value)
      );

      for (let i = 2; i < 100; i++) {
        when.value = i;
      }

      expect(emissions).toHaveLength(1);
    });

    it('opens one subscription to the condition', () => {
      const when = counted<boolean>();
      (show(when.source, () => Text({ text: 'here' })) as Observable<readonly UiChild[]>).subscribe();

      when.next(true);

      expect(when.peak()).toBe(1);
    });
  });

  describe('select', () => {
    it('projects once per source emission and emits only on a change', () => {
      const track = internalState({ title: 'One', plays: 0 });
      let projected = 0;
      const emissions: unknown[] = [];
      select(track, entry => {
        projected++;
        return entry.title;
      }).subscribe(value => emissions.push(value));
      projected = 0;

      for (let plays = 1; plays <= 50; plays++) {
        track.value = { title: 'One', plays };
      }
      track.value = { title: 'Two', plays: 50 };

      expect(projected).toBe(51);
      expect(emissions).toEqual(['One', 'Two']);
    });

    it('carries one subscription to the source for four fields read off it', () => {
      const track = counted<{ a: number; b: number; c: number; d: number }>();
      select(track.source, 'a').subscribe();
      select(track.source, 'b').subscribe();
      select(track.source, 'c').subscribe();
      select(track.source, 'd').subscribe();

      track.next({ a: 1, b: 2, c: 3, d: 4 });

      expect(track.peak()).toBe(1);
    });
  });

  describe('computed over a stream', () => {
    it('carries one subscription to a stream several computeds read', () => {
      const stream = counted<number>();
      const first = computed(read => read(stream.source) * 2);
      const second = computed(read => read(stream.source) + 1);
      first.subscribe();
      second.subscribe();

      stream.next(4);

      expect(stream.peak()).toBe(1);
      expect(stream.live()).toBe(1);
      expect(first.value).toBe(8);
      expect(second.value).toBe(5);
    });

    it('lets go of the stream when the last computed following it does', () => {
      const stream = counted<number>();
      const cell = computed(read => read(stream.source) * 2);
      const following = cell.subscribe();
      stream.next(1);
      following.unsubscribe();

      expect(stream.live()).toBe(0);

      const again = cell.subscribe();
      stream.next(2);

      expect(stream.peak()).toBe(1);
      expect(cell.value).toBe(4);
      again.unsubscribe();
      expect(stream.live()).toBe(0);
    });
  });
});
