import { afterEach, describe, expect, it } from 'vitest';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Writer } from './CommandPaletteExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

const isOpen = () => ui.runtime.services.get(OverlayService).entries.value.length > 0;
const options = () => ui.getAllByRole('option').map(node => ui.getSemantics(node).label);

async function press(key: string, modifiers: { meta?: boolean; shift?: boolean } = {}) {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

async function mount() {
  ui = renderTest(createComponent(Writer, {}), { width: 520, height: 420 });
  await ui.settle();
  ui.fireEvent.focus(ui.getByRole('button', { name: 'Commands' }));
  await ui.settle();
}

/**
 * The page claims Mod+Shift+P opens it, that `zen` and the keyword `dark` find
 * their commands, that Print is passed by, and that Save is listed from
 * the registry. Each is a test.
 */
describe('the docs command palette example', () => {
  it('opens on Mod+Shift+P and lists Save from the registry under Shortcuts', async () => {
    await mount();
    await press('P', { meta: true, shift: true });
    expect(isOpen()).toBe(true);
    expect(options()).toEqual(['New document', 'Open recent', 'Print', 'Toggle zen mode', 'Color theme', 'Save']);
    expect(ui.getByRole('group', { name: 'Shortcuts' })).toBeDefined();
  });

  it('finds zen mode by typing and runs it with Enter', async () => {
    await mount();
    await press('P', { meta: true, shift: true });
    ui.fireEvent.type('zen');
    await ui.settle();
    await press('Enter');
    expect(isOpen()).toBe(false);
    expect(ui.getByText('Last command: Toggle zen mode')).toBeDefined();
  });

  it('finds the colour theme by a keyword', async () => {
    await mount();
    await press('P', { meta: true, shift: true });
    ui.fireEvent.type('dark');
    await ui.settle();
    expect(options()).toEqual(['Color theme']);
  });

  it('steps over Print', async () => {
    await mount();
    await press('P', { meta: true, shift: true });
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter');
    expect(ui.getByText('Last command: Toggle zen mode')).toBeDefined();
  });
});
