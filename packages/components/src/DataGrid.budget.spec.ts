import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import { Canvas2DRenderer, UiGraph } from 'gesso-core';

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
 * holds its own: a jump frame against building the same grid, which is
 * what a jump cost before rows were recycled. Before recycling a jump
 * was about 30 ms, a build and then some for the teardown; with it,
 * about 11 ms against a build of 22 to 30, about half. A profile puts
 * most of what is left in laying out and painting every cell's new
 * text, which a jump cannot avoid, and about a tenth in the grid
 * repointing its cells. The budget of eight tenths of a build lets a
 * loaded machine through and stops a rebuild, which costs a whole build
 * at least.
 *
 * It used to be held against a one-row move, the cheapest frame that
 * does anything. That measured the wrong thing: when moves got cheaper,
 * from about 1.8 ms to 1.15, the jump's ratio went from six to ten with
 * no change in the jump, and the budget of nine failed on nearly every
 * run.
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

  it('scrolls without drawing a whole frame, rows recycled and all', () => {
    // A grid a third of its page, so its viewport is not most of the
    // surface, which would rightly be drawn whole.
    const render = vi.spyOn(Canvas2DRenderer.prototype, 'render');
    const rendered = renderTest(
      createComponent(DataGrid, {
        label: 'Small',
        columns: COLUMNS.slice(0, 6),
        rowCount: ROWS,
        getValue: (row: number, column: string) => `${column}r${row}`,
        width: 540,
        height: 300
      }),
      { width: 1200, height: 900 }
    );
    ui = rendered;
    let time = 0;
    for (let i = 0; i < 4; i++) rendered.frame((time += 16));
    const renderer = render.mock.contexts.at(-1) as Canvas2DRenderer;
    const before = { ...renderer.damageStats };

    // Twenty steps of the wheel: rows leave at the top and come back,
    // recycled, at the bottom (the jump spec above holds that they are
    // the same nodes).
    for (let step = 0; step < 20; step++) {
      rendered.fireEvent.wheel({ x: 200, y: 150, deltaY: 40 });
      rendered.frame((time += 16));
    }

    expect(rendered.queryByRole('gridcell', { name: 'c0r0' })).toBeNull();
    expect(renderer.damageStats.whole - before.whole).toBe(0);
    expect(renderer.damageStats.partial - before.partial).toBeGreaterThanOrEqual(20);
  });

  it('costs a jump well under building the grid anew', () => {
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
    // The same grid built anew, several times, and the middle reading
    // kept: one build is a few dozen milliseconds, which a single pause
    // of the machine can double.
    const builds: number[] = [];
    for (let build = 0; build < 5; build++) {
      builds.push(
        timed('a build of the same grid', () => {
          const fresh = renderTest(
            createComponent(DataGrid, {
              label: 'Fresh',
              columns: COLUMNS,
              rowCount: ROWS,
              getValue: (row: number, column: string) => `${column}r${row}`,
              width: 1200,
              height: 800
            }),
            { width: 1200, height: 800 }
          );
          fresh.frame();
          fresh.frame();
          fresh.unmount();
        })
      );
    }
    const build = [...builds].sort((a, b) => a - b)[2]!;
    const jumpFrame = jumps / FRAMES;
    // eslint-disable-next-line no-console
    console.info(`[data grid budget] a jump frame: ${jumpFrame.toFixed(2)} ms, a build: ${build.toFixed(2)} ms`);
    expect(jumpFrame).toBeLessThan(build * 0.8);
  });
});
