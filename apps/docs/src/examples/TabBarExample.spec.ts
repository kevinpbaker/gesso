import { afterEach, describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Editor } from './TabBarExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

const names = () => ui.getAllByRole('tab').map(node => ui.getSemantics(node).label);

async function press(key: string, modifiers: { meta?: boolean; shift?: boolean } = {}) {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

async function mount() {
  ui = renderTest(createComponent(Editor, {}), { width: 640, height: 300 });
  await ui.settle();
  ui.fireEvent.focus(ui.getByRole('tablist', { name: 'Open files' }));
  await ui.settle();
}

/**
 * The page claims the arrows select, Delete closes and hands over to the
 * neighbour, Mod+Shift and an arrow move, F2 renames, and + opens a new
 * file. Each is a test.
 */
describe('the docs tab bar example', () => {
  it('selects with the arrows', async () => {
    await mount();
    await press('ArrowRight');
    expect(ui.getByText('Editing notes.md')).toBeDefined();
  });

  it('closes with Delete and selects the neighbour', async () => {
    await mount();
    await press('Delete');
    expect(names()).toEqual(['notes.md', 'styles.css', 'App.spec.tsx']);
    expect(ui.getByText('Editing notes.md')).toBeDefined();
  });

  it('moves the selected tab with Mod+Shift and an arrow', async () => {
    await mount();
    await press('ArrowRight', { meta: true, shift: true });
    expect(names()).toEqual(['notes.md', 'App.tsx', 'styles.css', 'App.spec.tsx']);
  });

  it('renames with F2', async () => {
    await mount();
    await press('F2');
    ui.fireEvent.type('Main.tsx');
    await ui.settle();
    await press('Enter');
    expect(names()[0]).toBe('Main.tsx');
  });

  it('opens a new file from +', async () => {
    await mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'New file' }));
    await ui.settle();
    expect(names().at(-1)).toBe('Untitled-1');
    expect(ui.getByText('Editing Untitled-1')).toBeDefined();
  });
});
