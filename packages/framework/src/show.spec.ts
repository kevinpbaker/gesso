import { BehaviorSubject, type Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Text, type UiChild, type UiElement } from '@gesso/core';

import { internalState } from './InternalState';
import { show } from './show';

function collect(children: UiChild): (readonly UiChild[])[] {
  const seen: (readonly UiChild[])[] = [];
  (children as Observable<readonly UiChild[]>).subscribe(list => seen.push(list));
  return seen;
}

describe('show', () => {
  it('draws the child while the condition holds and nothing while it does not', () => {
    const when = internalState(false);
    const seen = collect(show(when, () => Text({ text: 'here' })));

    expect(seen[0]).toEqual([]);
    when.value = true;
    expect(seen[1]).toHaveLength(1);
    when.value = false;
    expect(seen[2]).toEqual([]);
  });

  it('gives the child a stable key, so returning to it returns to its node', () => {
    const when = internalState(true);
    const seen = collect(show(when, () => Text({ text: 'here' })));

    expect(((seen[0] as readonly UiChild[])[0] as UiElement).props.key).toBe('when');
  });

  it('builds the child once and hands the same one back', () => {
    const when = internalState(true);
    let built = 0;
    const seen = collect(
      show(when, () => {
        built++;
        return Text({ text: 'here' });
      })
    );

    when.value = false;
    when.value = true;

    expect(built).toBe(1);
    expect((seen[2] as readonly UiChild[])[0]).toBe((seen[0] as readonly UiChild[])[0]);
  });

  it('emits nothing when the condition changes without changing what it says', () => {
    const when = new BehaviorSubject<unknown>(1);
    const seen = collect(show(when, () => Text({ text: 'here' })));

    when.next(2);
    when.next('yes');

    expect(seen).toHaveLength(1);
  });

  it('draws the other branch when one is given', () => {
    const when = internalState(false);
    const seen = collect(
      show(
        when,
        () => Text({ text: 'yes' }),
        () => Text({ text: 'no' })
      )
    );

    expect(((seen[0] as readonly UiChild[])[0] as UiElement).props.key).toBe('otherwise');
    when.value = true;
    expect(((seen[1] as readonly UiChild[])[0] as UiElement).props.key).toBe('when');
  });

  it('takes a plain value, for a condition that is not reactive', () => {
    const seen = collect(show(true, () => Text({ text: 'here' })));

    expect(seen[0]).toHaveLength(1);
  });
});
