import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, FocusService, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiNode } from 'gesso-core';
import { TabBar, type TabBarTab } from './TabBar';

const FILES: readonly TabBarTab[] = [
  { value: 'main', label: 'main.ts' },
  { value: 'readme', label: 'README.md', dirty: true },
  { value: 'config', label: 'config.json', disabled: true },
  { value: 'test', label: 'main.spec.ts', detail: 'src', preview: true }
];

let ui: Rendered;
afterEach(() => ui?.unmount());

interface Mounted {
  readonly tabs: BehaviorSubject<readonly TabBarTab[]>;
  readonly value: BehaviorSubject<string>;
  readonly log: string[];
}

/** A bar whose owner applies every change it reports, as an editor would. */
function mount(props: Record<string, unknown> = {}, width = 700): Mounted {
  const tabs = new BehaviorSubject<readonly TabBarTab[]>(FILES);
  const value = new BehaviorSubject('main');
  const log: string[] = [];
  ui = renderTest(
    createComponent(
      () =>
        Column(
          { padding: 10, width },
          createComponent(TabBar, {
            label: 'Open files',
            tabs,
            value,
            onChange: (next: string) => {
              log.push(`change ${next}`);
              value.next(next);
            },
            onClose: (key: string) => {
              log.push(`close ${key}`);
              tabs.next(tabs.value.filter(tab => tab.value !== key));
            },
            onMove: (key: string, index: number) => {
              log.push(`move ${key} ${index}`);
              const list = tabs.value.filter(tab => tab.value !== key);
              list.splice(
                index,
                0,
                tabs.value.find(tab => tab.value === key)!
              );
              tabs.next(list);
            },
            onRename: (key: string, label: string) => {
              log.push(`rename ${key} ${label}`);
              tabs.next(tabs.value.map(tab => (tab.value === key ? { ...tab, label } : tab)));
            },
            onContextMenu: (key: string, at?: { x: number; y: number }) =>
              log.push(`menu ${key} ${at === undefined ? 'keys' : 'pointer'}`),
            onAdd: () => log.push('add'),
            ...props
          })
        ),
      {}
    ),
    { width: width + 20, height: 300 }
  );
  ui.frame();
  return { tabs, value, log };
}

const strip = (): UiNode => ui.getByRole('tablist', { name: 'Open files' });
const tab = (name: string): UiNode => ui.getByRole('tab', { name });
const names = (): string[] => ui.getAllByRole('tab').map(node => ui.getSemantics(node).label ?? '');
const focused = (): UiNode | null => ui.runtime.services.get(FocusService).focused.value;
const selected = (): string | undefined => {
  const node = strip().properties.get('activeDescendant') as UiNode | null | undefined;
  return node == null ? undefined : ui.getSemantics(node).label;
};

async function key(name: string, modifiers: { meta?: boolean; shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(name, modifiers);
  await ui.settle();
}

async function focusStrip(): Promise<void> {
  ui.fireEvent.focus(strip());
  await ui.settle();
}

/** A press on a tab's close button, which sits at its end: a pointer's, since it is not in the semantics tree. */
async function pressClose(node: UiNode): Promise<void> {
  const box = ui.getLayout(node);
  const x = box.x + box.width - 6 - 8;
  const y = box.y + box.height / 2;
  ui.fireEvent.pointerDown(x, y);
  ui.fireEvent.pointerUp(x, y);
  await ui.settle();
}

/** The middle of a node, in the window. */
function middle(node: UiNode): { x: number; y: number } {
  const box = ui.getLayout(node);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

describe('TabBar', () => {
  it('is one tablist whose selected tab is its active descendant', () => {
    mount();
    expect(strip()).toHaveSemantics({ role: 'tablist', name: 'Open files' });
    expect(names()).toEqual(['main.ts', 'README.md', 'config.json', 'main.spec.ts']);
    expect(ui.getSemantics(tab('main.ts')).states).toContain('selected');
    expect(selected()).toBe('main.ts');
    expect(ui.getSemantics(tab('README.md')).description).toBe('unsaved');
    expect(ui.getSemantics(tab('main.spec.ts')).description).toBe('src');
  });

  it('selects a tab that is pressed', async () => {
    const { log } = mount();
    ui.fireEvent.click(tab('README.md'));
    await ui.settle();
    expect(log).toEqual(['change readme']);
    expect(selected()).toBe('README.md');
  });

  it('walks the tabs with the arrows, wrapping and passing a disabled one by', async () => {
    mount();
    await focusStrip();
    await key('ArrowRight');
    expect(selected()).toBe('README.md');
    await key('ArrowRight');
    expect(selected()).toBe('main.spec.ts');
    await key('ArrowRight');
    expect(selected()).toBe('main.ts');
    await key('ArrowLeft');
    expect(selected()).toBe('main.spec.ts');
    await key('Home');
    expect(selected()).toBe('main.ts');
    await key('End');
    expect(selected()).toBe('main.spec.ts');
  });

  it('closes the selected tab with Delete, and a tab by its close button without selecting it', async () => {
    const { log } = mount();
    await focusStrip();
    await key('Delete');
    expect(log).toEqual(['close main']);
    await pressClose(tab('main.spec.ts'));
    expect(log).toEqual(['close main', 'close test']);
    expect(names()).toEqual(['README.md', 'config.json']);
  });

  it('closes on a middle press', async () => {
    const { log } = mount();
    const at = middle(tab('README.md'));
    ui.fireEvent.pointerDown(at.x, at.y, { buttons: 4 });
    ui.fireEvent.pointerUp(at.x, at.y);
    await ui.settle();
    expect(log).toEqual(['close readme']);
  });

  it('draws its close button on the selected tab, none without onClose, and none on a tab that refuses one', () => {
    mount();
    expect(ui.getByText('×')).toBeDefined();
    ui.unmount();
    mount({ onClose: undefined });
    expect(() => ui.getByText('×')).toThrow();
    ui.unmount();
    mount({ tabs: new BehaviorSubject([{ value: 'main', label: 'Pinned', closable: false }]) });
    expect(() => ui.getByText('×')).toThrow();
  });

  it('moves the selected tab with Mod+Shift and the arrows', async () => {
    const { log } = mount();
    await focusStrip();
    await key('ArrowRight', { meta: true, shift: true });
    expect(log).toEqual(['move main 1']);
    expect(names()).toEqual(['README.md', 'main.ts', 'config.json', 'main.spec.ts']);
    await key('ArrowLeft', { ctrl: true, shift: true });
    expect(names()[0]).toBe('main.ts');
    // Not past the start.
    await key('ArrowLeft', { meta: true, shift: true });
    expect(log).toEqual(['move main 1', 'move main 0']);
  });

  it('moves a tab dragged onto another', async () => {
    const { log } = mount();
    const from = middle(tab('main.ts'));
    const to = middle(tab('main.spec.ts'));
    ui.fireEvent.pointerDown(from.x, from.y);
    for (let step = 1; step <= 8; step++) {
      ui.fireEvent.pointerMove(from.x + ((to.x - from.x) * step) / 8, from.y);
      ui.frame();
    }
    ui.fireEvent.pointerUp(to.x, to.y);
    await ui.settle();
    expect(log).toContain('move main 3');
    expect(names()).toEqual(['README.md', 'config.json', 'main.spec.ts', 'main.ts']);
  });

  it('renames in place with F2: Enter keeps the new name, and the keyboard goes back to the strip', async () => {
    const { log } = mount();
    await focusStrip();
    await key('F2');
    const field = ui.getByRole('textbox', { name: 'Rename main.ts' });
    expect(focused()).toBe(field);
    ui.fireEvent.type('index.ts');
    await ui.settle();
    await key('Enter');
    expect(log).toEqual(['rename main index.ts']);
    expect(names()[0]).toBe('index.ts');
    expect(focused()).toBe(strip());
  });

  it('puts the name back on Escape, and keeps an unchanged or empty one', async () => {
    const { log } = mount();
    ui.fireEvent.doubleClick(tab('README.md'));
    await ui.settle();
    ui.fireEvent.type('notes.md');
    await ui.settle();
    await key('Escape');
    expect(names()[1]).toBe('README.md');
    await key('F2');
    await key('Enter');
    expect(log.filter(entry => entry.startsWith('rename'))).toEqual([]);
  });

  it('asks for a tab’s menu from a right click and from the keys', async () => {
    const { log } = mount();
    ui.fireEvent.contextMenu(tab('README.md'));
    await ui.settle();
    expect(log).toEqual(['change readme', 'menu readme pointer']);
    await focusStrip();
    await key('F10', { shift: true });
    expect(log.at(-1)).toBe('menu readme keys');
  });

  it('draws an add button when asked', async () => {
    const { log } = mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'New tab' }));
    await ui.settle();
    expect(log).toEqual(['add']);
  });

  it('lists every tab in a searchable menu once they overflow the strip', async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ value: `f${index}`, label: `file-${index}.ts` }));
    const { log } = mount({ tabs: new BehaviorSubject(many) }, 400);
    await ui.settle();
    const list = ui.getByRole('button', { name: 'All open files' });
    ui.fireEvent.click(list);
    await ui.settle();
    expect(ui.runtime.services.get(OverlayService).entries.value.length).toBeGreaterThan(0);
    ui.fireEvent.type('file-27');
    await ui.settle();
    await key('Enter');
    expect(log).toEqual(['change f27']);
  });

  it('draws no list button while every tab fits', () => {
    mount();
    expect(() => ui.getByRole('button', { name: 'All open files' })).toThrow();
  });

  it('reports a tab from another bar with the same drag type, dropped on it', async () => {
    const received: string[] = [];
    const left = new BehaviorSubject<readonly TabBarTab[]>([{ value: 'a', label: 'a.ts' }]);
    const right = new BehaviorSubject<readonly TabBarTab[]>([{ value: 'b', label: 'b.ts' }]);
    ui = renderTest(
      createComponent(
        () =>
          Column(
            { padding: 10, gap: 20, width: 500 },
            createComponent(TabBar, { label: 'Left', tabs: left, defaultValue: 'a', dragType: 'files' }),
            createComponent(TabBar, {
              label: 'Right',
              tabs: right,
              defaultValue: 'b',
              dragType: 'files',
              onDrop: (key: string, index: number) => received.push(`${key} ${index}`)
            })
          ),
        {}
      ),
      { width: 520, height: 300 }
    );
    ui.frame();
    const from = middle(tab('a.ts'));
    const to = middle(tab('b.ts'));
    ui.fireEvent.pointerDown(from.x, from.y);
    for (let step = 1; step <= 8; step++) {
      ui.fireEvent.pointerMove(from.x + ((to.x - from.x) * step) / 8, from.y + ((to.y - from.y) * step) / 8);
      ui.frame();
    }
    ui.fireEvent.pointerUp(to.x, to.y);
    await ui.settle();
    expect(received).toEqual(['a 0']);
  });
});
