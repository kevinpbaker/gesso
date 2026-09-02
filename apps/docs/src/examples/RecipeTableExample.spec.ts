import { describe, expect, it } from 'vitest';

import { UiNodeType, type UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Requests, REQUESTS } from './RecipeTableExample';

const SIZE = { width: 460, height: 360 };
/**
 * 240 px of table at 26 a row is nine rows, and the overscan band is
 * three on each side. Fourteen are mounted at the top of the data and
 * seventeen in the middle of it, so twenty is the ceiling this pins.
 */
const WINDOW_CEILING = 20;
/** The estimate the table is given, and the row count of the data. */
const ROW = 26;
const ROWS = 100000;

function screen(): Rendered {
  return renderTest(createComponent(Requests, {}), SIZE);
}

/** The scroll container that is the table. */
function table(ui: Rendered): UiNode {
  const found: UiNode[] = [];
  const visit = (node: UiNode): void => {
    if (node.type === UiNodeType.ScrollView) {
      found.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(ui.runtime.debugRoot());
  return found[0]!;
}

/** Every node under the table: rows, cells, texts, spacers and header. */
function nodesUnderTable(ui: Rendered): number {
  let total = 0;
  const visit = (node: UiNode): void => {
    total++;
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(table(ui));
  return total;
}

/** The body rows that exist right now, header excluded. */
function bodyRows(ui: Rendered): UiNode[] {
  return ui.getAllByRole('row').slice(1);
}

/** The cells of the top body row, as text. */
function topRow(ui: Rendered): string[] {
  return ui.textOf(bodyRows(ui)[0]);
}

/** The detail line under the table. */
function detail(ui: Rendered): string {
  const line = ui.textOf().find(text => text.startsWith('Request ') || text.startsWith('No request chosen'));
  if (line === undefined) {
    throw new Error('the example has no detail line');
  }
  return line;
}

function wheel(ui: Rendered, deltaY: number): void {
  const box = ui.getLayout(table(ui));
  ui.fireEvent.wheel({ x: box.x + box.width / 2, y: box.y + box.height / 2, deltaY });
  ui.frame();
  ui.frame();
}

const SLOWEST = REQUESTS.reduce((worst, request) => Math.max(worst, request.ms), 0);
const FASTEST = REQUESTS.reduce((best, request) => Math.min(best, request.ms), Number.POSITIVE_INFINITY);

/**
 * What the page claims: a hundred thousand rows cost a window of nodes
 * and not a hundred thousand; the header sorts and stays put while the
 * rows scroll under it; the arrows walk the whole data set and the
 * window travels with them; and the chosen row is an index into the
 * data, so the detail line and the highlight cannot disagree.
 */
describe('the large table recipe', () => {
  it('mounts a window of a hundred thousand rows, not a hundred thousand rows', () => {
    const ui = screen();

    const rows = bodyRows(ui);
    expect(rows.length).toBe(14);
    expect(rows.length).toBeLessThan(WINDOW_CEILING);
    // Every mounted row reports the size of the data, not of the window.
    expect(ui.getSemantics(rows[0]).setSize).toBe(ROWS);
    expect(ui.getByRole('grid')).toHaveSemantics({ role: 'grid', name: 'Requests' });
    // The whole subtree, cells and texts included, is of that order too:
    // nothing is built and left unmounted off screen.
    expect(nodesUnderTable(ui)).toBe(148);
    expect(topRow(ui)[0]).toBe('1');
  });

  it('claims the scroll range of every row while only the first window is measured', () => {
    const ui = screen();

    // The range is the estimate per row, corrected by the fourteen rows
    // that have actually been measured, so the scrollbar is right from
    // the first frame and settles as the reader travels.
    const height = ui.explain(table(ui)).scroll?.contentHeight ?? 0;
    expect(height).toBeLessThanOrEqual(ROWS * ROW);
    expect(height).toBeGreaterThan(ROWS * ROW - 500);
  });

  it('keeps the window the same size after a scroll into the middle of the data', () => {
    const ui = screen();
    const before = topRow(ui)[0];

    wheel(ui, 20000);

    // 20,000 px at 26 a row is row 769 or so, and the window that
    // arrives there is the same size as the one that left.
    expect(topRow(ui)[0]).not.toBe(before);
    expect(Number(topRow(ui)[0].replace(/,/g, ''))).toBeGreaterThan(700);
    expect(bodyRows(ui).length).toBe(17);
    expect(bodyRows(ui).length).toBeLessThan(WINDOW_CEILING);
    expect(nodesUnderTable(ui)).toBe(175);
  });

  it('holds the header at the top of the table while the rows scroll under it', () => {
    const ui = screen();
    const header = ui.getAllByRole('row')[0];
    const before = ui.getLayout(header).y;

    wheel(ui, 20000);

    expect(ui.getLayout(ui.getAllByRole('row')[0]).y).toBe(before);
    expect(ui.getSemantics(ui.getAllByRole('row')[0]).label).toBe('Column headers');
  });

  it('sorts a hundred thousand rows from a header press, ascending then descending', () => {
    const ui = screen();
    const time = ui.getByRole('columnheader', { name: 'Time' });

    ui.fireEvent.click(time);
    ui.frame();
    expect(topRow(ui)[3]).toBe(`${FASTEST} ms`);
    expect(ui.getSemantics(time).description).toBe('sorted ascending');

    ui.fireEvent.click(time);
    ui.frame();
    expect(topRow(ui)[3]).toBe(`${SLOWEST} ms`);
    expect(ui.getSemantics(time).description).toBe('sorted descending');

    // The third press is no sort at all, and the data comes back in the
    // order it arrived.
    ui.fireEvent.click(time);
    ui.frame();
    expect(topRow(ui)[0]).toBe('1');
    expect(ui.getSemantics(time).description).toBeUndefined();
  });

  it('walks the rows from the keyboard, over the whole data set', () => {
    const ui = screen();
    const grid = ui.getByRole('grid');
    ui.fireEvent.focus(grid);
    ui.frame();

    expect(detail(ui)).toContain('No request chosen');

    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(detail(ui)).toContain('Request 1:');
    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(detail(ui)).toContain('Request 2:');
    ui.fireEvent.press('ArrowUp');
    ui.frame();
    expect(detail(ui)).toContain('Request 1:');
    // A page is ten rows, whatever the viewport holds.
    ui.fireEvent.press('PageDown');
    ui.frame();
    expect(detail(ui)).toContain('Request 11:');

    ui.fireEvent.press('End');
    ui.frame();
    // The last row of a hundred thousand does not exist until the table
    // has scrolled to it, and the table scrolls to it because the window
    // can say where an index sits without mounting it.
    expect(detail(ui)).toContain('Request 100,000:');
    expect(grid.properties.get('scrollY')).toBeGreaterThan(0);
    expect(bodyRows(ui).length).toBeLessThan(WINDOW_CEILING);
    expect(nodesUnderTable(ui)).toBeLessThan(WINDOW_CEILING * 12);

    ui.fireEvent.press('Home');
    ui.frame();
    expect(detail(ui)).toContain('Request 1:');
    expect(grid.properties.get('scrollY')).toBe(0);
  });

  it('keeps the chosen row and its detail line together through a sort', () => {
    const ui = screen();

    ui.fireEvent.click(bodyRows(ui)[1]);
    ui.frame();
    expect(detail(ui)).toContain('Request 2:');

    ui.fireEvent.click(ui.getByRole('columnheader', { name: 'Time' }));
    ui.frame();
    // The choice is an index into the data, so it survives the sort. The
    // row is somewhere else now, and usually nowhere near the window.
    expect(detail(ui)).toContain('Request 2:');
    const selected = bodyRows(ui).filter(row => ui.getSemantics(row).states?.includes('selected'));
    expect(selected.length).toBeLessThan(2);
  });
});
