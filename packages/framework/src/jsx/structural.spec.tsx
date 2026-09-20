import { BehaviorSubject, type Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { UiChild, UiElement } from 'gesso-core';

import { Each } from '../each';
import { internalState } from '../InternalState';
import { Show } from '../show';

/**
 * `<Each>` and `<Show>` as tags.
 *
 * Both are capitalised, which is what lets `of={rows}` and the row
 * function share one type parameter: a lowercase tag is looked up in
 * `JSX.IntrinsicElements`, which cannot be generic, so `row` would be
 * `any`. Neither goes through `createComponent`; each returns the
 * observable list of children directly, which is what these assert.
 */

interface Row {
  readonly id: string;
  readonly label: string;
}

function collect(children: UiChild): (readonly UiChild[])[] {
  const seen: (readonly UiChild[])[] = [];
  (children as Observable<readonly UiChild[]>).subscribe(list => seen.push(list));
  return seen;
}

describe('<Each> and <Show> as tags', () => {
  it('draws one keyed child per row, with the row typed from the list', () => {
    const rows = new BehaviorSubject<readonly Row[]>([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' }
    ]);
    const seen = collect(
      <Each of={rows} by="id">
        {row => <text>{row.label}</text>}
      </Each>
    );

    const children = seen[0] as readonly UiChild[];
    expect(children.map(child => (child as UiElement).props.key)).toEqual(['a', 'b']);
    expect((children[0] as UiElement).props.text).toBe('A');
  });

  it('takes a key function as readily as a field name', () => {
    const rows = new BehaviorSubject<readonly Row[]>([{ id: 'a', label: 'A' }]);
    const seen = collect(
      <Each of={rows} by={row => `row-${row.id}`}>
        {row => <text>{row.label}</text>}
      </Each>
    );

    expect(((seen[0] as readonly UiChild[])[0] as UiElement).props.key).toBe('row-a');
  });

  it('shows and hides one child, and adds no node of its own', () => {
    const when = internalState(false);
    const seen = collect(<Show when={when}>{() => <text>here</text>}</Show>);

    expect(seen[0]).toEqual([]);
    when.value = true;
    const shown = seen[1] as readonly UiChild[];
    expect(shown).toHaveLength(1);
    expect((shown[0] as UiElement).props.text).toBe('here');
  });

  it('draws the other branch when one is given', () => {
    const when = internalState(false);
    const seen = collect(
      <Show when={when} otherwise={() => <text>no</text>}>
        {() => <text>yes</text>}
      </Show>
    );

    expect(((seen[0] as readonly UiChild[])[0] as UiElement).props.text).toBe('no');
  });
});
