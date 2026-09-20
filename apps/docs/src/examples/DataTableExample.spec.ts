import { describe, expect, it } from 'vitest';

import type { UiNode, UiSemanticsRecord } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Runs } from './DataTableExample';

const SIZE = { width: 460, height: 320 };

function table(): Rendered {
  return renderTest(createComponent(Runs, {}), SIZE);
}

/** The names in the body rows, top to bottom, as the table has them now. */
function names(ui: Rendered): string[] {
  return ui
    .getAllByRole('row')
    .slice(1)
    .map(row => ui.textOf(row)[0]);
}

/** The caption under the table, which reports the sort and the choice. */
function caption(ui: Rendered): string {
  const line = ui.textOf().find(text => text.includes('Chosen:'));
  if (line === undefined) {
    throw new Error('the example has no caption');
  }
  return line;
}

function recordsFor(ui: Rendered, role: 'row' | 'columnheader'): UiSemanticsRecord[] {
  return ui.getAllByRole(role).map((node: UiNode) => ui.getSemantics(node));
}

/**
 * What the page claims: the table announces itself as a grid whose rows
 * know where they sit in the whole set; a press on a sortable header
 * cycles the sort and reorders the rows; a column with no `compare` is
 * not a tab stop and takes no press; the chosen row is an index into
 * the data, so it survives a sort; and every key in the keyboard table
 * moves the choice the way the table says.
 */
describe('the docs data table example', () => {
  it('announces a grid, its column headers and where each row sits', () => {
    const ui = table();

    expect(ui.getByRole('grid')).toHaveSemantics({ role: 'grid', name: 'Scores' });
    expect(recordsFor(ui, 'columnheader').map(record => record.label)).toEqual(['Name', 'Team', 'Score']);

    const rows = recordsFor(ui, 'row').slice(1);
    expect(rows[0].posInSet).toBe(1);
    expect(rows[1].posInSet).toBe(2);
    // Twelve, whether or not twelve rows are mounted: the set size is
    // the data's, not the window's.
    expect(rows[0].setSize).toBe(12);
    expect(names(ui).slice(0, 3)).toEqual(['Ravi', 'Ana', 'Mikael']);
  });

  it('cycles a sortable header through ascending, descending and off', () => {
    const ui = table();
    const score = ui.getByRole('columnheader', { name: 'Score' });

    ui.fireEvent.click(score);
    ui.frame();
    // Ines has the lowest score and Sam the highest.
    expect(names(ui)[0]).toBe('Ines');
    expect(ui.getSemantics(score).description).toBe('sorted ascending');
    expect(caption(ui)).toContain('Sorted by score, ascending');

    ui.fireEvent.click(score);
    ui.frame();
    expect(names(ui)[0]).toBe('Sam');
    expect(ui.getSemantics(score).description).toBe('sorted descending');

    ui.fireEvent.click(score);
    ui.frame();
    expect(names(ui)[0]).toBe('Ravi');
    expect(ui.getSemantics(score).description).toBeUndefined();
  });

  it('sorts from the keyboard on a header, and from a button that is not one', () => {
    const ui = table();

    ui.fireEvent.focus(ui.getByRole('columnheader', { name: 'Name' }));
    ui.fireEvent.press('Enter');
    ui.frame();
    expect(names(ui)[0]).toBe('Ana');

    // The application owns the sort, so a button can write it with no
    // header press behind it at all.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Sort by score' }));
    ui.frame();
    expect(names(ui)[0]).toBe('Sam');
    expect(caption(ui)).toContain('Sorted by score, descending');

    ui.fireEvent.click(ui.getByRole('button', { name: 'Clear sort' }));
    ui.frame();
    expect(names(ui)[0]).toBe('Ravi');
    expect(caption(ui)).toContain('In the order the data came in');
  });

  it('leaves a column with no compare unsortable and out of the tab order', () => {
    const ui = table();
    const team = ui.getByRole('columnheader', { name: 'Team' });

    expect(team.properties.get('focusable')).toBeUndefined();
    ui.fireEvent.click(team);
    ui.frame();
    expect(names(ui)[0]).toBe('Ravi');
    expect(caption(ui)).toContain('In the order the data came in');
  });

  it('keeps the chosen row through a sort, because the choice is the row', () => {
    const ui = table();

    ui.fireEvent.click(ui.getAllByRole('row')[2]);
    ui.frame();
    expect(caption(ui)).toContain('Chosen: Ana');
    const chosen = () => recordsFor(ui, 'row').filter(record => record.states?.includes('selected'));
    expect(chosen()).toHaveLength(1);
    expect(chosen()[0].posInSet).toBe(2);

    ui.fireEvent.click(ui.getByRole('columnheader', { name: 'Name' }));
    ui.frame();
    // Ana sorts to the top, and is still the chosen row: what moved was
    // her position, and the selection is an index into the data.
    expect(caption(ui)).toContain('Chosen: Ana');
    expect(chosen()).toHaveLength(1);
    expect(chosen()[0].posInSet).toBe(1);
  });

  it('moves the choice with the keys the keyboard table lists', () => {
    const ui = table();
    const grid = ui.getByRole('grid');
    ui.fireEvent.focus(grid);
    ui.frame();

    const chosen = (): string => {
      ui.frame();
      return caption(ui);
    };

    ui.fireEvent.press('ArrowDown');
    expect(chosen()).toContain('Chosen: Ravi');
    ui.fireEvent.press('ArrowDown');
    expect(chosen()).toContain('Chosen: Ana');
    ui.fireEvent.press('ArrowUp');
    expect(chosen()).toContain('Chosen: Ravi');
    // Twelve rows, so a page of ten lands on the eleventh.
    ui.fireEvent.press('PageDown');
    expect(chosen()).toContain('Chosen: Kofi');
    ui.fireEvent.press('PageUp');
    expect(chosen()).toContain('Chosen: Ravi');
    ui.fireEvent.press('End');
    expect(chosen()).toContain('Chosen: Wei');
    // Clamped rather than wrapped: a step past the end is the end.
    ui.fireEvent.press('ArrowDown');
    expect(chosen()).toContain('Chosen: Wei');
    ui.fireEvent.press('Home');
    expect(chosen()).toContain('Chosen: Ravi');

    // Enter reports the chosen row, and the example prints what it got.
    ui.fireEvent.press('Enter');
    ui.frame();
    expect(ui.textOf()).toContain('Enter opened: Ravi');
  });

  it('scrolls to a row that is not mounted when the keyboard reaches it', () => {
    const ui = table();
    const grid = ui.getByRole('grid');
    ui.fireEvent.focus(grid);
    ui.frame();

    expect(grid.properties.get('scrollY') ?? 0).toBe(0);
    ui.fireEvent.press('End');
    ui.frame();
    // The window can say where an index sits without mounting it, which
    // is what lets End reveal the last row.
    expect(grid.properties.get('scrollY')).toBeGreaterThan(0);
    expect(names(ui)).toContain('Wei');
  });
});
