import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, FocusService, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import type { UiNode } from 'gesso-core';
import { Menu, type MenuItem } from './Menu';

const LABELS: readonly MenuItem[] = [
  { value: 'bug', label: 'Bug', checked: true },
  { value: 'feature', label: 'Feature request', checked: false },
  { value: 'perf', label: 'Performance', checked: false, keywords: ['slow', 'speed'] },
  { value: 'a11y', label: 'Accessibility', checked: false, disabled: true },
  { value: 'docs', label: 'Documentation', checked: false, separator: true },
  {
    value: 'more',
    label: 'More labels',
    items: [
      { value: 'design', label: 'Design' },
      { value: 'infra', label: 'Infrastructure' }
    ]
  }
];

let ui: Rendered;
afterEach(() => ui?.unmount());

function mount(props: Record<string, unknown> = {}) {
  const open = new BehaviorSubject(false);
  const chosen: string[] = [];
  ui = renderTest(
    createComponent(Menu, {
      open,
      at: { x: 20, y: 20 },
      label: 'Labels',
      items: LABELS,
      searchable: true,
      searchPlaceholder: 'Filter labels',
      onSelect: (value: string) => chosen.push(value),
      onOpenChange: (next: boolean) => open.next(next),
      ...props
    }),
    { width: 500, height: 500 }
  );
  open.next(true);
  ui.frame();
  return { open, chosen };
}

const isOpen = (): boolean => ui.runtime.services.get(OverlayService).entries.value.length > 0;
const focused = (): UiNode | null => ui.runtime.services.get(FocusService).focused.value;
const field = (): UiNode => ui.getByRole('searchbox', { name: 'Filter labels' });
/** The rows listed, by name, items with a check and plain ones alike. */
function rows(): string[] {
  const named = (role: 'menuitem' | 'menuitemcheckbox'): UiNode[] => {
    try {
      return ui.getAllByRole(role);
    } catch {
      return [];
    }
  };
  return [...named('menuitemcheckbox'), ...named('menuitem')]
    .sort((a, b) => ui.getLayout(a).y - ui.getLayout(b).y)
    .map(node => ui.getSemantics(node).label ?? '');
}
const highlighted = (): string | undefined => {
  const node = field().properties.get('activeDescendant') as UiNode | null | undefined;
  return node == null ? undefined : ui.getSemantics(node).label;
};

async function type(text: string): Promise<void> {
  ui.fireEvent.type(text);
  await ui.settle();
}

async function key(name: string): Promise<void> {
  ui.fireEvent.press(name);
  await ui.settle();
}

describe('a searchable Menu', () => {
  it('opens with its field focused, every item listed and the first highlighted', async () => {
    mount();
    await ui.settle();
    expect(focused()).toBe(field());
    expect(ui.getByRole('menu', { name: 'Labels' })).toBeDefined();
    expect(rows()).toEqual(['Bug', 'Feature request', 'Performance', 'Accessibility', 'Documentation', 'More labels']);
    expect(highlighted()).toBe('Bug');
    expect(ui.getAllByRole('separator')).toHaveLength(1);
  });

  it('narrows to what matches as it is typed, best first, and draws no rules', async () => {
    mount();
    await ui.settle();
    await type('ac');
    expect(rows()).toEqual(['Accessibility', 'Performance']);
    // Accessibility is disabled: the highlight starts on the first match that can be chosen.
    expect(highlighted()).toBe('Performance');
    expect(() => ui.getAllByRole('separator')).toThrow();
  });

  it('finds an item by a keyword, and by a subsequence', async () => {
    mount();
    await ui.settle();
    await type('slow');
    expect(rows()).toEqual(['Performance']);
    await key('Backspace');
    await key('Backspace');
    await key('Backspace');
    await key('Backspace');
    await type('ftr');
    expect(rows()).toEqual(['Feature request']);
  });

  it('chooses the highlighted match with Enter and closes', async () => {
    const { chosen } = mount();
    await ui.settle();
    await type('feat');
    await key('Enter');
    expect(chosen).toEqual(['feature']);
    expect(isOpen()).toBe(false);
  });

  it('takes Space as a space, not a choice', async () => {
    const { chosen } = mount();
    await ui.settle();
    await type('feature re');
    expect(chosen).toEqual([]);
    expect(rows()).toEqual(['Feature request']);
  });

  it('walks the matches with the arrows, passing a disabled one by', async () => {
    mount();
    await ui.settle();
    await key('ArrowDown');
    await key('ArrowDown');
    await key('ArrowDown');
    expect(highlighted()).toBe('Documentation');
    await key('ArrowUp');
    expect(highlighted()).toBe('Performance');
  });

  it('goes to the ends with Home and End only while the field is empty', async () => {
    mount();
    await ui.settle();
    await key('End');
    expect(highlighted()).toBe('More labels');
    await key('Home');
    expect(highlighted()).toBe('Bug');
    await type('e');
    const first = highlighted();
    await key('End');
    expect(highlighted()).toBe(first);
  });

  it('says when nothing matches, and Enter then chooses nothing', async () => {
    const { chosen } = mount({ emptyText: 'No such label' });
    await ui.settle();
    await type('zzz');
    expect(rows()).toEqual([]);
    expect(ui.getByText('No such label')).toBeDefined();
    await key('Enter');
    expect(chosen).toEqual([]);
    expect(isOpen()).toBe(true);
  });

  it('keeps its settings as checkboxes while it narrows', async () => {
    mount();
    await ui.settle();
    await type('bug');
    const bug = ui.getByRole('menuitemcheckbox', { name: 'Bug' });
    expect(ui.getSemantics(bug).states).toContain('checked');
  });

  it('opens a submenu with Right while the field is empty', async () => {
    const { chosen } = mount();
    await ui.settle();
    await key('End');
    await key('ArrowRight');
    expect(ui.getByRole('menu', { name: 'More labels' })).toBeDefined();
    await key('Enter');
    expect(chosen).toEqual(['design']);
  });

  it('starts with every item listed again at the next opening', async () => {
    const { open } = mount();
    await ui.settle();
    await type('perf');
    expect(ui.getSemantics(field()).valueText).toBe('perf');
    await key('Escape');
    expect(isOpen()).toBe(false);
    open.next(true);
    await ui.settle();
    expect(rows()).toHaveLength(6);
    expect(ui.getSemantics(field()).valueText ?? '').toBe('');
  });
});

describe('a Menu that is not searchable', () => {
  it('has no field, and Space still chooses', async () => {
    const { chosen } = mount({ searchable: false });
    await ui.settle();
    expect(() => ui.getByRole('searchbox')).toThrow();
    await key(' ');
    expect(chosen).toEqual(['bug']);
  });
});
