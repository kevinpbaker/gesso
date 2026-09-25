import { describe, expect, it } from 'vitest';

import { Row, Text } from './UiComponents';
import type { UiChild, UiElement } from './UiElement';
import { UiVirtualSheet, type SheetRange } from './UiVirtualSheet';

const ROW = 24;
const COLUMN = 100;

/** A cell per column, keyed absolutely, as the contract asks. */
const renderRow = (row: number, first: number, last: number) => {
  const cells = [];
  for (let column = first; column <= last; column++) {
    cells.push(Text({ key: column, text: `${row}:${column}` }));
  }
  return Row({}, ...cells);
};

function rows(sheet: UiVirtualSheet): number[] {
  return sheet.children$.value
    .map(child => child.props.key)
    .filter((key): key is string => typeof key === 'string' && key.startsWith('sheet:row:'))
    .map(key => Number(key.slice('sheet:row:'.length)));
}

/**
 * The columns a mounted row holds, by the keys its cells carry.
 *
 * By key and not by position: the window's own leading spacer sits
 * among them, and with a frozen pane it is no longer first. Anything
 * positional here breaks the moment a sheet freezes a column, which
 * is how this was written and what it cost to find out.
 */
function columnsOf(sheet: UiVirtualSheet, row: number): number[] {
  const element = sheet.children$.value.find(child => child.props.key === `sheet:row:${row}`);
  if (element === undefined) {
    throw new Error(`row ${row} is not mounted`);
  }
  return (element.children as UiElement[])
    .map(cell => cell.props.key)
    .filter((key): key is number => typeof key === 'number');
}

function spacers(sheet: UiVirtualSheet): { top: number; bottom: number; lead: number } {
  const children = sheet.children$.value;
  const first = rows(sheet)[0];
  const row = children.find(child => child.props.key === `sheet:row:${first}`) as UiElement;
  const find = (list: readonly UiChild[], key: string): UiElement =>
    (list as UiElement[]).find(child => child.props.key === key) as UiElement;
  return {
    top: find(children, 'sheet:top').props.height as number,
    bottom: find(children, 'sheet:bottom').props.height as number,
    lead: find(row.children, 'sheet:lead').props.width as number
  };
}

function sheetOf(options: Partial<ConstructorParameters<typeof UiVirtualSheet>[0]> = {}): UiVirtualSheet {
  return new UiVirtualSheet(
    {
      rowCount: 10_000,
      columnCount: 100,
      rowHeight: ROW,
      columnWidth: COLUMN,
      rowOverscan: 1,
      columnOverscan: 1,
      initialViewport: { width: 500, height: 240 },
      ...options
    },
    renderRow
  );
}

describe('UiVirtualSheet', () => {
  it('mounts the viewport plus a band on both axes before any layout', () => {
    const sheet = sheetOf();
    // 240 / 24 = rows 0..10 (10 spans the bottom edge), plus one row of band.
    expect(rows(sheet)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // 500 / 100 = columns 0..5, plus one column of band.
    expect(columnsOf(sheet, 0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('spaces the unmounted rows and columns so both scrollbars are exact', () => {
    const sheet = sheetOf();
    sheet.update({ scrollX: 1000, scrollY: 2400, width: 500, height: 240 });
    // Row 100 is at the top, less one row of band.
    expect(rows(sheet)[0]).toBe(99);
    expect(spacers(sheet).top).toBe(99 * ROW);
    expect(spacers(sheet).top + rows(sheet).length * ROW + spacers(sheet).bottom).toBe(10_000 * ROW);
    // Column 10 is at the left, less one column of band.
    expect(columnsOf(sheet, 99)[0]).toBe(9);
    expect(spacers(sheet).lead).toBe(9 * COLUMN);
  });

  it('is the sheet-sized content extent on the first frame, not an estimate', () => {
    const sheet = sheetOf();
    expect(sheet.contentHeight).toBe(10_000 * ROW);
    expect(sheet.contentWidth).toBe(100 * COLUMN);
    const first = sheet.children$.value.find(child => String(child.props.key).startsWith('sheet:row:')) as UiElement;
    expect(first.props.width).toBe(100 * COLUMN);
  });

  /**
   * The reason keys are absolute. A vertical scroll that kept the rows
   * but renumbered them would rewrite every mounted cell; keyed by the
   * row they hold, the rows that stayed are the same elements and the
   * reconciler has one row to build.
   */
  it('reuses the row elements a vertical scroll did not move', () => {
    const sheet = sheetOf();
    const before = new Map(
      sheet.children$.value.filter(child => String(child.props.key).startsWith('sheet:row:')).map(c => [c.props.key, c])
    );
    sheet.update({ scrollX: 0, scrollY: ROW, width: 500, height: 240 });
    const after = sheet.children$.value.filter(child => String(child.props.key).startsWith('sheet:row:'));
    const kept = after.filter(child => before.get(child.props.key) === child);
    expect(kept).toHaveLength(after.length - 1);
  });

  it('rebuilds the rows when the column window moves, because their cells changed', () => {
    const sheet = sheetOf();
    const before = sheet.children$.value.find(child => child.props.key === 'sheet:row:0');
    sheet.update({ scrollX: COLUMN, scrollY: 0, width: 500, height: 240 });
    expect(sheet.children$.value.find(child => child.props.key === 'sheet:row:0')).not.toBe(before);
    expect(columnsOf(sheet, 0)[0]).toBe(0);
    sheet.update({ scrollX: COLUMN * 3, scrollY: 0, width: 500, height: 240 });
    expect(columnsOf(sheet, 0)[0]).toBe(2);
  });

  it('emits the range once per change, so a command bound to it is not sent per frame', () => {
    const sheet = sheetOf();
    const seen: SheetRange[] = [];
    sheet.range$.subscribe(range => seen.push(range));
    seen.length = 0;
    // Three frames inside one row and one column: no new range.
    sheet.update({ scrollX: 1, scrollY: 1, width: 500, height: 240 });
    sheet.update({ scrollX: 2, scrollY: 2, width: 500, height: 240 });
    sheet.update({ scrollX: 3, scrollY: 3, width: 500, height: 240 });
    expect(seen).toHaveLength(0);
    sheet.update({ scrollX: 3, scrollY: ROW, width: 500, height: 240 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ firstRow: 0, lastRow: 12, firstColumn: 0, lastColumn: 6 });
  });

  it('widens the window by the band it is given, on each side', () => {
    const sheet = sheetOf({ rowOverscan: 0, columnOverscan: 0 });
    // Away from both edges, so a band applies on each side of each axis.
    sheet.update({ scrollX: 5000, scrollY: 24_000, width: 500, height: 240 });
    expect(rows(sheet)).toHaveLength(11);
    expect(columnsOf(sheet, 1000)).toHaveLength(6);
    sheet.setOverscan(5, 3);
    expect(rows(sheet)).toHaveLength(11 + 2 * 5);
    expect(columnsOf(sheet, 1000)).toHaveLength(6 + 2 * 3);
  });

  it('clamps the window to the sheet at its far corner', () => {
    const sheet = sheetOf({ rowCount: 12, columnCount: 4 });
    // The furthest the layout engine can scroll this sheet.
    sheet.update({
      scrollX: sheet.contentWidth - 500,
      scrollY: sheet.contentHeight - 240,
      width: 500,
      height: 240
    });
    expect(rows(sheet).at(-1)).toBe(11);
    expect(columnsOf(sheet, 11).at(-1)).toBe(3);
    expect(spacers(sheet).bottom).toBe(0);
  });

  it('mounts nothing for an empty sheet', () => {
    const sheet = sheetOf({ rowCount: 0 });
    expect(sheet.children$.value).toEqual([]);
    expect(sheet.range$.value).toEqual({ firstRow: 0, lastRow: -1, firstColumn: 0, lastColumn: -1 });
  });

  it('refuses a row that is not a Row, rather than laying its cells out wrongly', () => {
    expect(
      () =>
        new UiVirtualSheet(
          {
            rowCount: 10,
            columnCount: 4,
            rowHeight: ROW,
            columnWidth: COLUMN,
            initialViewport: { width: 10, height: 10 }
          },
          () => Text({ text: 'not a row' })
        )
    ).toThrow(/must be a Row/);
  });
});

/**
 * A sheet with the two frozen strips a spreadsheet has: a header row
 * above the rows and a gutter at the start of every row. Both are
 * *content* — they take space in the scrollable extent — and keeping
 * them visible is `position: 'sticky'` on what the renderer returns,
 * which is the renderer's business and not the window's.
 */
describe('UiVirtualSheet with a header and a gutter', () => {
  const GUTTER = 48;
  const HEADER = 22;

  const renderGutterRow = (row: number, first: number, last: number) => {
    const cells = [Text({ key: 'gutter', text: String(row + 1) })];
    for (let column = first; column <= last; column++) {
      cells.push(Text({ key: column, text: `${row}:${column}` }));
    }
    return Row({}, ...cells);
  };

  const renderHeader = (first: number, last: number) => {
    const cells = [Text({ key: 'corner', text: '' })];
    for (let column = first; column <= last; column++) {
      cells.push(Text({ key: column, text: `H${column}` }));
    }
    return Row({}, ...cells);
  };

  function sheetWith(options: Record<string, unknown> = {}): UiVirtualSheet {
    return new UiVirtualSheet(
      {
        rowCount: 1_000,
        columnCount: 50,
        rowHeight: ROW,
        columnWidth: COLUMN,
        rowOverscan: 0,
        columnOverscan: 0,
        gutterWidth: GUTTER,
        headerHeight: HEADER,
        initialViewport: { width: 500, height: 240 },
        ...options
      },
      renderGutterRow,
      renderHeader
    );
  }

  it('counts both strips in the scrollable extent', () => {
    const sheet = sheetWith();
    expect(sheet.contentHeight).toBe(HEADER + 1_000 * ROW);
    expect(sheet.contentWidth).toBe(GUTTER + 50 * COLUMN);
  });

  it('puts the header first, once, and before the leading spacer', () => {
    const sheet = sheetWith();
    const children = sheet.children$.value;
    expect(children[0].props.key).toBe('sheet:header');
    expect(children[0].props.height).toBe(HEADER);
    expect(children.filter(child => child.props.key === 'sheet:header')).toHaveLength(1);
  });

  /**
   * The gutter is at content x 0 and the columns begin past it, so the
   * spacer for the columns scrolled out of view goes *after* the
   * gutter rather than before it. Getting this the wrong way round
   * pushes the gutter off screen and lines every cell up one column
   * out.
   */
  it('puts the leading spacer after the gutter, not before it', () => {
    const sheet = sheetWith();
    sheet.update({ scrollX: GUTTER + COLUMN * 4, scrollY: 0, width: 500, height: 240 });
    const row = sheet.children$.value.find(child => String(child.props.key).startsWith('sheet:row:')) as UiElement;
    const [first, second] = row.children as UiElement[];
    expect(first.props.key).toBe('gutter');
    expect(second.props.key).toBe('sheet:lead');
    expect(second.props.width).toBe(4 * COLUMN);
  });

  it('lays the header out in the same places as a row', () => {
    const sheet = sheetWith();
    sheet.update({ scrollX: GUTTER + COLUMN * 3, scrollY: 0, width: 500, height: 240 });
    const children = sheet.children$.value;
    const header = children[0] as UiElement;
    const row = children.find(child => String(child.props.key).startsWith('sheet:row:')) as UiElement;
    expect(header.props.width).toBe(row.props.width);
    expect((header.children[1] as UiElement).props.width).toBe((row.children[1] as UiElement).props.width);
  });

  it('measures rows from under the header, not from the top of the content', () => {
    const sheet = sheetWith();
    // Scrolled by the header's height exactly: row 0 is at the top.
    sheet.update({ scrollX: 0, scrollY: HEADER, width: 500, height: 240 });
    expect(sheet.rowAt(HEADER)).toBe(0);
    expect(sheet.rowAt(HEADER + ROW)).toBe(1);
  });

  it('measures columns from past the gutter', () => {
    const sheet = sheetWith();
    expect(sheet.columnAt(0)).toBe(0);
    expect(sheet.columnAt(GUTTER)).toBe(0);
    expect(sheet.columnAt(GUTTER + COLUMN)).toBe(1);
    expect(sheet.columnAt(GUTTER + COLUMN * 2.5)).toBe(2);
  });
});

/**
 * Columns a person can drag. The offsets become a prefix sum, which is
 * why they are stored rather than multiplied.
 */
describe('UiVirtualSheet with columns of different widths', () => {
  const WIDTHS = [60, 200, 40, 120, 80];

  function sheetWith(widths: number | readonly number[] = WIDTHS): UiVirtualSheet {
    return new UiVirtualSheet(
      {
        rowCount: 100,
        columnCount: 5,
        rowHeight: ROW,
        columnWidth: widths,
        rowOverscan: 0,
        columnOverscan: 0,
        initialViewport: { width: 200, height: 240 }
      },
      renderRow
    );
  }

  it('offsets each column by the ones before it', () => {
    const sheet = sheetWith();
    expect(sheet.offsetOf(0)).toBe(0);
    expect(sheet.offsetOf(1)).toBe(60);
    expect(sheet.offsetOf(2)).toBe(260);
    expect(sheet.offsetOf(4)).toBe(420);
    expect(sheet.contentWidth).toBe(500);
  });

  it('reports each column its own width', () => {
    const sheet = sheetWith();
    expect(sheet.widthOf(1)).toBe(200);
    expect(sheet.widthOf(2)).toBe(40);
  });

  it('finds the column at an offset by searching, not by dividing', () => {
    const sheet = sheetWith();
    expect(sheet.columnAt(0)).toBe(0);
    expect(sheet.columnAt(59)).toBe(0);
    expect(sheet.columnAt(60)).toBe(1);
    expect(sheet.columnAt(259)).toBe(1);
    expect(sheet.columnAt(260)).toBe(2);
    expect(sheet.columnAt(499)).toBe(4);
    expect(sheet.columnAt(10_000)).toBe(4);
  });

  it('windows on the real widths, so a wide column is one column', () => {
    const sheet = sheetWith();
    // 200 across, starting at 0: columns 0 and 1 cover it.
    sheet.update({ scrollX: 0, scrollY: 0, width: 200, height: 240 });
    expect(sheet.range$.value.lastColumn).toBe(1);
  });

  it('moves every offset after the column that was dragged', () => {
    const sheet = sheetWith();
    sheet.setColumnWidths([60, 300, 40, 120, 80]);
    expect(sheet.offsetOf(1)).toBe(60);
    expect(sheet.offsetOf(2)).toBe(360);
    expect(sheet.contentWidth).toBe(600);
  });

  it('rebuilds the rows when a width changes, since the spacer moved', () => {
    const sheet = sheetWith();
    sheet.update({ scrollX: 100, scrollY: 0, width: 200, height: 240 });
    const before = sheet.children$.value.find(child => String(child.props.key).startsWith('sheet:row:'));
    sheet.setColumnWidths([60, 300, 40, 120, 80]);
    expect(sheet.children$.value.find(child => String(child.props.key).startsWith('sheet:row:'))).not.toBe(before);
  });

  it('still takes one width for every column', () => {
    const sheet = sheetWith(100);
    expect(sheet.offsetOf(3)).toBe(300);
    expect(sheet.columnAt(250)).toBe(2);
  });
});

describe('UiVirtualSheet.cellAt', () => {
  /**
   * A drag towards a cell is usually heading for one that has not been
   * mounted, so there is no node to hit-test: the window's own offsets
   * are the only answer available.
   */
  it('maps a point in the viewport to a cell, scroll included', () => {
    const sheet = new UiVirtualSheet(
      {
        rowCount: 1_000,
        columnCount: 50,
        rowHeight: ROW,
        columnWidth: COLUMN,
        initialViewport: { width: 500, height: 240 }
      },
      renderRow
    );

    expect(sheet.cellAt(0, 0)).toEqual({ row: 0, column: 0 });
    expect(sheet.cellAt(COLUMN * 2 + 5, ROW * 3 + 5)).toEqual({ row: 3, column: 2 });

    sheet.update({ scrollX: COLUMN * 10, scrollY: ROW * 20, width: 500, height: 240 });
    expect(sheet.cellAt(0, 0)).toEqual({ row: 20, column: 10 });
    expect(sheet.cellAt(COLUMN, ROW)).toEqual({ row: 21, column: 11 });
  });

  it('measures past the frozen strips when there are any', () => {
    const sheet = new UiVirtualSheet(
      {
        rowCount: 1_000,
        columnCount: 50,
        rowHeight: ROW,
        columnWidth: COLUMN,
        gutterWidth: 48,
        headerHeight: 22,
        initialViewport: { width: 500, height: 240 }
      },
      renderRow
    );
    expect(sheet.cellAt(48, 22)).toEqual({ row: 0, column: 0 });
    expect(sheet.cellAt(48 + COLUMN, 22 + ROW)).toEqual({ row: 1, column: 1 });
  });
});

/**
 * Rows that are not the default height.
 *
 * Sparse, where `columnWidth` is an array: a sheet has a few hundred
 * columns and up to a million rows, so a height per row would be the
 * largest allocation in the application to describe a sheet where
 * every row but two is the same. What produces an exception is hiding
 * a row, autofitting one, or wrapping text in it — tens of them, not
 * thousands.
 */
describe('a sheet whose rows are not all the same height', () => {
  const sheetWith = (heights: ReadonlyMap<number, number>) =>
    new UiVirtualSheet(
      {
        rowCount: 100,
        columnCount: 5,
        rowHeight: ROW,
        rowHeights: heights,
        columnWidth: COLUMN,
        rowOverscan: 0,
        columnOverscan: 0,
        initialViewport: { width: 500, height: 240 }
      },
      renderRow
    );

  it('gives a row its own height and everything else the default', () => {
    const sheet = sheetWith(new Map([[3, 60]]));
    expect(sheet.rowHeightOf(3)).toBe(60);
    expect(sheet.rowHeightOf(2)).toBe(ROW);
    expect(sheet.rowHeightOf(4)).toBe(ROW);
  });

  it('carries the difference into every offset past it', () => {
    const sheet = sheetWith(new Map([[3, 60]]));
    expect(sheet.rowOffsetOf(3)).toBe(3 * ROW);
    expect(sheet.rowOffsetOf(4)).toBe(3 * ROW + 60);
    expect(sheet.rowOffsetOf(5)).toBe(3 * ROW + 60 + ROW);
  });

  it('adds the difference to the height of the whole sheet', () => {
    const sheet = sheetWith(new Map([[3, 60]]));
    expect(sheet.contentHeight).toBe(100 * ROW + (60 - ROW));
  });

  it('handles several exceptions in order, however they were given', () => {
    const sheet = sheetWith(
      new Map([
        [9, 48],
        [2, 12]
      ])
    );
    expect(sheet.rowOffsetOf(3)).toBe(2 * ROW + 12);
    expect(sheet.rowOffsetOf(10)).toBe(9 * ROW + (12 - ROW) + 48);
    expect(sheet.contentHeight).toBe(100 * ROW + (12 - ROW) + (48 - ROW));
  });

  /** A row of the default height is not an exception. */
  it('ignores an exception that is the default height', () => {
    const sheet = sheetWith(new Map([[3, ROW]]));
    expect(sheet.rowOffsetOf(4)).toBe(4 * ROW);
    expect(sheet.contentHeight).toBe(100 * ROW);
  });

  describe('a hidden row, which is one of height zero', () => {
    it('takes up no space', () => {
      const sheet = sheetWith(new Map([[3, 0]]));
      expect(sheet.rowHeightOf(3)).toBe(0);
      expect(sheet.rowOffsetOf(3)).toBe(3 * ROW);
      expect(sheet.rowOffsetOf(4)).toBe(3 * ROW);
      expect(sheet.contentHeight).toBe(99 * ROW);
    });

    /**
     * The offset where a hidden row would be belongs to the row after
     * it. It falls out of the arithmetic — a zero-height row starts
     * and ends in the same place, so a point is never inside it.
     */
    it('is never the row under a point', () => {
      const sheet = sheetWith(new Map([[3, 0]]));
      expect(sheet.rowAt(3 * ROW)).toBe(4);
      expect(sheet.rowAt(3 * ROW - 1)).toBe(2);
    });

    it('is skipped over when several are hidden together', () => {
      const sheet = sheetWith(
        new Map([
          [3, 0],
          [4, 0],
          [5, 0]
        ])
      );
      expect(sheet.rowAt(3 * ROW)).toBe(6);
      expect(sheet.contentHeight).toBe(97 * ROW);
    });

    it('is still mounted, so the row after it can be reached', () => {
      const sheet = sheetWith(new Map([[3, 0]]));
      sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });
      expect(rows(sheet)).toContain(3);
    });
  });

  describe('finding the row under a point', () => {
    it('divides when every row is the default', () => {
      const sheet = sheetWith(new Map());
      expect(sheet.rowAt(0)).toBe(0);
      expect(sheet.rowAt(ROW * 7 + 1)).toBe(7);
    });

    it('finds the tall row itself', () => {
      const sheet = sheetWith(new Map([[3, 60]]));
      expect(sheet.rowAt(3 * ROW)).toBe(3);
      expect(sheet.rowAt(3 * ROW + 59)).toBe(3);
      expect(sheet.rowAt(3 * ROW + 60)).toBe(4);
    });

    it('finds a row well past the last exception', () => {
      const sheet = sheetWith(new Map([[3, 60]]));
      const extra = 60 - ROW;
      expect(sheet.rowAt(50 * ROW + extra)).toBe(50);
      expect(sheet.rowAt(50 * ROW + extra + ROW - 1)).toBe(50);
    });

    it('finds a row before the first exception', () => {
      const sheet = sheetWith(new Map([[30, 60]]));
      expect(sheet.rowAt(2 * ROW)).toBe(2);
    });

    it('does not run off either end', () => {
      const sheet = sheetWith(new Map([[3, 60]]));
      expect(sheet.rowAt(-100)).toBe(0);
      expect(sheet.rowAt(1_000_000)).toBe(99);
    });
  });

  describe('the rows it mounts', () => {
    it('places the spacer above them at the right offset', () => {
      const sheet = sheetWith(new Map([[1, 60]]));
      sheet.update({ scrollX: 0, scrollY: 200, width: 500, height: 240 });
      const first = rows(sheet)[0];
      expect(spacers(sheet).top).toBe(sheet.rowOffsetOf(first));
    });

    it('gives each mounted row its own height', () => {
      const sheet = sheetWith(new Map([[2, 60]]));
      sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });
      const tall = sheet.children$.value.find(child => child.props.key === 'sheet:row:2');
      const short = sheet.children$.value.find(child => child.props.key === 'sheet:row:3');
      expect(tall?.props.height).toBe(60);
      expect(short?.props.height).toBe(ROW);
    });

    /** The spacers and the rows still add up to the sheet's height. */
    it('adds up to the content height', () => {
      const sheet = sheetWith(
        new Map([
          [2, 60],
          [7, 0]
        ])
      );
      sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });
      const children = sheet.children$.value;
      const total = children.reduce((sum, child) => sum + ((child.props.height as number) ?? 0), 0);
      expect(total).toBe(sheet.contentHeight);
    });
  });

  describe('changing them while the sheet is up', () => {
    it('takes new heights and rebuilds', () => {
      const sheet = sheetWith(new Map());
      sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });
      expect(sheet.contentHeight).toBe(100 * ROW);

      sheet.setRowHeights(new Map([[0, 0]]));
      expect(sheet.contentHeight).toBe(99 * ROW);
      expect(sheet.rowHeightOf(0)).toBe(0);
    });

    it('takes a new default and moves the exceptions with it', () => {
      const sheet = sheetWith(new Map([[3, 60]]));
      sheet.setRowHeight(30);
      expect(sheet.rowOffsetOf(3)).toBe(3 * 30);
      expect(sheet.rowOffsetOf(4)).toBe(3 * 30 + 60);
      expect(sheet.contentHeight).toBe(100 * 30 + (60 - 30));
    });

    it('refuses a negative height', () => {
      const sheet = sheetWith(new Map());
      expect(() => sheet.setRowHeights(new Map([[0, -1]]))).toThrow(/negative/);
    });
  });
});

/**
 * A window widened by what the document says.
 *
 * The one place a sheet's geometry depends on its contents. A merge
 * spanning C3:E3 is drawn by its anchor, and scrolled so the window
 * begins at column D there is no anchor to draw — the merge vanishes
 * at the left edge of the screen. The caller knows where its merges
 * are; this lets it say so.
 */
describe('a window the document widens', () => {
  const sheetWith = (extendRange: (range: SheetRange) => SheetRange) =>
    new UiVirtualSheet(
      {
        rowCount: 100,
        columnCount: 40,
        rowHeight: ROW,
        columnWidth: COLUMN,
        rowOverscan: 0,
        columnOverscan: 0,
        extendRange,
        initialViewport: { width: 500, height: 240 }
      },
      renderRow
    );

  it('mounts the columns the caller asked to reach back to', () => {
    // A merge anchored at column 2, spanning to column 8.
    const sheet = sheetWith(range =>
      range.firstColumn > 2 && range.firstColumn <= 8 ? { ...range, firstColumn: 2 } : range
    );
    sheet.update({ scrollX: 5 * COLUMN, scrollY: 0, width: 500, height: 240 });

    expect(columnsOf(sheet, 0)[0]).toBe(2);
  });

  it('mounts the rows the caller asked to reach back to', () => {
    const sheet = sheetWith(range =>
      range.firstRow > 10 && range.firstRow <= 14 ? { ...range, firstRow: 10 } : range
    );
    sheet.update({ scrollX: 0, scrollY: 12 * ROW, width: 500, height: 240 });

    expect(rows(sheet)[0]).toBe(10);
  });

  /** The spacer follows the widened window, or the rows sit wrong. */
  it('places the spacers against the widened window', () => {
    const sheet = sheetWith(range =>
      range.firstRow > 10 && range.firstRow <= 14 ? { ...range, firstRow: 10 } : range
    );
    sheet.update({ scrollX: 0, scrollY: 12 * ROW, width: 500, height: 240 });

    expect(spacers(sheet).top).toBe(10 * ROW);
    expect(spacers(sheet).lead).toBe(0);
  });

  it('costs nothing when the caller widens nothing', () => {
    const plain = new UiVirtualSheet(
      {
        rowCount: 100,
        columnCount: 40,
        rowHeight: ROW,
        columnWidth: COLUMN,
        rowOverscan: 0,
        columnOverscan: 0,
        initialViewport: { width: 500, height: 240 }
      },
      renderRow
    );
    const hooked = sheetWith(range => range);
    plain.update({ scrollX: 3 * COLUMN, scrollY: 5 * ROW, width: 500, height: 240 });
    hooked.update({ scrollX: 3 * COLUMN, scrollY: 5 * ROW, width: 500, height: 240 });
    expect(rows(hooked)).toEqual(rows(plain));
    expect(columnsOf(hooked, rows(hooked)[0])).toEqual(columnsOf(plain, rows(plain)[0]));
  });

  /**
   * A caller that narrowed the window would be deciding what the
   * viewport covers, which is not its question — and a window smaller
   * than the screen is a hole in the middle of the sheet.
   */
  it('refuses to be narrowed', () => {
    const sheet = sheetWith(() => ({ firstRow: 50, lastRow: 51, firstColumn: 30, lastColumn: 31 }));
    sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });

    expect(rows(sheet)[0]).toBe(0);
    expect(columnsOf(sheet, 0)[0]).toBe(0);
  });

  it('does not let the caller run off the sheet', () => {
    const sheet = sheetWith(() => ({ firstRow: -20, lastRow: 10_000, firstColumn: -5, lastColumn: 900 }));
    sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });

    expect(rows(sheet)[0]).toBe(0);
    expect(rows(sheet).at(-1)).toBe(99);
    expect(columnsOf(sheet, 0).at(-1)).toBe(39);
  });
});

/**
 * A frozen pane: rows and columns that stay while the rest scrolls.
 *
 * `extendRange` is no use here — widening the window back to row 0
 * from row 5,000 would mount five thousand rows to show one — so
 * these are a second mounted set, placed where the header row already
 * goes. Keeping them *visible* is the renderer's job with sticky
 * positioning; this is about what exists and where the spacers are.
 */
describe('a sheet with a frozen pane', () => {
  /** Frozen columns are emitted first, then the window's own. */
  const renderFrozenRow = (frozen: number) => (row: number, first: number, last: number) => {
    const cells = [];
    for (let column = 0; column < frozen; column++) {
      cells.push(Text({ key: column, text: `${row}:${column}` }));
    }
    for (let column = first; column <= last; column++) {
      cells.push(Text({ key: column, text: `${row}:${column}` }));
    }
    return Row({}, ...cells);
  };

  const sheetWith = (frozenRows: number, frozenColumns: number) =>
    new UiVirtualSheet(
      {
        rowCount: 100,
        columnCount: 40,
        rowHeight: ROW,
        columnWidth: COLUMN,
        rowOverscan: 0,
        columnOverscan: 0,
        frozenRows,
        frozenColumns,
        initialViewport: { width: 500, height: 240 }
      },
      renderFrozenRow(frozenColumns)
    );

  it('keeps the frozen rows mounted however far it has scrolled', () => {
    const sheet = sheetWith(2, 0);
    sheet.update({ scrollX: 0, scrollY: 80 * ROW, width: 500, height: 240 });

    const mounted = rows(sheet);
    expect(mounted).toContain(0);
    expect(mounted).toContain(1);
    expect(mounted).toContain(80);
    // And nothing in between.
    expect(mounted).not.toContain(40);
  });

  /** Each row appears once: frozen, or in the window, never both. */
  it('does not build a frozen row twice when the sheet is at the top', () => {
    const sheet = sheetWith(2, 0);
    sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });

    const mounted = rows(sheet);
    expect(new Set(mounted).size).toBe(mounted.length);
    expect(mounted[0]).toBe(0);
  });

  it('shortens the spacer above the window by the frozen rows', () => {
    const sheet = sheetWith(2, 0);
    sheet.update({ scrollX: 0, scrollY: 20 * ROW, width: 500, height: 240 });

    const first = rows(sheet).find(row => row >= 2) ?? 0;
    expect(spacers(sheet).top).toBe((first - 2) * ROW);
  });

  it('keeps the frozen columns in every row', () => {
    const sheet = sheetWith(0, 2);
    sheet.update({ scrollX: 20 * COLUMN, scrollY: 0, width: 500, height: 240 });

    const columns = columnsOf(sheet, rows(sheet)[0]);
    expect(columns[0]).toBe(0);
    expect(columns[1]).toBe(1);
    expect(columns[2]).toBeGreaterThan(2);
  });

  it('shortens the leading spacer by the frozen columns', () => {
    const sheet = sheetWith(0, 2);
    sheet.update({ scrollX: 20 * COLUMN, scrollY: 0, width: 500, height: 240 });

    const columns = columnsOf(sheet, rows(sheet)[0]);
    // The spacer stands in for the columns between the frozen ones
    // and the first one in the window.
    expect(spacers(sheet).lead).toBe((columns[2] - 2) * COLUMN);
  });

  it('does not put a frozen column in the window as well', () => {
    const sheet = sheetWith(0, 2);
    sheet.update({ scrollX: 0, scrollY: 0, width: 500, height: 240 });

    const columns = columnsOf(sheet, 0);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('freezes both axes at once', () => {
    const sheet = sheetWith(1, 1);
    sheet.update({ scrollX: 20 * COLUMN, scrollY: 40 * ROW, width: 500, height: 240 });

    expect(rows(sheet)).toContain(0);
    expect(columnsOf(sheet, 0)[0]).toBe(0);
  });

  it('rebuilds when the pane moves', () => {
    const sheet = sheetWith(0, 0);
    sheet.update({ scrollX: 0, scrollY: 40 * ROW, width: 500, height: 240 });
    expect(rows(sheet)).not.toContain(0);

    sheet.setFrozen(2, 0);
    expect(rows(sheet)).toContain(0);
  });
});
