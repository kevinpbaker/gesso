import { afterEach, describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Editor } from './StatusBarExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

async function mount() {
  ui = renderTest(createComponent(Editor, {}), { width: 640, height: 320 });
  await ui.settle();
}

/**
 * The page claims typing moves the caret readout and shows Saving, a
 * press on an item is reported, and the zoom steps and resets. Each is a
 * test.
 */
describe('the docs status bar example', () => {
  it('follows the caret and shows Saving while typing', async () => {
    await mount();
    ui.fireEvent.focus(ui.getByRole('textbox', { name: 'Note' }));
    ui.fireEvent.press('End');
    ui.fireEvent.type('!');
    await ui.settle();
    expect(ui.getByText('Saving…')).toBeDefined();
    expect(ui.getByText(/^Ln 1, Col \d+$/)).toBeDefined();
  });

  it('reports a press on the error count', async () => {
    await mount();
    ui.fireEvent.click(ui.getByRole('button', { name: '1 error' }));
    await ui.settle();
    expect(ui.getByText('Last pressed: problems')).toBeDefined();
  });

  it('zooms in, and back to 100% from the percentage', async () => {
    await mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Zoom in' }));
    await ui.settle();
    expect(ui.getByText('110%')).toBeDefined();
    ui.fireEvent.click(ui.getByRole('button', { name: /^Zoom 110%/ }));
    await ui.settle();
    expect(ui.getByText('100%')).toBeDefined();
  });
});
