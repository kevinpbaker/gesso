import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, FocusService, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, shortcut, shortcuts, UiShortcutRegistry, type UiNode } from 'gesso-core';
import { Button } from './Button';
import {
  CommandPalette,
  commandPaletteMatch,
  filterCommands,
  shortcutCommands,
  type CommandPaletteItem
} from './CommandPalette';

const ran: string[] = [];
const ITEMS: readonly CommandPaletteItem[] = [
  {
    value: 'new',
    label: 'New file',
    group: 'File',
    shortcut: '⌘N',
    run: () => ran.push('new')
  },
  {
    value: 'save',
    label: 'Save',
    group: 'File',
    keywords: ['write'],
    run: () => ran.push('save')
  },
  { value: 'print', label: 'Print', group: 'File', disabled: true },
  {
    value: 'terminal',
    label: 'Toggle terminal',
    group: 'View',
    run: () => ran.push('terminal')
  },
  {
    value: 'theme',
    label: 'Color theme',
    group: 'View',
    detail: 'Light, dark',
    keywords: ['appearance']
  }
];

let ui: Rendered;
afterEach(() => {
  ui?.unmount();
  ran.length = 0;
});

interface Mounted {
  readonly registry: UiShortcutRegistry;
  readonly selected: string[];
  readonly queries: string[];
}

function mount(props: Record<string, unknown> = {}): Mounted {
  const registry = new UiShortcutRegistry();
  const selected: string[] = [];
  const queries: string[] = [];
  ui = renderTest(
    createComponent(
      () =>
        Column(
          {
            padding: 10,
            width: 800,
            height: 600,
            modifiers: [
              shortcuts({ registry }),
              shortcut({
                registry,
                keys: 'Mod+B',
                label: 'Toggle sidebar',
                group: 'View',
                scoped: false,
                run: () => ran.push('sidebar')
              }),
              shortcut({
                registry,
                keys: 'Mod+T',
                label: 'Toggle terminal',
                scoped: false,
                run: () => ran.push('terminal by key')
              })
            ]
          },
          createComponent(Button, { label: 'Editor' }),
          createComponent(CommandPalette, {
            items: ITEMS,
            registry,
            shortcut: 'Mod+K',
            onSelect: (value: string) => selected.push(value),
            onQueryChange: (query: string) => queries.push(query),
            ...props
          })
        ),
      {}
    ),
    { width: 800, height: 600 }
  );
  ui.frame();
  return { registry, selected, queries };
}

const isOpen = (): boolean => ui.runtime.services.get(OverlayService).entries.value.length > 0;
const focused = (): UiNode | null => ui.runtime.services.get(FocusService).focused.value;
const field = (): UiNode => ui.getByRole('combobox', { name: 'Command palette' });
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

async function key(name: string, modifiers: { meta?: boolean; shift?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(name, modifiers);
  await ui.settle();
}

async function type(text: string): Promise<void> {
  ui.fireEvent.type(text);
  await ui.settle();
}

async function openFromEditor(): Promise<UiNode> {
  const editor = ui.getByRole('button', { name: 'Editor' });
  ui.fireEvent.focus(editor);
  await ui.settle();
  await key('k', { meta: true });
  return editor;
}

describe('commandPaletteMatch', () => {
  const item = (label: string, extra: Partial<CommandPaletteItem> = {}): CommandPaletteItem => ({
    value: label,
    label,
    ...extra
  });

  it('finds a word as a subsequence and says which characters matched', () => {
    const match = commandPaletteMatch(item('Toggle terminal'), 'tgtm');
    expect(match).not.toBeNull();
    expect(match!.positions).toEqual([0, 2, 7, 10]);
  });

  it('needs every word, in the label or elsewhere', () => {
    expect(commandPaletteMatch(item('Save', { keywords: ['write'] }), 'save write')).not.toBeNull();
    expect(commandPaletteMatch(item('Save'), 'save print')).toBeNull();
  });

  it('ignores case and accents, one character for one', () => {
    const match = commandPaletteMatch(item('Café menu'), 'CAFE');
    expect(match?.positions).toEqual([0, 1, 2, 3]);
  });

  it('ranks the label’s start, then a word’s start, then a keyword, then a loose subsequence', () => {
    const list = [
      item('Debug console'),
      item('Run tests', { keywords: ['debug'] }),
      item('Start debugging'),
      item('Debugger'),
      item('Delete bundle go')
    ];
    expect(filterCommands(list, 'debug').map(entry => entry.label)).toEqual([
      'Debugger',
      'Debug console',
      'Start debugging',
      'Run tests',
      'Delete bundle go'
    ]);
  });

  it('lists everything, as given, for an empty query', () => {
    expect(filterCommands(ITEMS, '  ').map(entry => entry.value)).toEqual(ITEMS.map(entry => entry.value));
  });
});

describe('shortcutCommands', () => {
  it('lists the live shortcuts with their keys, under Shortcuts unless they name a group', () => {
    const registry = new UiShortcutRegistry();
    registry.register({ keys: 'Mod+S', label: 'Save all', run: () => {} });
    registry.register({
      keys: 'g d',
      label: 'Go to dashboard',
      group: 'Go',
      run: () => {}
    });
    const items = shortcutCommands(registry, null);
    expect(items.map(entry => [entry.label, entry.group])).toEqual([
      ['Save all', 'Shortcuts'],
      ['Go to dashboard', 'Go']
    ]);
    expect(items[0]!.shortcut).toBeTruthy();
  });
});

describe('CommandPalette', () => {
  it('opens from its shortcut as a modal dialog with the field focused', async () => {
    mount();
    expect(isOpen()).toBe(false);
    await openFromEditor();
    expect(isOpen()).toBe(true);
    expect(ui.getByRole('dialog', { name: 'Command palette' })).toBeDefined();
    expect(focused()).toBe(field());
    expect(ui.getSemantics(field()).controls).toBe(ui.getByRole('listbox', { name: 'Command palette' }).id);
  });

  it('lists the items under their groups, then the live shortcuts, but not its own', async () => {
    mount();
    await openFromEditor();
    expect(ui.getByRole('group', { name: 'File' })).toBeDefined();
    expect(ui.getByRole('group', { name: 'View' })).toBeDefined();
    expect(options()).toEqual(['New file', 'Save', 'Print', 'Toggle terminal', 'Color theme', 'Toggle sidebar']);
    expect(highlighted()).toBe('New file');
  });

  it('gives an item a shortcut’s keys when it has the same label, and says them in words', async () => {
    mount();
    await openFromEditor();
    const terminal = ui.getAllByRole('option').find(node => ui.getSemantics(node).label === 'Toggle terminal')!;
    expect(ui.getSemantics(terminal).description).toMatch(/T$/);
    expect(ui.getSemantics(terminal).description).not.toMatch(/[⌘⌃]/);
  });

  it('ranks what is typed as one list, the shorter label first in a tie', async () => {
    const mounted = mount();
    await openFromEditor();
    await type('tog');
    expect(options()).toEqual(['Toggle sidebar', 'Toggle terminal']);
    expect(highlighted()).toBe('Toggle sidebar');
    expect(() => ui.getByRole('group', { name: 'View' })).toThrow();
    expect(mounted.queries.at(-1)).toBe('tog');
    await type('zzz');
    expect(options()).toEqual([]);
    expect(ui.getByText('Nothing matches')).toBeDefined();
  });

  it('finds an item by a keyword', async () => {
    mount();
    await openFromEditor();
    await type('appearance');
    expect(options()).toEqual(['Color theme']);
  });

  it('walks the rows with the arrows, wrapping and passing a disabled one by', async () => {
    mount();
    await openFromEditor();
    await key('ArrowDown');
    expect(highlighted()).toBe('Save');
    await key('ArrowDown');
    expect(highlighted()).toBe('Toggle terminal');
    await key('ArrowUp');
    await key('ArrowUp');
    await key('ArrowUp');
    expect(highlighted()).toBe('Toggle sidebar');
    await key('Home');
    expect(highlighted()).toBe('New file');
    await key('End');
    expect(highlighted()).toBe('Toggle sidebar');
  });

  it('closes, hands focus back, and then runs the row Enter chose', async () => {
    let focusWhenRun: UiNode | null = null;
    const items = ITEMS.map(item =>
      item.value === 'save' ? { ...item, run: () => ((focusWhenRun = focused()), ran.push('save')) } : item
    );
    const mounted = mount({ items });
    const editor = await openFromEditor();
    await type('save');
    await key('Enter');
    expect(isOpen()).toBe(false);
    expect(ran).toEqual(['save']);
    expect(mounted.selected).toEqual(['save']);
    expect(focusWhenRun).toBe(editor);
    expect(focused()).toBe(editor);
  });

  it('runs a listed shortcut', async () => {
    mount();
    await openFromEditor();
    await type('sidebar');
    await key('Enter');
    expect(ran).toEqual(['sidebar']);
  });

  it('does not run a disabled row', async () => {
    const mounted = mount();
    await openFromEditor();
    await type('print');
    await key('Enter');
    expect(mounted.selected).toEqual([]);
  });

  it('closes on Escape and gives focus back', async () => {
    mount();
    const editor = await openFromEditor();
    await key('Escape');
    expect(isOpen()).toBe(false);
    expect(focused()).toBe(editor);
    expect(ran).toEqual([]);
  });

  it('starts empty again at the next opening, or with its initial query', async () => {
    mount({ initialQuery: 'col' });
    await openFromEditor();
    expect(options()).toEqual(['Color theme']);
    await type('zzz');
    await key('Escape');
    await openFromEditor();
    expect(options()).toEqual(['Color theme']);
  });

  it('shows the items as given without filter, for a search held elsewhere', async () => {
    const mounted = mount({
      filter: false,
      registry: undefined,
      shortcut: undefined,
      defaultOpen: true
    });
    await ui.settle();
    await type('zzz');
    expect(options()).toEqual(['New file', 'Save', 'Print', 'Toggle terminal', 'Color theme']);
    expect(mounted.queries.at(-1)).toBe('zzz');
  });

  it('follows a controlled open, and asks to close', async () => {
    const open = new BehaviorSubject(false);
    const changes: boolean[] = [];
    mount({
      open,
      onOpenChange: (next: boolean) => changes.push(next),
      registry: undefined,
      shortcut: undefined
    });
    open.next(true);
    await ui.settle();
    expect(isOpen()).toBe(true);
    await key('Escape');
    expect(changes).toEqual([false]);
    open.next(false);
    await ui.settle();
    expect(isOpen()).toBe(false);
  });
});
