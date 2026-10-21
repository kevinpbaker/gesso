import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import { UiGraph } from 'gesso-core';

import { DataGrid, type DataGridCell, type DataGridColumn } from './DataGrid';

/**
 * Budgets for a DataGrid that jumps, and for one whose active cell moves.
 *
 * A jump is a scrollbar thumb dragged down a long sheet, or Ctrl+End,
 * or the application sending the active cell somewhere far away: every
 * mounted row leaves and as many arrive. Built anew, that was every
 * cell, every binding and every text node of a 1200 by 800 grid, torn
 * down and put back each frame, about 30 ms a frame in this runtime.
 * With its rows recycled, a jump keeps every cell node and only tells
 * each one which row it now shows.
 *
 * The node count is the hard claim: a jump creates no cell nodes. The
 * timing is printed so a trend is visible, and is held to a ratio
 * rather than to milliseconds, as `UiVirtualWindow.budget.spec.ts`
 * holds its own: a jump against a move of the active cell by one row,
 * which is the cheapest frame that does anything. Before recycling a
 * jump was about 30 ms and fifteen moves; with it, about 11 ms and six.
 * A profile puts most of what is left in laying out and painting every
 * cell's new text, which a jump cannot avoid, and about a tenth in the
 * grid repointing its cells. The budget of nine leaves room for a
 * loaded machine without letting a rebuild back in.
 */

let ui: Rendered | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
  vi.restoreAllMocks();
});

const COLUMNS: readonly DataGridColumn[] = Array.from({ length: 50 }, (_, index) => ({
  key: `c${index}`,
  header: `C${index}`,
  width: 90,
  editable: true
}));
const ROWS = 100_000;

function timed(label: string, run: () => void): number {
  const start = performance.now();
  run();
  const ms = performance.now() - start;
  // eslint-disable-next-line no-console
  console.info(`[data grid budget] ${label}: ${ms.toFixed(2)} ms`);
  return ms;
}

/** A 1200 by 800 grid over a hundred thousand rows, its active cell driven from here. */
function big(): { rendered: Rendered; active: BehaviorSubject<DataGridCell> } {
  const active = new BehaviorSubject<DataGridCell>({ row: 0, column: 'c0' });
  const rendered = renderTest(
    createComponent(DataGrid, {
      label: 'Big',
      columns: COLUMNS,
      rowCount: ROWS,
      getValue: (row: number, column: string) => `${column}r${row}`,
      activeCell: active as unknown as DataGridCell,
      onActiveCellChange: (cell: DataGridCell) => active.next(cell),
      width: 1200,
      height: 800
    }),
    { width: 1200, height: 800 }
  );
  ui = rendered;
  rendered.frame();
  rendered.frame();
  return { rendered, active };
}

const cellIds = (rendered: Rendered): Set<string> => new Set(rendered.getAllByRole('gridcell').map(node => node.id));

/** Sends the active cell to `row` in the first column, and runs the frames that scroll there. */
function jump(rendered: Rendered, active: BehaviorSubject<DataGridCell>, row: number): void {
  active.next({ row, column: 'c0' });
  rendered.frame();
  rendered.frame();
}

describe('DataGrid budgets', () => {
  it('jumps across a long sheet without building a cell', () => {
    const { rendered, active } = big();
    // Away from the top first: at row 0 the window has no overscan
    // above it, so it holds fewer rows than it does anywhere else.
    jump(rendered, active, 20_000);
    const before = cellIds(rendered);
    expect(before.size).toBeGreaterThan(200);

    let created = 0;
    const create = UiGraph.prototype.createNode;
    const spy = vi.spyOn(UiGraph.prototype, 'createNode').mockImplementation(function (this: UiGraph, id, type) {
      created++;
      return create.call(this, id, type);
    });
    jump(rendered, active, 50_000);
    spy.mockRestore();

    // Every row in view now is one that was not in view before...
    expect(rendered.queryByRole('gridcell', { name: 'c0r20000' })).toBeNull();
    expect(rendered.getByRole('gridcell', { name: 'c0r50000' })).toBeTruthy();
    // ...and every cell showing it is a node that was already there.
    expect(cellIds(rendered)).toEqual(before);
    expect(created).toBe(0);
  });

  it('writes to the two cells an arrow moves between, however many are on screen', () => {
    const CELL_PROPERTIES = new Set(['states', 'borderWidth', 'backgroundColor']);
    const writes = (height: number): number => {
      const rendered = renderTest(
        createComponent(DataGrid, {
          columns: COLUMNS.slice(0, 8),
          rowCount: ROWS,
          getValue: (row: number, column: string) => `${column}r${row}`,
          width: 720,
          height
        }),
        { width: 720, height }
      );
      ui = rendered;
      rendered.frame();
      rendered.fireEvent.focus(rendered.getByRole('grid'));
      rendered.frame();
      let count = 0;
      const update = UiGraph.prototype.updateNodeProperty;
      const spy = vi
        .spyOn(UiGraph.prototype, 'updateNodeProperty')
        .mockImplementation(function (this: UiGraph, node, property, value, flags) {
          if (CELL_PROPERTIES.has(property)) {
            count++;
          }
          return update.call(this, node, property, value, flags);
        });
      rendered.fireEvent.press('ArrowDown');
      rendered.frame();
      spy.mockRestore();
      rendered.unmount();
      ui = null;
      return count;
    };
    const short = writes(200);
    const tall = writes(1600);
    expect(short).toBeGreaterThan(0);
    expect(tall).toBe(short);
  });

  it('costs a jump a small multiple of a one-row move', () => {
    const { rendered, active } = big();
    const FRAMES = 30;
    // Once each first, so neither run pays for warming the code up.
    for (let index = 0; index < 4; index++) {
      jump(rendered, active, 10_000 + index * 997);
      jump(rendered, active, 10_000 + index * 997 + 1);
    }
    const jumps = timed(`${FRAMES} jumps of a 1200 by 800 grid`, () => {
      for (let frame = 0; frame < FRAMES; frame++) {
        jump(rendered, active, ((frame * 7919) % 90) * 1000 + 500);
      }
    });
    const settled = 90_000 + 500;
    jump(rendered, active, settled);
    const moves = timed(`${FRAMES} one-row moves`, () => {
      for (let frame = 0; frame < FRAMES; frame++) {
        jump(rendered, active, settled + (frame % 2));
      }
    });
    // eslint-disable-next-line no-console
    console.info(`[data grid budget] a jump frame: ${(jumps / FRAMES).toFixed(2)} ms`);
    expect(jumps).toBeLessThan(Math.max(moves, 5) * 9);
  });
});
