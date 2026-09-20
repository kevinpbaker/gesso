import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { SortBar } from './KeyboardExample';

function mount() {
  return renderTest(createComponent(SortBar, {}), { width: 420, height: 280 });
}

/**
 * The page's claim is that the screen is operable with keys alone, so
 * the spec never sends a press: every step below is a key, and the
 * queries are by role and name, which is what an assistive technology
 * has to go on.
 */
describe('the docs keyboard example', () => {
  // #region keys
  it('opens, walks and chooses without a pointer', () => {
    const ui = mount();
    ui.fireEvent.focus(ui.getByRole('combobox'));

    ui.fireEvent.press('Enter');
    ui.frame();
    expect(ui.getByRole('listbox')).toBeDefined();

    ui.fireEvent.press('ArrowDown');
    ui.fireEvent.press('Enter');
    ui.frame();

    // The list is gone and the trigger says what was chosen.
    expect(ui.queryByRole('listbox')).toBeNull();
    expect(ui.getSemantics(ui.getByRole('combobox')).valueText).toBe('Oldest first');
  });

  it('moves on with Tab, and activates the button from the key it binds', () => {
    const ui = mount();
    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.press('Enter');
    ui.frame();
    ui.fireEvent.press('ArrowDown');
    ui.fireEvent.press('Enter');
    ui.frame();

    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('button', { name: 'Apply' }));

    ui.fireEvent.press('Enter');
    ui.frame();

    expect(ui.getByText('Sorted by oldest first')).toBeDefined();
  });
  // #endregion keys

  // #region escape
  it('closes on Escape without choosing, and gives the trigger back', () => {
    const ui = mount();
    const trigger = ui.getByRole('combobox');
    ui.fireEvent.focus(trigger);

    ui.fireEvent.press('Enter');
    ui.frame();
    ui.fireEvent.press('ArrowDown');
    ui.fireEvent.press('Escape');
    ui.frame();

    expect(ui.queryByRole('listbox')).toBeNull();
    expect(ui.getSemantics(trigger).valueText).toBe('Most recent');
    // The trap released, and released it to the control that opened it.
    expect(ui.runtime.input.focus.focusedNode).toBe(trigger);
    expect(ui.runtime.input.focus.trapped).toBe(false);
  });
  // #endregion escape

  it('keeps the keyboard inside the open list', () => {
    const ui = mount();
    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.press('Enter');
    ui.frame();

    expect(ui.runtime.input.focus.trapped).toBe(true);
    ui.fireEvent.tab();

    // Tab cannot walk out to the Apply button while the list is open.
    expect(ui.runtime.input.focus.focusedNode).not.toBe(ui.getByRole('button', { name: 'Apply' }));
    expect(ui.getByRole('listbox')).toBeDefined();
  });

  it('announces every option with its place in the set', () => {
    const ui = mount();
    ui.fireEvent.focus(ui.getByRole('combobox'));
    ui.fireEvent.press('Enter');
    ui.frame();

    const options = ui.getAllByRole('option');
    expect(options.map(option => ui.getSemantics(option).label)).toEqual(['Most recent', 'Oldest first', 'Name']);
    expect(options.map(option => ui.getSemantics(option).posInSet)).toEqual([1, 2, 3]);
    expect(ui.getSemantics(options[0]).states).toEqual(['selected']);
  });
});
