import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiNode } from 'gesso-core';
import { Combobox, filterCombobox, type ComboboxOption } from './Combobox';

const PEOPLE: readonly ComboboxOption[] = [
  { value: 'ada', label: 'Ada Okafor', detail: '@ada' },
  { value: 'grace', label: 'Grace Hopper', detail: '@grace' },
  { value: 'alan', label: 'Alan Turing', detail: '@alan', disabled: true },
  { value: 'kim', label: 'Kim Lee', detail: '@kim', keywords: ['design'] }
];

let ui: Rendered;
afterEach(() => ui?.unmount());

function mount(props: Record<string, unknown>): void {
  ui = renderTest(
    createComponent(
      () => Column({ padding: 10 }, createComponent(Combobox, { label: 'Assignee', options: PEOPLE, ...props })),
      {}
    ),
    { width: 500, height: 500 }
  );
  ui.frame();
}

const field = (): UiNode => ui.getByRole('combobox', { name: 'Assignee' });
const isOpen = (): boolean => ui.runtime.services.get(OverlayService).entries.value.length > 0;
/** The listed options' names; none when the list is empty or shut. */
function options(): string[] {
  try {
    return ui.getAllByRole('option').map(node => ui.getSemantics(node).label ?? '');
  } catch {
    return [];
  }
}
const highlighted = (): string | undefined => {
  const node = field().properties.get('activeDescendant') as UiNode | null | undefined;
  return node == null ? undefined : ui.getSemantics(node).label;
};

async function focus(): Promise<void> {
  ui.fireEvent.focus(field());
  await ui.settle();
}

async function key(name: string): Promise<void> {
  ui.fireEvent.press(name);
  await ui.settle();
}

async function type(text: string): Promise<void> {
  ui.fireEvent.type(text);
  await ui.settle();
}

describe('filterCombobox', () => {
  it('ranks a label that starts with the query, then a word, then anywhere, then a keyword', () => {
    const list: ComboboxOption[] = [
      { value: '1', label: 'Bug report', keywords: ['triage'] },
      { value: '2', label: 'Debug' },
      { value: '3', label: 'Ladybug' },
      { value: '4', label: 'Bugfix' }
    ];
    expect(filterCombobox(list, 'bug').map(option => option.label)).toEqual([
      'Bug report',
      'Bugfix',
      'Debug',
      'Ladybug'
    ]);
    expect(filterCombobox(list, 'tri').map(option => option.label)).toEqual(['Bug report']);
    expect(filterCombobox(list, '  ')).toHaveLength(4);
  });
});

describe('Combobox', () => {
  it('is a combobox that says it is collapsed until it opens', async () => {
    mount({ defaultValue: 'ada' });
    expect(field()).toHaveSemantics({ role: 'combobox', name: 'Assignee' });
    expect(ui.getSemantics(field()).states).toContain('collapsed');
    expect(ui.getSemantics(field()).valueText).toBe('Ada Okafor');
    await focus();
    await key('ArrowDown');
    expect(isOpen()).toBe(true);
    expect(ui.getSemantics(field()).states).toContain('expanded');
    // Showing its own value's label, it lists everything, highlight on the value.
    expect(options()).toEqual(['Ada Okafor', 'Grace Hopper', 'Alan Turing', 'Kim Lee']);
    expect(highlighted()).toBe('Ada Okafor');
  });

  it('filters as it is typed into, and chooses with Enter', async () => {
    const changes: string[] = [];
    mount({ defaultValue: '', onChange: (value: string) => changes.push(value) });
    await focus();
    await type('ho');
    expect(isOpen()).toBe(true);
    expect(options()).toEqual(['Grace Hopper']);
    expect(highlighted()).toBe('Grace Hopper');
    await key('Enter');
    expect(changes).toEqual(['grace']);
    expect(isOpen()).toBe(false);
    expect(ui.getSemantics(field()).valueText).toBe('Grace Hopper');
  });

  it('finds an option by a keyword, and says when nothing matches', async () => {
    mount({ defaultValue: '' });
    await focus();
    await type('design');
    expect(options()).toEqual(['Kim Lee']);
    await type('zzz');
    expect(options()).toEqual([]);
    expect(ui.getByText('No matches')).toBeDefined();
  });

  it('selects the chosen label on focus, so typing starts a new search', async () => {
    mount({ defaultValue: 'ada' });
    await focus();
    await type('gr');
    expect(options()).toEqual(['Grace Hopper']);
  });

  it('walks past a disabled option and never chooses one', async () => {
    mount({ defaultValue: 'grace' });
    await focus();
    await key('ArrowDown');
    expect(highlighted()).toBe('Grace Hopper');
    await key('ArrowDown');
    expect(highlighted()).toBe('Kim Lee');
    await key('ArrowUp');
    expect(highlighted()).toBe('Grace Hopper');
  });

  it('closes on Escape, and a second Escape puts back the chosen label', async () => {
    mount({ defaultValue: 'ada' });
    await focus();
    await type('x');
    expect(isOpen()).toBe(true);
    await key('Escape');
    expect(isOpen()).toBe(false);
    expect(ui.getSemantics(field()).valueText).not.toBe('Ada Okafor');
    await key('Escape');
    expect(ui.getSemantics(field()).valueText).toBe('Ada Okafor');
  });

  it('shows a value the application changes, and puts it back when focus leaves mid-search', async () => {
    const value = new BehaviorSubject('ada');
    mount({ value, onChange: (next: string) => value.next(next) });
    value.next('kim');
    await ui.settle();
    expect(ui.getSemantics(field()).valueText).toBe('Kim Lee');
    await focus();
    await type('gr');
    ui.fireEvent.blur();
    await ui.settle();
    expect(isOpen()).toBe(false);
    expect(ui.getSemantics(field()).valueText).toBe('Kim Lee');
  });

  it('chooses with a press on an option, keeping focus in the field', async () => {
    mount({ defaultValue: '' });
    await focus();
    await key('ArrowDown');
    const grace = ui.getAllByRole('option').find(node => ui.getSemantics(node).label === 'Grace Hopper')!;
    ui.fireEvent.click(grace);
    await ui.settle();
    expect(ui.getSemantics(field()).valueText).toBe('Grace Hopper');
    expect(ui.runtime.input.focus.focusedNode).toBe(field());
  });

  it('hands what is typed to a search elsewhere, and lists what it found as given', async () => {
    const found = new BehaviorSubject<readonly ComboboxOption[]>([]);
    const queries: string[] = [];
    mount({
      defaultValue: '',
      filter: false,
      options: found,
      onQueryChange: (query: string) => {
        queries.push(query);
        // A search that matches on something the label doesn't show.
        found.next(query === 'w' ? [{ value: 'WEB-1', label: 'Fix the login redirect' }] : []);
      }
    });
    await focus();
    await type('w');
    expect(queries).toEqual(['w']);
    expect(options()).toEqual(['Fix the login redirect']);
    expect(highlighted()).toBe('Fix the login redirect');
    await key('Enter');
    expect(ui.getSemantics(field()).valueText).toBe('Fix the login redirect');
  });

  describe('with multiple', () => {
    it('toggles values, keeps the list open, and takes the last off with Backspace', async () => {
      const changes: (readonly string[])[] = [];
      mount({
        multiple: true,
        defaultValues: ['ada'],
        onValuesChange: (values: readonly string[]) => changes.push(values)
      });
      expect(ui.getByRole('listitem', { name: 'Ada Okafor' })).toBeDefined();
      await focus();
      await type('kim');
      await key('Enter');
      expect(changes.at(-1)).toEqual(['ada', 'kim']);
      expect(isOpen()).toBe(true);
      expect(ui.getSemantics(field()).valueText).toBe('');
      expect(options()).toHaveLength(4);
      // Chosen options say so.
      const kim = ui.getAllByRole('option').find(node => ui.getSemantics(node).label === 'Kim Lee')!;
      expect(ui.getSemantics(kim).states).toContain('selected');
      await key('Backspace');
      expect(changes.at(-1)).toEqual(['ada']);
    });

    it('takes a value off with its remove button', async () => {
      const changes: (readonly string[])[] = [];
      mount({
        multiple: true,
        defaultValues: ['ada', 'grace'],
        onValuesChange: (values: readonly string[]) => changes.push(values)
      });
      ui.fireEvent.click(ui.getByRole('button', { name: 'Remove Ada Okafor' }));
      await ui.settle();
      expect(changes.at(-1)).toEqual(['grace']);
    });
  });
});
