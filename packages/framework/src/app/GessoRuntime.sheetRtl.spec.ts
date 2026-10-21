import { describe, expect, it } from 'vitest';

import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';
import { LazySheet, Row, Text, type UiNode, UiManualFrameClock, type UiVirtualSheet } from 'gesso-core';

const ROW = 24;
const COLUMN = 100;

/** The mounted cell whose text is `row:column`. */
function cellNode(root: UiNode, row: number, column: number): UiNode | null {
  if (root.properties.get('text') === `${row}:${column}`) {
    return root;
  }
  for (let child = root.firstChild; child !== null; child = child.nextSibling) {
    const found = cellNode(child, row, column);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * A LazySheet under right to left, inside the runtime.
 *
 * Its container scrolls from the right edge with a negative offset, and
 * the runtime hands the window that offset negated, its distance from
 * the start. These check the window agrees with the layout about which
 * columns are on screen, which the window's own specs cannot: they
 * never see the signed offset or where the engine puts a column.
 */
describe('GessoRuntime with a right-to-left LazySheet', () => {
  function mount(scrollX: number) {
    let clock!: UiManualFrameClock;
    let sheet!: UiVirtualSheet;
    const runtime = new GessoRuntime({
      root: LazySheet(
        {
          width: 500,
          height: 240,
          textDirection: 'rtl',
          scrollX,
          rowCount: 1_000,
          columnCount: 50,
          rowHeight: ROW,
          columnWidth: COLUMN,
          rowOverscan: 0,
          columnOverscan: 0,
          sheetRef: value => {
            sheet = value;
          }
        },
        (row, first, last) => {
          const cells = [];
          for (let column = first; column <= last; column++) {
            cells.push(Text({ key: column, width: COLUMN, height: ROW, text: `${row}:${column}` }));
          }
          return Row({}, ...cells);
        }
      ),
      canvas: mockCanvas(600, 300),
      width: 600,
      height: 300,
      clock: callback => (clock = new UiManualFrameClock(callback))
    });
    runtime.start();
    for (let i = 0; i < 3 && clock.isPending; i++) {
      clock.tick(0);
    }
    return { runtime, sheet, root: runtime.debugRoot() };
  }

  it('mounts the columns at the start edge before it has scrolled', () => {
    const { runtime, sheet, root } = mount(0);
    expect(sheet.range$.value.firstColumn).toBe(0);
    expect(sheet.range$.value.lastColumn).toBe(5);
    // Column 0 is the rightmost on screen.
    const first = runtime.debugVisibleBox(cellNode(root, 0, 0)!);
    expect(first.x + first.width).toBe(500);
    runtime.dispose();
  });

  it('mounts the columns a negative offset scrolls into view, and they are where the layout shows them', () => {
    const { runtime, sheet, root } = mount(-COLUMN * 10);
    expect(sheet.range$.value.firstColumn).toBe(10);
    expect(sheet.range$.value.lastColumn).toBe(15);
    // Ten columns toward the end, column 10 is the one at the right
    // edge and column 14 the one at the left.
    const tenth = runtime.debugVisibleBox(cellNode(root, 0, 10)!);
    expect(tenth.x + tenth.width).toBe(500);
    expect(runtime.debugVisibleBox(cellNode(root, 0, 14)!).x).toBe(0);
    runtime.dispose();
  });

  it('finds the cell drawn under a point, counting from the right edge', () => {
    const { runtime, sheet, root } = mount(-250);
    // A point inside the box the layout drew a cell in names that cell.
    // The sheet has to be told it starts at its right edge for this; it
    // read the point from the left and named a cell on the far side.
    for (const [row, column] of [
      [0, 3],
      [2, 5]
    ] as const) {
      const box = runtime.debugVisibleBox(cellNode(root, row, column)!);
      expect(sheet.cellAt(box.x + box.width / 2, box.y + box.height / 2)).toEqual({ row, column });
    }
  });
});
