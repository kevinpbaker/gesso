import { afterEach, describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Board } from './ViewportExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

const board = () => ui.getByRole('group', { name: 'Board' });
const zoom = () => ui.getSemantics(board()).description;

async function mount() {
  ui = renderTest(createComponent(Board, {}), { width: 720, height: 460 });
  await ui.settle();
}

async function press(key: string) {
  ui.fireEvent.press(key);
  await ui.settle();
}

/**
 * The page claims the board starts fitted, the keys and controls zoom
 * and fit, and a note is a button that opens. Each is a test.
 */
describe('the docs viewport example', () => {
  it('starts with the whole board in view', async () => {
    await mount();
    expect(zoom()).toMatch(/^Zoom \d+%$/);
    expect(Number(/\d+/.exec(zoom() ?? '')![0])).toBeLessThan(100);
  });

  it('zooms to 100% with 0 and back to the fit with 1', async () => {
    await mount();
    const fitted = zoom();
    ui.fireEvent.focus(board());
    await press('0');
    expect(zoom()).toBe('Zoom 100%');
    await press('1');
    expect(zoom()).toBe(fitted);
  });

  it('zooms in from the controls', async () => {
    await mount();
    const fitted = zoom();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Zoom in' }));
    await ui.settle();
    expect(zoom()).not.toBe(fitted);
  });

  it('opens a note that is pressed', async () => {
    await mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Note 8' }));
    await ui.settle();
    expect(ui.getByText('Opened: Note 8')).toBeDefined();
  });
});
