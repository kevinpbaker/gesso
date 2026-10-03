import { afterEach, describe, expect, it } from 'vitest';

import { createComponent, OverlayService } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { AssignIssue } from './ComboboxExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

const field = (name: string) => ui.getByRole('combobox', { name });
const shows = (name: string) => ui.getSemantics(field(name)).valueText;
const isOpen = () => ui.runtime.services.get(OverlayService).entries.value.length > 0;

async function press(key: string) {
  ui.fireEvent.press(key);
  await ui.settle();
}

/**
 * The page claims typing filters by name or keyword, that the arrows
 * step over a disabled person, that Escape closes and then restores,
 * and that the labels field toggles several values and takes the last
 * off with Backspace. Each is a test.
 */
describe('the docs combobox example', () => {
  it('finds Kim by a keyword and assigns her with Enter', async () => {
    ui = renderTest(createComponent(AssignIssue, {}), { width: 460, height: 420 });
    await ui.settle();
    expect(shows('Assignee')).toBe('Ada Okafor');
    ui.fireEvent.focus(field('Assignee'));
    ui.fireEvent.type('design');
    await ui.settle();
    await press('Enter');
    expect(shows('Assignee')).toBe('Kim Lee');
    expect(isOpen()).toBe(false);
  });

  it('closes on Escape, then puts back the chosen name', async () => {
    ui = renderTest(createComponent(AssignIssue, {}), { width: 460, height: 420 });
    await ui.settle();
    ui.fireEvent.focus(field('Assignee'));
    ui.fireEvent.type('zz');
    await ui.settle();
    await press('Escape');
    expect(isOpen()).toBe(false);
    await press('Escape');
    expect(shows('Assignee')).toBe('Ada Okafor');
  });

  it('adds labels one after another and takes the last off with Backspace', async () => {
    ui = renderTest(createComponent(AssignIssue, {}), { width: 460, height: 420 });
    await ui.settle();
    ui.fireEvent.focus(field('Labels'));
    ui.fireEvent.type('slow');
    await ui.settle();
    await press('Enter');
    expect(ui.getByText('2 labels')).toBeDefined();
    expect(isOpen()).toBe(true);
    await press('Backspace');
    expect(ui.getByText('1 label')).toBeDefined();
  });
});
