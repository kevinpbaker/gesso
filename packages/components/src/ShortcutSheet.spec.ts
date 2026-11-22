import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, FocusService, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import {
  Column,
  describeShortcut,
  parseShortcut,
  shortcut,
  shortcuts,
  UiShortcutRegistry,
  type UiNode
} from 'gesso-core';
import { Button } from './Button';
import { KeyCap } from './KeyCap';
import { filterShortcutSections, ShortcutSheet, shortcutSections } from './ShortcutSheet';

let ui: Rendered;
afterEach(() => ui?.unmount());

const noop = (): void => {};

describe('shortcutSections', () => {
  it('groups the live shortcuts, the general group first, keys that share a label on one row', () => {
    const registry = new UiShortcutRegistry();
    registry.register({ keys: 'j', label: 'Next issue', group: 'List', run: noop });
    registry.register({ keys: 'ArrowDown', label: 'Next issue', group: 'List', run: noop });
    registry.register({ keys: 'Mod+K', label: 'Command palette', run: noop });
    const sections = shortcutSections(registry.active(null), [{ label: 'Bold', keys: 'Mod+B', group: 'Editor' }]);
    expect(sections.map(section => section.group)).toEqual(['General', 'List', 'Editor']);
    expect(sections[1]!.rows).toEqual([
      {
        label: 'Next issue',
        keys: ['j', 'ArrowDown'],
        name: `Next issue, ${describeShortcut(parseShortcut('j'))} or ${describeShortcut(parseShortcut('ArrowDown'))}`
      }
    ]);
  });

  it('lists a key two shortcuts want for the one that would run', () => {
    const registry = new UiShortcutRegistry();
    registry.register({ keys: 'Delete', label: 'Delete issue', run: noop });
    registry.register({ keys: 'Delete', label: 'Delete comment', priority: 1, run: noop });
    const rows = shortcutSections(registry.active(null)).flatMap(section => section.rows);
    expect(rows.map(row => row.label)).toEqual(['Delete comment']);
  });

  it('filters by the start of a word in what a row does, its group or its keys', () => {
    const sections = shortcutSections(
      [],
      [
        { label: 'Next issue', keys: 'ArrowDown', group: 'List' },
        { label: 'Preview markdown', keys: 'Mod+Shift+V', group: 'Editor' }
      ]
    );
    expect(filterShortcutSections(sections, 'down').flatMap(section => section.rows.map(row => row.label))).toEqual([
      'Next issue'
    ]);
    expect(filterShortcutSections(sections, 'editor prev')[0]!.rows[0]!.label).toBe('Preview markdown');
    expect(filterShortcutSections(sections, 'zzz')).toEqual([]);
    expect(filterShortcutSections(sections, ' ')).toHaveLength(2);
  });
});

describe('KeyCap', () => {
  it('draws each key of a shortcut as a cap, and says it in words', () => {
    ui = renderTest(createComponent(KeyCap, { keys: 'Mod+Shift+P' }), { width: 300, height: 100 });
    ui.frame();
    const group = ui.getByRole('group');
    expect(ui.getSemantics(group).label).toBe(describeShortcut(parseShortcut('Mod+Shift+P')));
    expect(ui.getByText('P')).toBeDefined();
  });

  it('puts "then" between the presses of a chord', () => {
    ui = renderTest(createComponent(KeyCap, { keys: 'g d' }), { width: 300, height: 100 });
    ui.frame();
    expect(ui.getByText('then')).toBeDefined();
    expect(ui.getByText('G')).toBeDefined();
  });
});

describe('ShortcutSheet', () => {
  function mount(props: Record<string, unknown> = {}) {
    const registry = new UiShortcutRegistry();
    ui = renderTest(
      createComponent(
        () =>
          Column(
            {
              width: 700,
              height: 600,
              modifiers: [
                shortcuts({ registry }),
                shortcut({ registry, keys: 'Mod+K', label: 'Command palette', scoped: false, run: noop }),
                shortcut({ registry, keys: 'j', label: 'Next issue', group: 'List', scoped: false, run: noop }),
                shortcut({ registry, keys: 'k', label: 'Previous issue', group: 'List', scoped: false, run: noop })
              ]
            },
            createComponent(Button, { label: 'Board' }),
            createComponent(ShortcutSheet, {
              registry,
              shortcut: '?',
              entries: [{ label: 'Bold', keys: 'Mod+B', group: 'Editor' }],
              ...props
            })
          ),
        {}
      ),
      { width: 700, height: 600 }
    );
    ui.frame();
    return { registry };
  }

  const isOpen = (): boolean => ui.runtime.services.get(OverlayService).entries.value.length > 0;
  const focused = (): UiNode | null => ui.runtime.services.get(FocusService).focused.value;
  const rows = (): string[] => {
    try {
      return ui.getAllByRole('listitem').map(node => ui.getSemantics(node).label ?? '');
    } catch {
      return [];
    }
  };

  async function key(name: string, modifiers: { shift?: boolean; meta?: boolean } = {}): Promise<void> {
    ui.fireEvent.press(name, modifiers);
    await ui.settle();
  }

  async function openFromBoard(): Promise<UiNode> {
    const board = ui.getByRole('button', { name: 'Board' });
    ui.fireEvent.focus(board);
    await ui.settle();
    await key('?', { shift: true });
    return board;
  }

  it('opens on its key as a dialog, with the filter focused', async () => {
    mount();
    await openFromBoard();
    expect(isOpen()).toBe(true);
    expect(ui.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeDefined();
    expect(focused()).toBe(ui.getByRole('searchbox', { name: 'Filter shortcuts' }));
  });

  it('lists the live shortcuts and its entries by group, but not its own key', async () => {
    mount();
    await openFromBoard();
    expect(ui.getAllByRole('heading').map(node => ui.getSemantics(node).label)).toEqual(['General', 'List', 'Editor']);
    expect(rows().map(row => row.split(',')[0])).toEqual(['Command palette', 'Next issue', 'Previous issue', 'Bold']);
    expect(rows()[0]).toBe(`Command palette, ${describeShortcut(parseShortcut('Mod+K'))}`);
  });

  it('narrows as the filter is typed into', async () => {
    mount();
    await openFromBoard();
    ui.fireEvent.type('prev');
    await ui.settle();
    expect(rows().map(row => row.split(',')[0])).toEqual(['Previous issue']);
    ui.fireEvent.type('zzz');
    await ui.settle();
    expect(ui.getByText('No shortcut matches')).toBeDefined();
  });

  it('closes on its own key typed in the filter, and on Escape, giving focus back', async () => {
    mount();
    const board = await openFromBoard();
    await key('?', { shift: true });
    expect(isOpen()).toBe(false);
    expect(focused()).toBe(board);
    await openFromBoard();
    await key('Escape');
    expect(isOpen()).toBe(false);
  });

  it('closes when its own key arrives as typing, as it does in a browser', async () => {
    mount();
    await openFromBoard();
    ui.fireEvent.type('next?');
    await ui.settle();
    expect(isOpen()).toBe(false);
  });

  it('follows a controlled open', async () => {
    const open = new BehaviorSubject(false);
    const changes: boolean[] = [];
    mount({ open, onOpenChange: (next: boolean) => changes.push(next), shortcut: undefined });
    open.next(true);
    await ui.settle();
    expect(isOpen()).toBe(true);
    await key('Escape');
    expect(changes).toEqual([false]);
  });
});
