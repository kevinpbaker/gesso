import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { createComponent, FindService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Column, Text, type UiChild } from 'gesso-core';

import { FindBar } from './FindBar';

/** A page with something to find on it, and whatever bars the spec asks for. */
function mount(...bars: UiChild[]) {
  const ui = renderTest(Column({ width: 480, height: 240 }, Text({ text: 'the cat and the dog' }), ...bars), {
    width: 480,
    height: 240
  });
  return { ...ui, find: ui.runtime.services.get(FindService) };
}

/** What the bar's field draws: the query, or the placeholder over nothing. */
function fieldText(ui: ReturnType<typeof mount>): unknown {
  return ui.getByRole('searchbox').properties.get('value');
}

describe('FindBar', () => {
  it('opens with the caret in its field, and counts what is typed', () => {
    const ui = mount(createComponent(FindBar, {}));
    ui.find.openFind();
    ui.frame();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('searchbox'));

    ui.fireEvent.type('the');
    ui.frame();

    expect(ui.getByText('1 of 2')).toBeTruthy();
  });

  it('reopens with a field that agrees with the counter', () => {
    const ui = mount(createComponent(FindBar, {}));
    ui.find.openFind();
    ui.frame();
    ui.fireEvent.type('the');
    ui.frame();

    ui.fireEvent.press('Escape');
    ui.frame();
    ui.find.openFind();
    ui.frame();

    // Closing drops the query. The field kept its own copy and showed
    // "the" over "No results" until something was typed.
    expect(ui.find.query.value).toBe('');
    expect(fieldText(ui)).toBe('');
    expect(ui.getByText('No results')).toBeTruthy();
  });

  it('does not take the field away from another bar when it unmounts', () => {
    const first = new BehaviorSubject(true);
    const ui = mount(
      first.pipe(map(on => (on ? [createComponent(FindBar, {})] : []))),
      createComponent(FindBar, { placeholder: 'Second' })
    );

    first.next(false);
    ui.frame();
    ui.find.openFind();
    ui.frame();

    // The second bar registered last. The first one's unmount cleared
    // the service's field regardless, so opening put the caret nowhere.
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('searchbox'));
  });
});
