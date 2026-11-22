import { afterEach, describe, expect, it } from 'vitest';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Board } from './ShortcutSheetExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

const isOpen = () => ui.runtime.services.get(OverlayService).entries.value.length > 0;
const labels = () => ui.getAllByRole('listitem').map(node => (ui.getSemantics(node).label ?? '').split(',')[0]);

async function press(key: string, modifiers: { shift?: boolean } = {}) {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

async function mount() {
  ui = renderTest(createComponent(Board, {}), { width: 640, height: 560 });
  await ui.settle();
  ui.fireEvent.focus(ui.getByRole('button', { name: 'Keyboard shortcuts' }));
  await ui.settle();
}

/**
 * The page claims `?` opens the sheet, it lists the registry's keys by
 * group with the editor's entries, Next card's two keys share a row, the
 * filter narrows, and `?` closes it. Each is a test.
 */
describe('the docs shortcut sheet example', () => {
  it('opens on ? and lists the keys by group, two keys on one row', async () => {
    await mount();
    await press('?', { shift: true });
    expect(isOpen()).toBe(true);
    expect(labels()).toEqual(['Command palette', 'New card', 'Next card', 'Go to done', 'Bold', 'Italic']);
    expect(ui.getAllByText('or').length).toBeGreaterThan(0);
  });

  it('narrows with the filter, and closes on ? again', async () => {
    await mount();
    await press('?', { shift: true });
    ui.fireEvent.type('go');
    await ui.settle();
    expect(labels()).toEqual(['Go to done']);
    await press('?', { shift: true });
    expect(isOpen()).toBe(false);
  });

  it('opens from the button', async () => {
    await mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Keyboard shortcuts' }));
    await ui.settle();
    expect(isOpen()).toBe(true);
  });
});
