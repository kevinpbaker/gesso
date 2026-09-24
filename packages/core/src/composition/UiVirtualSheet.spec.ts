import { describe, expect, it } from 'vitest';

import { Row, Text } from './UiComponents';
import type { UiElement } from './UiElement';
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

function columnsOf(sheet: UiVirtualSheet, row: number): number[] {
  const element = sheet.children$.value.find(child => child.props.key === `sheet:row:${row}`);
  if (element === undefined) {
    throw new Error(`row ${row} is not mounted`);
  }
  // The first child is the window's own leading spacer.
  return (element.children.slice(1) as UiElement[]).map(cell => cell.props.key as number);
}

function spacers(sheet: UiVirtualSheet): { top: number; bottom: number; lead: number } {
  const children = sheet.children$.value;
  const first = rows(sheet)[0];
  const row = children.find(child => child.props.key === `sheet:row:${first}`) as UiElement;
  return {
    top: children[0].props.height as number,
    bottom: children[children.length - 1].props.height as number,
    lead: (row.children[0] as UiElement).props.width as number
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
