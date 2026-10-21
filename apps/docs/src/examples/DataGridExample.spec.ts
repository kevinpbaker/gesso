import { describe, expect, it } from 'vitest';

import type { UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Budget, ROWS } from './DataGridExample';

const SIZE = { width: 460, height: 360 };

function budget(): Rendered {
  const ui = renderTest(createComponent(Budget, {}), SIZE);
  ui.frame();
  return ui;
}

const grid = (ui: Rendered): UiNode => ui.getByRole('grid');
const press = (ui: Rendered, key: string, modifiers?: { shift?: boolean; ctrl?: boolean }): void => {
  ui.fireEvent.press(key, modifiers);
  ui.frame();
};
/** The line under the grid that starts with `prefix`. */
const line = (ui: Rendered, prefix: string): string => {
  const found = ui.textOf().find(text => text.startsWith(prefix));
  if (found === undefined) {
    throw new Error(`the example has no line starting "${prefix}"`);
  }
  return found;
};
/** The value drawn in the active cell. */
const activeValue = (ui: Rendered): string | undefined =>
  ui
    .getAllByRole('gridcell')
    .map(node => ui.getSemantics(node))
    .find(record => record.states?.includes('selected'))?.label;

/**
 * What the page claims: a grid that announces itself and where each row
 * sits in all ten thousand; edits that commit through the application
 * and show up in the read-only Total beside them; a Total that refuses
 * to be edited; the keys in the keyboard table; and a frozen first
 * column that stays put while the rest scroll sideways.
 */
describe('the docs data grid example', () => {
  it('announces a grid, its column headers and where each row sits', () => {
    const ui = budget();

    expect(grid(ui)).toHaveSemantics({ role: 'grid', name: 'Budget' });
    expect(ui.getAllByRole('columnheader').map(node => ui.getSemantics(node).label)).toEqual(
      expect.arrayContaining(['Item', 'Owner', 'Q1'])
    );
    const rows = ui.getAllByRole('row').slice(1);
    expect(ui.getSemantics(rows[0])).toMatchObject({ posInSet: 1, setSize: ROWS });
    // A window of them, not ten thousand.
    expect(rows.length).toBeLessThan(30);
  });

  it('commits an edit through the application, and the total follows it', () => {
    const ui = budget();
    ui.fireEvent.click(ui.getAllByRole('gridcell', { name: '111' })[0]);
    ui.frame();
    expect(line(ui, 'Active:')).toBe(`Active: Q1, row 1 of ${ROWS}`);

    // Typing replaces the cell; Enter commits and moves down.
    press(ui, '5');
    ui.fireEvent.type('00');
    press(ui, 'Enter');

    expect(line(ui, 'Last edit:')).toBe('Last edit: Q1 of row 1 set to "500"');
    expect(line(ui, 'Active:')).toBe(`Active: Q1, row 2 of ${ROWS}`);
    // 500 + 148 + 185 + 222, which was 111 + 148 + 185 + 222 before.
    expect(ui.getAllByRole('gridcell', { name: '1,055' })).toHaveLength(1);
  });

  it('refuses to edit the total, and puts a value back on Escape', () => {
    const ui = budget();
    ui.fireEvent.focus(grid(ui));
    ui.frame();

    press(ui, 'ArrowRight');
    press(ui, 'ArrowRight');
    press(ui, 'ArrowRight');
    press(ui, 'ArrowRight');
    press(ui, 'ArrowRight');
    press(ui, 'ArrowRight');
    expect(line(ui, 'Active:')).toBe(`Active: TOTAL, row 1 of ${ROWS}`);
    press(ui, 'Enter');
    press(ui, '9');
    expect(ui.queryByRole('textbox')).toBeNull();

    press(ui, 'Home');
    press(ui, 'x');
    expect(ui.getByRole('textbox')).toBeTruthy();
    press(ui, 'Escape');
    expect(ui.queryByRole('textbox')).toBeNull();
    expect(activeValue(ui)).toBe('Paper 1');
    expect(line(ui, 'Last edit:')).toBe('Last edit: nothing yet');
  });

  it('walks to the far corner of ten thousand rows from the keyboard', () => {
    const ui = budget();
    ui.fireEvent.focus(grid(ui));
    ui.frame();

    press(ui, 'End', { ctrl: true });
    ui.frame();
    expect(line(ui, 'Active:')).toBe(`Active: NOTE, row ${ROWS} of ${ROWS}`);
    const rows = ui.getAllByRole('row');
    expect(ui.getSemantics(rows.at(-1)!).posInSet).toBe(ROWS);

    press(ui, 'Home', { ctrl: true });
    ui.frame();
    expect(line(ui, 'Active:')).toBe(`Active: ITEM, row 1 of ${ROWS}`);
    press(ui, 'PageDown');
    expect(line(ui, 'Active:')).not.toBe(`Active: ITEM, row 1 of ${ROWS}`);
    press(ui, 'Tab');
    expect(line(ui, 'Active:')).toMatch(/^Active: OWNER/);
  });

  it('keeps the frozen Item column in place while the rest scroll sideways', () => {
    const ui = budget();
    ui.fireEvent.focus(grid(ui));
    ui.frame();
    const view = ui.getVisibleBox(grid(ui));

    press(ui, 'End');
    ui.frame();
    expect(grid(ui).properties.get('scrollX')).toBeGreaterThan(0);
    const item = ui.getVisibleBox(ui.getAllByRole('gridcell', { name: 'Paper 1' })[0]);
    expect(item.x).toBeCloseTo(view.x, 0);
  });
});
