import { afterEach, describe, expect, it } from 'vitest';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { AssignTo } from './MenuSearchExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

const isOpen = () => ui.runtime.services.get(OverlayService).entries.value.length > 0;
const names = () => ui.getAllByRole('menuitem').map(node => ui.getSemantics(node).label);

async function press(key: string) {
  ui.fireEvent.press(key);
  await ui.settle();
}

async function open() {
  ui = renderTest(createComponent(AssignTo, {}), { width: 460, height: 460 });
  await ui.settle();
  ui.fireEvent.click(ui.getByRole('button', { name: 'Assign' }));
  await ui.settle();
}

async function type(text: string) {
  ui.fireEvent.type(text);
  await ui.settle();
}

/**
 * The page claims a name, a name typed without its accent and a team
 * each find their people, that Enter assigns, that Eli is passed by,
 * and that Space is a space. Each is a test.
 */
describe('the docs searchable menu example', () => {
  it('finds Chen by name and assigns him with Enter', async () => {
    await open();
    await type('chen');
    expect(names()).toEqual(['Chen Wei']);
    await press('Enter');
    expect(isOpen()).toBe(false);
    expect(ui.getByText('Assigned to: Chen Wei')).toBeDefined();
  });

  it('finds Inês without the accent, and a team by its keyword', async () => {
    await open();
    await type('ines');
    expect(names()).toEqual(['Inês Carvalho']);
    for (let i = 0; i < 4; i++) await press('Backspace');
    await type('infra');
    expect(names()).toEqual(['Eli Moreau', 'Bo Lindqvist']);
  });

  it('passes Eli by', async () => {
    await open();
    await type('infra');
    await press('ArrowDown');
    await press('Enter');
    expect(ui.getByText('Assigned to: Bo Lindqvist')).toBeDefined();
  });

  it('types a space rather than choosing', async () => {
    await open();
    await type('grace h');
    expect(isOpen()).toBe(true);
    expect(names()).toEqual(['Grace Hopper']);
  });

  it('says when nobody matches', async () => {
    await open();
    await type('zzz');
    expect(ui.getByText('Nobody by that name')).toBeDefined();
  });
});
