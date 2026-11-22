import { afterEach, describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Workbench } from './PanelGroupExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

const divider = (name: string) => ui.getByRole('separator', { name: `Resize ${name}` });
const value = (name: string) => ui.getSemantics(divider(name)).valueNow;

async function press(key: string, modifiers: { shift?: boolean } = {}) {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

async function mount() {
  ui = renderTest(createComponent(Workbench, {}), { width: 720, height: 420 });
  await ui.settle();
}

/**
 * The page claims the arrows move a divider, Enter and the button fold
 * the explorer away and back, a double click puts a panel back, and the
 * terminal is a group inside the first. Each is a test.
 */
describe('the docs panel group example', () => {
  it('moves the explorer’s divider with the arrows', async () => {
    await mount();
    ui.fireEvent.focus(divider('Explorer'));
    await press('ArrowRight', { shift: true });
    expect(value('Explorer')).toBe(210);
  });

  it('folds the explorer away with Enter, and the button brings it back', async () => {
    await mount();
    ui.fireEvent.focus(divider('Explorer'));
    await press('Enter');
    expect(value('Explorer')).toBe(0);
    expect(ui.getByRole('button', { name: 'Show explorer' })).toBeDefined();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Show explorer' }));
    await ui.settle();
    expect(value('Explorer')).toBe(160);
  });

  it('puts the outline back on a double click', async () => {
    await mount();
    ui.fireEvent.focus(divider('Outline'));
    await press('End');
    expect(value('Outline')).toBe(240);
    ui.fireEvent.doubleClick(divider('Outline'));
    await ui.settle();
    expect(value('Outline')).toBe(140);
  });

  it('has the terminal under the text, in a group of its own', async () => {
    await mount();
    ui.fireEvent.focus(divider('Terminal'));
    await press('ArrowUp');
    expect(value('Terminal')).toBe(100);
  });
});
