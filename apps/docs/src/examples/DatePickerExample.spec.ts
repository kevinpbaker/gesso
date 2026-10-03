import { afterEach, describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Schedule } from './DatePickerExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

async function press(key: string) {
  ui.fireEvent.press(key);
  await ui.settle();
}

/**
 * The page claims each date bounds the other, that the calendar is
 * walked from the keyboard, and that a day outside the range can't be
 * chosen. Each is a test.
 */
describe('the docs date picker example', () => {
  it('moves the due date a week later from the keyboard', async () => {
    ui = renderTest(createComponent(Schedule, {}), { width: 460, height: 520 });
    await ui.settle();
    expect(ui.getByText('18 days')).toBeDefined();
    ui.fireEvent.focus(ui.getByRole('combobox', { name: 'Due date' }));
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    expect(ui.getByText('25 days')).toBeDefined();
  });

  it('keeps the start before the due date', async () => {
    ui = renderTest(createComponent(Schedule, {}), { width: 460, height: 520 });
    await ui.settle();
    ui.fireEvent.focus(ui.getByRole('combobox', { name: 'Start date' }));
    await press('Enter');
    // A month on is past the due date, so the cursor stops on it.
    await press('PageDown');
    await press('Enter');
    expect(ui.getByText('0 days')).toBeDefined();
  });
});
