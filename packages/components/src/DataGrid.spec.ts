import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { ShellService, createComponent, type ShellRequest } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import { Box, Column, type UiNode } from 'gesso-core';
import { DataGrid, type DataGridCell, type DataGridColumn, type DataGridProps, type DataGridRange } from './DataGrid';

/** Three columns: an editable name, a read-only id, an editable amount drawn with a currency. */
const COLUMNS: readonly DataGridColumn[] = [
  { key: 'name', header: 'Name', width: 120, editable: true },
  { key: 'id', header: 'Id', width: 80, align: 'end' },
  { key: 'amount', header: 'Amount', width: 100, editable: true, align: 'end', format: value => `$${value}` }
];

/** A store the grid reads and writes, so a commit can be seen to land. */
function store(rows: number) {
  const values = new Map<string, string>();
  const at = (row: number, column: string) => `${row}:${column}`;
  return {
    changes: [] as [number, string, string][],
    get: (row: number, column: string): string =>
      values.get(at(row, column)) ?? (column === 'name' ? `name ${row}` : column === 'id' ? String(row + 1) : '10'),
    set(row: number, column: string, value: string) {
      this.changes.push([row, column, value]);
      values.set(at(row, column), value);
    },
    rows
  };
}

type Store = ReturnType<typeof store>;

/** A 360×200 grid over a store, with a focusable box after it for Tab to land on. */
function mount(
  options: {
    direction?: 'ltr' | 'rtl';
    rows?: number;
    columns?: readonly DataGridColumn[];
    props?: Partial<DataGridProps>;
  } = {}
): { ui: Rendered; data: Store; moves: DataGridCell[] } {
  const data = store(options.rows ?? 1000);
  const moves: DataGridCell[] = [];
  const ui = renderTest(
    Column(
      { width: 400, height: 300, textDirection: options.direction ?? 'ltr' },
      createComponent(DataGrid, {
        label: 'Ledger',
        columns: options.columns ?? COLUMNS,
        rowCount: data.rows,
        getValue: data.get,
        onCellChange: (row: number, column: string, value: string) => data.set(row, column, value),
        onActiveCellChange: (cell: DataGridCell) => moves.push(cell),
        width: 360,
        height: 200,
        ...options.props
      }),
      Box({ focusable: true, label: 'After', role: 'button', width: 20, height: 20 })
    ),
    { width: 400, height: 300 }
  );
  ui.frame();
  return { ui, data, moves };
}

const grid = (ui: Rendered): UiNode => ui.getByRole('grid');
const cellNamed = (ui: Rendered, name: string): UiNode => ui.getByRole('gridcell', { name });
const selected = (ui: Rendered): string[] =>
  ui
    .getAllByRole('gridcell')
    .filter(node => ui.getSemantics(node).states?.includes('selected'))
    .map(node => ui.getSemantics(node).label ?? '');
const focusGrid = (ui: Rendered): void => {
  ui.fireEvent.focus(grid(ui));
  ui.frame();
};
const press = (
  ui: Rendered,
  key: string,
  modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }
): void => {
  ui.fireEvent.press(key, modifiers);
  ui.frame();
};
const focusedId = (ui: Rendered): string | null => ui.runtime.focusedNodeId();
const editor = (ui: Rendered): UiNode | null => ui.queryByRole('textbox');

describe('DataGrid, rendering', () => {
  it('draws a header and the rows in view, and no more', () => {
    const { ui } = mount();

    expect(ui.getAllByRole('columnheader').map(node => ui.getSemantics(node).label)).toEqual(['Name', 'Id', 'Amount']);
    // 200 tall with a 32 header and 28 rows is six rows in view, plus
    // the overscan: a handful of rows, out of a thousand.
    const rows = ui.getAllByRole('row').length - 1;
    expect(rows).toBeGreaterThan(5);
    expect(rows).toBeLessThan(20);
    expect(cellNamed(ui, 'name 0')).toBeTruthy();
  });

  it('draws a value through its column format, and edits the stored one', () => {
    const { ui } = mount();
    expect(ui.getAllByRole('gridcell', { name: '$10' }).length).toBeGreaterThan(0);

    focusGrid(ui);
    press(ui, 'End');
    press(ui, 'Enter');
    expect(editor(ui)).not.toBeNull();
    expect(editor(ui)!.properties.get('value')).toBe('10');
  });

  it('mounts a screenful of a hundred thousand rows by fifty columns, and reaches the far corner', () => {
    const wide = Array.from({ length: 50 }, (_, index) => ({ key: `c${index}`, header: `C${index}`, width: 90 }));
    const { ui } = mount({ rows: 100_000, columns: wide, props: { getValue: (row, column) => `${column}r${row}` } });

    // Five million cells, and only the few in the window exist.
    expect(ui.getAllByRole('gridcell').length).toBeLessThan(150);

    focusGrid(ui);
    press(ui, 'End', { ctrl: true });
    ui.frame();
    expect(selected(ui)).toEqual(['c49r99999']);
    expect(ui.getAllByRole('gridcell').length).toBeLessThan(150);
    const last = ui.getAllByRole('row').at(-1)!;
    // The header is row 1, so the last of a hundred thousand is 100,001.
    expect(ui.getSemantics(last)).toMatchObject({ rowIndex: 100_001 });
    expect(ui.getSemantics(grid(ui))).toMatchObject({ rowCount: 100_001, columnCount: 50 });
    expect(ui.getSemantics(cellNamed(ui, 'c49r99999')).columnIndex).toBe(50);

    press(ui, 'Home', { ctrl: true });
    ui.frame();
    expect(selected(ui)).toEqual(['c0r0']);
  });
});

describe('DataGrid, semantics', () => {
  it('is a grid whose rows say where they sit in the whole data', () => {
    const { ui } = mount();
    const record = ui.getSemantics(grid(ui));
    expect(record.role).toBe('grid');
    expect(record.label).toBe('Ledger');
    // Every row, the header included, and every column.
    expect(record).toMatchObject({ rowCount: 1001, columnCount: 3 });

    const rows = ui.getAllByRole('row').map(node => ui.getSemantics(node));
    expect(rows[0]).toMatchObject({ label: 'Column headers', rowIndex: 1 });
    expect(rows[1]).toMatchObject({ rowIndex: 2 });
    expect(rows[2]).toMatchObject({ rowIndex: 3 });
    // A row of a grid is not an item in a set: that is a tree's.
    expect(rows[1].posInSet).toBeUndefined();
    expect(ui.getAllByRole('columnheader').map(node => ui.getSemantics(node).columnIndex)).toEqual([1, 2, 3]);
    expect(ui.getSemantics(cellNamed(ui, 'name 0')).columnIndex).toBe(1);
    expect(ui.getSemantics(cellNamed(ui, '1')).columnIndex).toBe(2);
  });

  it('gives a cell its column in the whole data after a sideways scroll', () => {
    const wide: readonly DataGridColumn[] = Array.from({ length: 12 }, (_, index) => ({
      key: `m${index}`,
      header: `M${index}`,
      width: 100
    }));
    const { ui } = mount({ columns: wide, props: { getValue: (row, column) => `${column} ${row}` } });
    focusGrid(ui);
    press(ui, 'End');
    ui.frame();
    // Column 1 is long gone from the window; the cells in view say
    // which column they really are, not where they are among the mounted.
    expect(ui.queryByRole('gridcell', { name: 'm0 0' })).toBeNull();
    expect(ui.getSemantics(cellNamed(ui, 'm11 0')).columnIndex).toBe(12);
    expect(ui.getSemantics(ui.getByRole('columnheader', { name: 'M11' })).columnIndex).toBe(12);
  });

  it('marks the active cell selected, makes it the active descendant, and marks read-only cells', () => {
    const { ui } = mount();
    const first = cellNamed(ui, 'name 0');
    expect(ui.getSemantics(first).states).toEqual(['selected']);
    expect(ui.getSemantics(grid(ui)).activeDescendant).toBe(ui.getSemantics(first).id);
    expect(ui.getSemantics(cellNamed(ui, '1')).states).toEqual(['readonly']);

    focusGrid(ui);
    press(ui, 'ArrowRight');
    const id = cellNamed(ui, '1');
    expect(ui.getSemantics(id).states).toEqual(['readonly', 'selected']);
    expect(ui.getSemantics(grid(ui)).activeDescendant).toBe(ui.getSemantics(id).id);
    expect(ui.getSemantics(first).states ?? []).toEqual([]);
  });

  it('says so when the whole grid is read-only', () => {
    const { ui } = mount({ props: { readOnly: true } });
    expect(ui.getSemantics(grid(ui)).states).toEqual(['readonly']);
    expect(ui.getSemantics(cellNamed(ui, 'name 1')).states).toEqual(['readonly']);
  });
});

describe('DataGrid, keyboard', () => {
  it('walks with the arrows, clamped at the edges', () => {
    const { ui, moves } = mount();
    focusGrid(ui);

    press(ui, 'ArrowDown');
    press(ui, 'ArrowRight');
    press(ui, 'ArrowRight');
    expect(selected(ui)).toEqual(['$10']);
    // Past the last column is the last column, never the next row.
    press(ui, 'ArrowRight');
    press(ui, 'ArrowUp');
    press(ui, 'ArrowUp');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'amount' });
    press(ui, 'ArrowLeft');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'id' });
  });

  it('goes to the ends of a row with Home and End, and to the corners with Ctrl', () => {
    const { ui, moves } = mount();
    focusGrid(ui);

    press(ui, 'ArrowDown');
    press(ui, 'End');
    expect(moves.at(-1)).toEqual({ row: 1, column: 'amount' });
    press(ui, 'Home');
    expect(moves.at(-1)).toEqual({ row: 1, column: 'name' });
    press(ui, 'End', { ctrl: true });
    expect(moves.at(-1)).toEqual({ row: 999, column: 'amount' });
    // Command on a Mac does what Control does elsewhere.
    press(ui, 'Home', { meta: true });
    expect(moves.at(-1)).toEqual({ row: 0, column: 'name' });
  });

  it('pages by what the viewport shows', () => {
    const { ui, moves } = mount();
    focusGrid(ui);

    // 200 high less a 32 header is 168, six rows of 28.
    press(ui, 'PageDown');
    expect(moves.at(-1)).toEqual({ row: 6, column: 'name' });
    press(ui, 'PageDown');
    expect(moves.at(-1)).toEqual({ row: 12, column: 'name' });
    press(ui, 'PageUp');
    expect(moves.at(-1)).toEqual({ row: 6, column: 'name' });
  });

  it('scrolls the active cell into view below the header', () => {
    const { ui } = mount();
    focusGrid(ui);
    press(ui, 'PageDown');
    press(ui, 'PageDown');
    ui.frame();

    const cell = cellNamed(ui, 'name 12');
    const box = ui.getVisibleBox(cell);
    const view = ui.getVisibleBox(grid(ui));
    expect(box.y).toBeGreaterThanOrEqual(view.y + 32);
    expect(box.y + box.height).toBeLessThanOrEqual(view.y + view.height + 0.5);
  });

  it('walks across a row with Tab, and lets focus leave off either end of it', () => {
    const { ui, moves } = mount();
    focusGrid(ui);

    press(ui, 'Tab');
    press(ui, 'Tab');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'amount' });
    press(ui, 'Tab', { shift: true });
    expect(moves.at(-1)).toEqual({ row: 0, column: 'id' });

    press(ui, 'Tab');
    // The last cell of the row: Tab is not the grid's any more, so a
    // hundred thousand rows are not a hundred thousand Tabs to leave.
    press(ui, 'Tab');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'amount' });
    expect(focusedId(ui)).toBe(ui.getByRole('button', { name: 'After' }).id);
  });

  it('leaves unbound keys alone', () => {
    const { ui, moves } = mount();
    focusGrid(ui);
    press(ui, 'Escape');
    press(ui, 's', { ctrl: true });
    expect(moves).toEqual([]);
    expect(editor(ui)).toBeNull();
  });
});

describe('DataGrid, editing', () => {
  it('opens on Enter, commits on Enter and moves down', () => {
    const { ui, data } = mount();
    focusGrid(ui);

    press(ui, 'Enter');
    const field = editor(ui)!;
    expect(field).not.toBeNull();
    expect(field.properties.get('value')).toBe('name 0');
    // The editor has the keyboard, with the caret at the end of the value.
    expect(focusedId(ui)).toBe(field.id);
    ui.fireEvent.type('!');
    press(ui, 'Enter');

    expect(data.changes).toEqual([[0, 'name', 'name 0!']]);
    expect(editor(ui)).toBeNull();
    expect(cellNamed(ui, 'name 0!')).toBeTruthy();
    expect(selected(ui)).toEqual(['name 1']);
    // The active descendant followed the move to the next row.
    expect(ui.getSemantics(grid(ui)).activeDescendant).toBe(ui.getSemantics(cellNamed(ui, 'name 1')).id);
    // And the keyboard is the grid's again.
    expect(focusedId(ui)).toBe(grid(ui).id);
  });

  it('opens on F2 too', () => {
    const { ui } = mount();
    focusGrid(ui);
    press(ui, 'F2');
    expect(editor(ui)!.properties.get('value')).toBe('name 0');
  });

  it('replaces the value when a character is typed over the cell', () => {
    const { ui, data } = mount();
    focusGrid(ui);

    press(ui, 'Z');
    expect(editor(ui)!.properties.get('value')).toBe('Z');
    ui.fireEvent.type('oe');
    press(ui, 'Enter');
    expect(data.changes).toEqual([[0, 'name', 'Zoe']]);
  });

  it('keeps every key typed before the editor has the keyboard, in order', () => {
    const { ui, data } = mount();
    focusGrid(ui);

    // Five keys inside one frame: the editor that "Z" opens is built
    // on that key and only takes focus on the next layout.
    ui.fireEvent.press('Z');
    ui.fireEvent.press('o');
    ui.fireEvent.press('x');
    ui.fireEvent.press('Backspace');
    ui.fireEvent.press('e');
    ui.frame();
    expect(editor(ui)!.properties.get('value')).toBe('Zoe');
    expect(focusedId(ui)).toBe(editor(ui)!.id);
    // And the editor goes on from there, with the caret after them.
    ui.fireEvent.type('y');
    press(ui, 'Enter');
    expect(data.changes).toEqual([[0, 'name', 'Zoey']]);
  });

  it('commits on an Enter typed before the editor has the keyboard', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    ui.fireEvent.press('End');
    ui.fireEvent.press('4');
    ui.fireEvent.press('2');
    ui.fireEvent.press('Enter');
    ui.frame();

    expect(data.changes).toEqual([[0, 'amount', '42']]);
    expect(editor(ui)).toBeNull();
    expect(selected(ui)).toEqual(['$10']);
    expect(focusedId(ui)).toBe(grid(ui).id);
  });

  it('lets an input method compose into the editor once it is open', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    press(ui, 'F2');
    ui.fireEvent.compositionStart();
    ui.fireEvent.compositionUpdate('とう');
    ui.fireEvent.compositionEnd('東');
    ui.frame();
    press(ui, 'Enter');
    expect(data.changes).toEqual([[0, 'name', 'name 0東']]);
  });

  it('commits on Tab and moves across', () => {
    const { ui, data, moves } = mount();
    focusGrid(ui);
    press(ui, 'End');
    press(ui, '7');
    press(ui, 'Tab', { shift: true });
    expect(data.changes).toEqual([[0, 'amount', '7']]);
    expect(moves.at(-1)).toEqual({ row: 0, column: 'id' });
    expect(cellNamed(ui, '$7')).toBeTruthy();
  });

  it('puts the old value back on Escape', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    press(ui, 'x');
    ui.fireEvent.type('yz');
    press(ui, 'Escape');

    expect(data.changes).toEqual([]);
    expect(editor(ui)).toBeNull();
    expect(cellNamed(ui, 'name 0')).toBeTruthy();
    expect(focusedId(ui)).toBe(grid(ui).id);
  });

  it('reports nothing when the value did not change', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    press(ui, 'Enter');
    press(ui, 'Enter');
    expect(data.changes).toEqual([]);
    expect(selected(ui)).toEqual(['name 1']);
  });

  it('keeps the arrows for the caret while the editor is open', () => {
    const { ui, moves } = mount();
    focusGrid(ui);
    press(ui, 'Enter');
    press(ui, 'ArrowLeft');
    press(ui, 'ArrowDown');
    expect(moves).toEqual([]);
    expect(editor(ui)).not.toBeNull();
  });

  it('refuses a read-only cell, and a read-only grid', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    press(ui, 'ArrowRight');
    press(ui, 'Enter');
    press(ui, 'F2');
    press(ui, 'q');
    press(ui, 'Delete');
    expect(editor(ui)).toBeNull();
    expect(data.changes).toEqual([]);

    const locked = mount({ props: { readOnly: true } });
    focusGrid(locked.ui);
    press(locked.ui, 'Enter');
    press(locked.ui, 'q');
    expect(editor(locked.ui)).toBeNull();
  });

  it('clears an editable cell with Delete or Backspace', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    press(ui, 'Delete');
    press(ui, 'ArrowDown');
    press(ui, 'Backspace');
    expect(data.changes).toEqual([
      [0, 'name', ''],
      [1, 'name', '']
    ]);
  });

  it('reads the cell again after a commit, so a refused edit shows the old value', () => {
    const data = store(50);
    const ui = renderTest(
      createComponent(DataGrid, {
        columns: COLUMNS,
        rowCount: 50,
        getValue: data.get,
        // Heard and not written back.
        onCellChange: () => {},
        width: 360,
        height: 200
      }),
      { width: 400, height: 300 }
    );
    ui.frame();
    focusGrid(ui);
    press(ui, 'k');
    press(ui, 'Enter');
    expect(cellNamed(ui, 'name 0')).toBeTruthy();
    expect(ui.queryByRole('gridcell', { name: 'k' })).toBeNull();
  });

  it('reads back only the cell a commit changed', () => {
    const data = store(1000);
    const asked: string[] = [];
    const { ui } = mount({
      props: {
        getValue: (row: number, column: string) => {
          asked.push(`${row}:${column}`);
          return data.get(row, column);
        },
        onCellChange: (row: number, column: string, value: string) => data.set(row, column, value)
      }
    });
    focusGrid(ui);
    press(ui, 'Enter');
    ui.fireEvent.type('!');
    asked.length = 0;
    press(ui, 'Enter');

    expect(data.changes).toEqual([[0, 'name', 'name 0!']]);
    expect(cellNamed(ui, 'name 0!')).toBeTruthy();
    // Compared before it is reported, and read back after: the one
    // cell, and none of the dozens around it.
    expect(new Set(asked)).toEqual(new Set(['0:name']));
  });

  it('reads the cells again when the revision changes', () => {
    const revision = new BehaviorSubject(0);
    let prefix = 'name';
    const ui = renderTest(
      createComponent(DataGrid, {
        columns: COLUMNS,
        rowCount: 50,
        getValue: (row: number, column: string) => (column === 'name' ? `${prefix} ${row}` : ''),
        revision,
        width: 360,
        height: 200
      }),
      { width: 400, height: 300 }
    );
    ui.frame();
    prefix = 'renamed';
    ui.frame();
    expect(cellNamed(ui, 'name 0')).toBeTruthy();
    revision.next(1);
    ui.frame();
    expect(cellNamed(ui, 'renamed 0')).toBeTruthy();
  });
});

describe('DataGrid, pointer', () => {
  it('makes a clicked cell active and takes the keyboard', () => {
    const { ui, moves } = mount();
    ui.fireEvent.click(cellNamed(ui, 'name 3'));
    ui.frame();
    expect(moves.at(-1)).toEqual({ row: 3, column: 'name' });
    expect(focusedId(ui)).toBe(grid(ui).id);
    press(ui, 'ArrowDown');
    expect(moves.at(-1)).toEqual({ row: 4, column: 'name' });
  });

  it('edits on a double click, and only where the column allows it', () => {
    const { ui, data } = mount();
    ui.fireEvent.doubleClick(cellNamed(ui, '3'));
    ui.frame();
    expect(editor(ui)).toBeNull();

    ui.fireEvent.doubleClick(cellNamed(ui, 'name 2'));
    ui.frame();
    expect(editor(ui)!.properties.get('value')).toBe('name 2');
    ui.fireEvent.type('b');

    // A click on another cell keeps what was typed, as a spreadsheet does.
    ui.fireEvent.click(cellNamed(ui, 'name 4'));
    ui.frame();
    expect(data.changes).toEqual([[2, 'name', 'name 2b']]);
    expect(editor(ui)).toBeNull();
  });
});

describe('DataGrid, controlled and uncontrolled', () => {
  it('starts on defaultActiveCell and owns its own moves', () => {
    const { ui, moves } = mount({ props: { defaultActiveCell: { row: 2, column: 'id' } } });
    expect(selected(ui)).toEqual(['3']);
    focusGrid(ui);
    press(ui, 'ArrowDown');
    expect(selected(ui)).toEqual(['4']);
    expect(moves).toEqual([{ row: 3, column: 'id' }]);
  });

  it('draws only what it is handed when the active cell is controlled', () => {
    const cell = new BehaviorSubject<DataGridCell>({ row: 1, column: 'name' });
    const { ui, moves } = mount({ props: { activeCell: cell as unknown as DataGridCell } });
    focusGrid(ui);

    press(ui, 'ArrowDown');
    // Asked for, and not written back: nothing moves.
    expect(moves).toEqual([{ row: 2, column: 'name' }]);
    expect(selected(ui)).toEqual(['name 1']);

    // Written from outside, far off screen: the grid goes there.
    cell.next({ row: 700, column: 'amount' });
    ui.frame();
    ui.frame();
    expect(selected(ui)).toEqual(['$10']);
    expect(ui.getSemantics(cellNamed(ui, 'name 700'))).toBeTruthy();
  });

  it('refuses both activeCell and defaultActiveCell', () => {
    expect(() =>
      mount({
        props: { activeCell: { row: 0, column: 'name' }, defaultActiveCell: { row: 1, column: 'name' } }
      })
    ).toThrow(/DataGrid/);
  });
});

describe('DataGrid, disabled', () => {
  it('takes no focus, no key and no click', () => {
    const { ui, moves, data } = mount({ props: { disabled: true } });
    expect(ui.getSemantics(grid(ui)).disabled).toBe(true);
    expect(ui.fireEvent.focus(grid(ui))).toBe(false);

    // Through the hit tester, as a real press arrives, and straight at
    // the cell, as an automation would send it.
    const box = ui.getVisibleBox(cellNamed(ui, 'name 2'));
    ui.fireEvent.pointerDown(box.x + 10, box.y + 10);
    ui.fireEvent.pointerUp(box.x + 10, box.y + 10);
    ui.fireEvent.click(cellNamed(ui, 'name 2'));
    ui.fireEvent.doubleClick(cellNamed(ui, 'name 2'));
    ui.frame();
    press(ui, 'ArrowDown');
    press(ui, 'Enter');
    expect(moves).toEqual([]);
    expect(editor(ui)).toBeNull();
    expect(data.changes).toEqual([]);
  });
});

describe('DataGrid, frozen columns', () => {
  const WIDE: readonly DataGridColumn[] = [
    { key: 'name', header: 'Name', width: 120, editable: true },
    ...Array.from({ length: 8 }, (_, index) => ({ key: `m${index}`, header: `M${index}`, width: 100 }))
  ];
  const values = (row: number, column: string) => `${column} ${row}`;

  it('keeps the frozen column in view while the rest scroll past it', () => {
    const { ui } = mount({ columns: WIDE, props: { frozenColumns: 1, getValue: values } });
    focusGrid(ui);
    const view = ui.getVisibleBox(grid(ui));

    press(ui, 'End');
    ui.frame();
    // Scrolled sideways to the last column...
    expect(grid(ui).properties.get('scrollX')).toBeGreaterThan(0);
    const last = ui.getVisibleBox(cellNamed(ui, 'm7 0'));
    expect(last.x + last.width).toBeLessThanOrEqual(view.x + view.width + 0.5);
    // ...and the name is where it started, at the left edge.
    const name = ui.getVisibleBox(cellNamed(ui, 'name 0'));
    expect(name.x).toBeCloseTo(view.x, 0);
    const header = ui.getVisibleBox(ui.getByRole('columnheader', { name: 'Name' }));
    expect(header.x).toBeCloseTo(view.x, 0);

    // Walking back left stops short of the frozen column's width: the
    // first scrolled column is revealed beside it, not under it.
    press(ui, 'Home');
    press(ui, 'ArrowRight');
    ui.frame();
    const first = ui.getVisibleBox(cellNamed(ui, 'm0 0'));
    expect(first.x).toBeGreaterThanOrEqual(view.x + 120 - 0.5);
  });
});

describe('DataGrid, right to left', () => {
  const WIDE: readonly DataGridColumn[] = [
    { key: 'name', header: 'Name', width: 120, editable: true },
    ...Array.from({ length: 8 }, (_, index) => ({ key: `m${index}`, header: `M${index}`, width: 100 }))
  ];
  const values = (row: number, column: string) => `${column} ${row}`;

  it('starts the row at the right, and moves toward the arrow', () => {
    const { ui, moves } = mount({ direction: 'rtl' });
    const view = ui.getVisibleBox(grid(ui));
    const first = ui.getVisibleBox(cellNamed(ui, 'name 0'));
    expect(first.x + first.width).toBeCloseTo(view.x + view.width, 0);

    focusGrid(ui);
    // Left is toward the end of a row that reads from the right.
    press(ui, 'ArrowLeft');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'id' });
    press(ui, 'ArrowRight');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'name' });
    // Home and End are the row's start and end, not its left and right.
    press(ui, 'End');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'amount' });
  });

  it('scrolls left to reveal a column, holding the frozen one at the right edge', () => {
    const { ui } = mount({ direction: 'rtl', columns: WIDE, props: { frozenColumns: 1, getValue: values } });
    focusGrid(ui);
    const view = ui.getVisibleBox(grid(ui));

    press(ui, 'End');
    ui.frame();
    // A sheet that reads right to left scrolls toward its end with a
    // negative offset.
    expect(grid(ui).properties.get('scrollX')).toBeLessThan(0);
    const last = ui.getVisibleBox(cellNamed(ui, 'm7 0'));
    expect(last.x).toBeGreaterThanOrEqual(view.x - 0.5);
    const name = ui.getVisibleBox(cellNamed(ui, 'name 0'));
    expect(name.x + name.width).toBeCloseTo(view.x + view.width, 0);
  });
});

/** The cells drawn with the range's fill: in it, and not the active cell. */
const filled = (ui: Rendered): string[] =>
  ui
    .getAllByRole('gridcell')
    .filter(node => node.properties.get('backgroundColor') === 'selectionBackground')
    .map(node => ui.getSemantics(node).label ?? '');

describe('DataGrid, selecting a range', () => {
  it('stretches a range with Shift and the arrows, keeping the active cell where it was', () => {
    const ranges: DataGridRange[] = [];
    const { ui, moves } = mount({ props: { onSelectionChange: (range: DataGridRange) => ranges.push(range) } });
    focusGrid(ui);

    press(ui, 'ArrowDown', { shift: true });
    press(ui, 'ArrowRight', { shift: true });
    expect(moves).toEqual([]);
    expect(ranges.at(-1)).toEqual({ from: { row: 0, column: 'name' }, to: { row: 1, column: 'id' } });
    // Every cell in it is selected; the active cell stays the one a
    // screen reader is on.
    expect(selected(ui)).toEqual(['name 0', '1', 'name 1', '2']);
    expect(ui.getSemantics(grid(ui)).activeDescendant).toBe(ui.getSemantics(cellNamed(ui, 'name 0')).id);
    // The fill is on the range around the active cell, not on it.
    expect(filled(ui)).toEqual(['1', 'name 1', '2']);

    // Back up past the active cell turns the range around it.
    press(ui, 'ArrowRight', { shift: true });
    press(ui, 'ArrowUp', { shift: true });
    expect(selected(ui)).toEqual(['name 0', '1', '$10']);
  });

  it('stretches to the ends with Shift and Home, End and Ctrl', () => {
    const ranges: DataGridRange[] = [];
    const { ui } = mount({ props: { onSelectionChange: (range: DataGridRange) => ranges.push(range) } });
    focusGrid(ui);
    press(ui, 'ArrowDown');
    press(ui, 'End', { shift: true });
    expect(ranges.at(-1)).toEqual({ from: { row: 1, column: 'name' }, to: { row: 1, column: 'amount' } });
    press(ui, 'End', { shift: true, ctrl: true });
    expect(ranges.at(-1)).toEqual({ from: { row: 1, column: 'name' }, to: { row: 999, column: 'amount' } });
    press(ui, 'PageUp', { shift: true });
    expect(ranges.at(-1)?.to).toEqual({ row: 993, column: 'amount' });
  });

  it('collapses onto the active cell with Escape, or with a plain move', () => {
    const { ui, moves } = mount();
    focusGrid(ui);
    press(ui, 'ArrowDown', { shift: true });
    press(ui, 'Escape');
    expect(selected(ui)).toEqual(['name 0']);
    expect(filled(ui)).toEqual([]);

    press(ui, 'ArrowDown', { shift: true });
    press(ui, 'ArrowRight');
    expect(moves.at(-1)).toEqual({ row: 0, column: 'id' });
    expect(selected(ui)).toEqual(['1']);
  });

  it('selects everything with Ctrl+A, or Cmd+A', () => {
    const ranges: DataGridRange[] = [];
    const { ui, moves } = mount({ props: { onSelectionChange: (range: DataGridRange) => ranges.push(range) } });
    focusGrid(ui);
    press(ui, 'ArrowDown');
    press(ui, 'a', { meta: true });
    expect(ranges.at(-1)).toEqual({ from: { row: 0, column: 'name' }, to: { row: 999, column: 'amount' } });
    expect(moves).toEqual([{ row: 1, column: 'name' }]);
    expect(ui.getAllByRole('gridcell').every(node => ui.getSemantics(node).states?.includes('selected'))).toBe(true);
  });

  it('still edits the active cell, by typing or with Enter, while a range is selected', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    press(ui, 'ArrowDown', { shift: true });
    press(ui, 'Q');
    press(ui, 'Enter');
    expect(data.changes).toEqual([[0, 'name', 'Q']]);
    // The commit moved the active cell, and the range went with it.
    expect(selected(ui)).toEqual(['name 1']);
  });

  it('stretches a range with a Shift+click', () => {
    const { ui, moves } = mount();
    ui.fireEvent.click(cellNamed(ui, 'name 1'));
    ui.fireEvent.click(cellNamed(ui, 'name 3'), { modifiers: { shift: true } });
    ui.frame();
    expect(moves).toEqual([{ row: 1, column: 'name' }]);
    expect(selected(ui)).toEqual(['name 1', 'name 2', 'name 3']);
  });

  it('stretches a range with a drag, and with a Shift+press', () => {
    const { ui, moves } = mount();
    const centre = (node: UiNode) => {
      const box = ui.getVisibleBox(node);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const from = centre(cellNamed(ui, 'name 1'));
    const to = centre(cellNamed(ui, '4'));
    ui.fireEvent.pointerDown(from.x, from.y);
    ui.fireEvent.pointerMove(to.x + 60, to.y, { buttons: 1 });
    ui.fireEvent.pointerUp(to.x + 60, to.y);
    ui.frame();
    expect(moves).toEqual([{ row: 1, column: 'name' }]);
    expect(focusedId(ui)).toBe(grid(ui).id);
    expect(selected(ui)).toEqual(['name 1', '2', '$10', 'name 2', '3', '$10', 'name 3', '4', '$10']);

    // Held past the bottom edge, the drag scrolls toward the cell
    // under the pointer.
    const view = ui.getVisibleBox(grid(ui));
    ui.fireEvent.pointerDown(from.x, from.y);
    ui.fireEvent.pointerMove(from.x, view.y + view.height + 40, { buttons: 1 });
    ui.fireEvent.pointerUp(from.x, view.y + view.height + 40);
    ui.frame();
    ui.frame();
    expect(grid(ui).properties.get('scrollY')).toBeGreaterThan(0);
    press(ui, 'Escape');
    press(ui, 'Home', { ctrl: true });
    press(ui, 'ArrowDown');
    ui.frame();

    // A Shift+press stretches it again from the same active cell, and
    // the click that follows the release does not collapse it.
    const shifted = centre(cellNamed(ui, 'name 0'));
    ui.fireEvent.pointerDown(shifted.x, shifted.y, { modifiers: { shift: true } });
    ui.fireEvent.pointerUp(shifted.x, shifted.y, { modifiers: { shift: true } });
    ui.frame();
    expect(selected(ui)).toEqual(['name 0', 'name 1']);
  });

  it('starts on defaultSelection', () => {
    const { ui } = mount({
      props: { defaultSelection: { from: { row: 0, column: 'name' }, to: { row: 0, column: 'amount' } } }
    });
    expect(selected(ui)).toEqual(['name 0', '1', '$10']);
  });

  it('draws only the range it is handed when the selection is controlled', () => {
    const range = new BehaviorSubject<DataGridRange>({
      from: { row: 0, column: 'name' },
      to: { row: 0, column: 'name' }
    });
    const asked: DataGridRange[] = [];
    const { ui } = mount({
      props: {
        selection: range as unknown as DataGridRange,
        onSelectionChange: (next: DataGridRange) => asked.push(next)
      }
    });
    focusGrid(ui);
    press(ui, 'ArrowDown', { shift: true });
    // Asked for, and not written back: nothing is drawn.
    expect(asked).toEqual([{ from: { row: 0, column: 'name' }, to: { row: 1, column: 'name' } }]);
    expect(selected(ui)).toEqual(['name 0']);

    // Written from outside: drawn, with the active cell still marked.
    range.next({ from: { row: 2, column: 'id' }, to: { row: 3, column: 'amount' } });
    ui.frame();
    expect(selected(ui)).toEqual(['name 0', '3', '$10', '4', '$10']);
  });

  it('refuses both selection and defaultSelection', () => {
    const one = { from: { row: 0, column: 'name' }, to: { row: 0, column: 'name' } };
    expect(() => mount({ props: { selection: one, defaultSelection: one } })).toThrow(/DataGrid.*selection/);
  });
});

describe('DataGrid, the clipboard', () => {
  /** A grid with a shell that records what it is asked to copy. */
  function withShell(options: Parameters<typeof mount>[0] = {}) {
    const mounted = mount(options);
    const copied: string[] = [];
    mounted.ui.runtime.services.get(ShellService).setHandler((request: ShellRequest) => {
      if (request.type === 'clipboard') {
        copied.push(request.text);
      }
    });
    return { ...mounted, copied };
  }

  it('copies the range as tab-separated stored values, rows by line', () => {
    const { ui, copied } = withShell();
    focusGrid(ui);
    press(ui, 'ArrowDown', { shift: true });
    press(ui, 'End', { shift: true });
    press(ui, 'c', { ctrl: true });
    // The amount is copied as stored, not as drawn.
    expect(copied).toEqual(['name 0\t1\t10\nname 1\t2\t10']);

    // The active cell alone, with Cmd.
    press(ui, 'Escape');
    press(ui, 'c', { meta: true });
    expect(copied.at(-1)).toBe('name 0');
  });

  it('quotes a value that holds a tab, a line break or a quote', () => {
    const { ui, copied } = withShell({
      props: {
        getValue: (_row: number, column: string) => (column === 'name' ? 'a\tb' : column === 'id' ? 'say "hi"' : 'x')
      }
    });
    focusGrid(ui);
    press(ui, 'ArrowRight', { shift: true });
    press(ui, 'c', { ctrl: true });
    expect(copied).toEqual(['"a\tb"\t"say ""hi"""']);
  });

  it('pastes a block from the active cell, clipped at the edges and around read-only cells', () => {
    const { ui, data } = withShell();
    focusGrid(ui);
    press(ui, 'End', { ctrl: true });
    press(ui, 'Home');
    press(ui, 'ArrowUp');
    ui.fireEvent.paste('a\tb\tc\td\r\ne\tf\tg\th\r\ni\tj\r\n');
    ui.frame();

    // Two rows were left and three columns: the third line and the
    // fourth value of each fall off, and the read-only Id keeps its own.
    expect(data.changes).toEqual([
      [998, 'name', 'a'],
      [998, 'amount', 'c'],
      [999, 'name', 'e'],
      [999, 'amount', 'g']
    ]);
    // Each written cell was read back, and the range is the block that
    // landed.
    expect(selected(ui)).toEqual(['a', '999', '$c', 'e', '1000', '$g']);
  });

  it('reads a quoted field whole, line breaks included', () => {
    const { ui, data } = withShell();
    focusGrid(ui);
    ui.fireEvent.paste('"two\nlines"\tskipped\t"say ""hi"""\n');
    ui.frame();
    expect(data.changes).toEqual([
      [0, 'name', 'two\nlines'],
      [0, 'amount', 'say "hi"']
    ]);
  });

  it('cuts: copies the range and clears what may be cleared', () => {
    const { ui, data, copied } = withShell();
    focusGrid(ui);
    press(ui, 'ArrowRight', { shift: true });
    press(ui, 'x', { ctrl: true });
    expect(copied).toEqual(['name 0\t1']);
    expect(data.changes).toEqual([[0, 'name', '']]);
  });

  it('clears every editable cell of the range with Delete', () => {
    const { ui, data } = mount();
    focusGrid(ui);
    press(ui, 'ArrowDown', { shift: true });
    press(ui, 'End', { shift: true });
    press(ui, 'Delete');
    expect(data.changes).toEqual([
      [0, 'name', ''],
      [0, 'amount', ''],
      [1, 'name', ''],
      [1, 'amount', '']
    ]);
  });

  it('takes no paste in a read-only grid, and leaves it for whatever listens above', () => {
    const { ui, data } = withShell({ props: { readOnly: true } });
    focusGrid(ui);
    // The paste is offered, and not taken.
    expect(ui.runtime.input.editing.paste('z')).toBe(false);
    ui.frame();
    expect(data.changes).toEqual([]);
  });
});

const header = (ui: Rendered, name: string): UiNode => ui.getByRole('columnheader', { name });
/** The grip at a header's end edge, which is the last thing in the header cell. */
const edgeOf = (ui: Rendered, name: string): UiNode => header(ui, name).lastChild!;
const widthOf = (ui: Rendered, node: UiNode): number => ui.getVisibleBox(node).width;
/** The text a cell draws, which sits under the fragment its content is bound through. */
const textIn = (node: UiNode): UiNode => {
  let inner = node.firstChild!;
  while (inner.firstChild !== null) {
    inner = inner.firstChild;
  }
  return inner;
};
/** A press on a header's edge, dragged sideways by `by` and let go. */
const dragEdge = (ui: Rendered, name: string, by: number): void => {
  const box = ui.getVisibleBox(edgeOf(ui, name));
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  ui.fireEvent.pointerDown(x, y);
  ui.fireEvent.pointerMove(x + by / 2, y, { buttons: 1 });
  ui.fireEvent.pointerMove(x + by, y, { buttons: 1 });
  ui.fireEvent.pointerUp(x + by, y);
  ui.frame();
};

describe('DataGrid, resizing columns', () => {
  it('resizes a column by dragging its header edge, cells and all, and not below its minimum', () => {
    const resized: [string, number][] = [];
    const { ui, moves } = mount({ props: { onColumnResize: (key, width) => resized.push([key, width]) } });

    dragEdge(ui, 'Name', 40);
    expect(resized.at(-1)).toEqual(['name', 160]);
    expect(widthOf(ui, header(ui, 'Name'))).toBe(160);
    expect(widthOf(ui, cellNamed(ui, 'name 0'))).toBe(160);
    // The columns after it moved along with the edge.
    expect(ui.getVisibleBox(cellNamed(ui, '1')).x).toBeCloseTo(ui.getVisibleBox(cellNamed(ui, 'name 0')).x + 160, 0);
    // A drag on an edge is not a press on a cell.
    expect(moves).toEqual([]);

    dragEdge(ui, 'Name', -400);
    expect(resized.at(-1)).toEqual(['name', 40]);
    expect(widthOf(ui, cellNamed(ui, 'name 0'))).toBe(40);
  });

  it('keeps a frozen column holding its place when the one before it grows', () => {
    const wide: readonly DataGridColumn[] = [
      { key: 'name', header: 'Name', width: 100, editable: true },
      { key: 'id', header: 'Id', width: 60 },
      ...Array.from({ length: 6 }, (_, index) => ({ key: `m${index}`, header: `M${index}`, width: 100 }))
    ];
    const { ui } = mount({ columns: wide, props: { frozenColumns: 2, getValue: (row, column) => `${column} ${row}` } });
    dragEdge(ui, 'Name', 30);
    focusGrid(ui);
    press(ui, 'End');
    ui.frame();
    const view = ui.getVisibleBox(grid(ui));
    // Scrolled to the end, the second frozen column sits right after
    // the wider first one, not where the first one used to end.
    expect(ui.getVisibleBox(cellNamed(ui, 'id 0')).x).toBeCloseTo(view.x + 130, 0);
  });

  it('draws only the widths it is handed when they are controlled', () => {
    const widths = new BehaviorSubject<Record<string, number>>({ name: 200 });
    const asked: [string, number][] = [];
    const { ui } = mount({
      props: {
        columnWidths: widths as unknown as Record<string, number>,
        onColumnResize: (key, width) => asked.push([key, width])
      }
    });
    expect(widthOf(ui, header(ui, 'Name'))).toBe(200);
    // Columns the record leaves out keep their own width.
    expect(widthOf(ui, header(ui, 'Id'))).toBe(80);

    dragEdge(ui, 'Name', 20);
    expect(asked.at(-1)).toEqual(['name', 220]);
    expect(widthOf(ui, header(ui, 'Name'))).toBe(200);

    widths.next({ name: 90, id: 50 });
    ui.frame();
    expect(widthOf(ui, header(ui, 'Name'))).toBe(90);
    expect(widthOf(ui, cellNamed(ui, '1'))).toBe(50);
  });

  it('resizes the active cell column with Alt+Shift and the arrows, mirrored under right to left', () => {
    const resized: [string, number][] = [];
    const { ui, moves } = mount({ props: { onColumnResize: (key, width) => resized.push([key, width]) } });
    focusGrid(ui);
    press(ui, 'ArrowRight', { alt: true, shift: true });
    press(ui, 'ArrowRight', { alt: true, shift: true });
    press(ui, 'ArrowLeft', { alt: true, shift: true });
    expect(resized).toEqual([
      ['name', 130],
      ['name', 140],
      ['name', 130]
    ]);
    // Neither the active cell nor the range moved.
    expect(moves).toEqual([]);
    expect(selected(ui)).toEqual(['name 0']);

    const rtl = mount({ direction: 'rtl', props: { onColumnResize: (key, width) => resized.push([key, width]) } });
    focusGrid(rtl.ui);
    // The end edge of a column is its left one, so Left pulls it wider.
    press(rtl.ui, 'ArrowLeft', { alt: true, shift: true });
    expect(resized.at(-1)).toEqual(['name', 130]);
    expect(widthOf(rtl.ui, header(rtl.ui, 'Name'))).toBe(130);
  });

  it('drags the edge toward the row end under right to left, which is leftward', () => {
    const resized: [string, number][] = [];
    const { ui } = mount({ direction: 'rtl', props: { onColumnResize: (key, width) => resized.push([key, width]) } });
    dragEdge(ui, 'Name', -30);
    expect(resized.at(-1)).toEqual(['name', 150]);
    const view = ui.getVisibleBox(grid(ui));
    const name = ui.getVisibleBox(cellNamed(ui, 'name 0'));
    // Still against the right edge, and wider to its left.
    expect(name.x + name.width).toBeCloseTo(view.x + view.width, 0);
    expect(name.width).toBe(150);
  });

  it('fits a column to the widest value in view on a double click of its edge', () => {
    const long = 'A value a great deal wider than its column';
    const { ui } = mount({
      props: { getValue: (row, column) => (column === 'name' ? (row === 2 ? long : 'x') : column === 'id' ? 'i' : '1') }
    });
    ui.fireEvent.doubleClick(edgeOf(ui, 'Name'));
    ui.frame();
    const fitted = widthOf(ui, header(ui, 'Name'));
    expect(fitted).toBeGreaterThan(200);
    // The text of the widest value fits inside the cell's padding.
    const text = textIn(cellNamed(ui, long));
    expect(ui.getVisibleBox(text).width).toBeLessThanOrEqual(fitted - 16);

    // A column of short values is pulled in to its header.
    ui.fireEvent.doubleClick(edgeOf(ui, 'Amount'));
    ui.frame();
    expect(widthOf(ui, header(ui, 'Amount'))).toBeLessThan(100);
    expect(widthOf(ui, header(ui, 'Amount'))).toBeGreaterThanOrEqual(40);
  });

  it('refuses a column that says it is not resizable, and a disabled grid', () => {
    const fixed: readonly DataGridColumn[] = [{ ...COLUMNS[0], resizable: false }, ...COLUMNS.slice(1)];
    const resized: [string, number][] = [];
    const { ui } = mount({ columns: fixed, props: { onColumnResize: (key, width) => resized.push([key, width]) } });
    dragEdge(ui, 'Name', 40);
    focusGrid(ui);
    press(ui, 'ArrowRight', { alt: true, shift: true });
    expect(resized).toEqual([]);
    expect(widthOf(ui, header(ui, 'Name'))).toBe(120);

    const off = mount({ props: { disabled: true, onColumnResize: (key, width) => resized.push([key, width]) } });
    dragEdge(off.ui, 'Name', 40);
    expect(resized).toEqual([]);
  });
});

describe('DataGrid, frozen rows', () => {
  it('keeps the frozen rows below the header while the rest scroll under them', () => {
    const { ui } = mount({ props: { frozenRows: 2 } });
    focusGrid(ui);
    const view = ui.getVisibleBox(grid(ui));

    press(ui, 'End', { ctrl: true });
    ui.frame();
    expect(grid(ui).properties.get('scrollY')).toBeGreaterThan(0);
    expect(ui.getVisibleBox(cellNamed(ui, 'name 0')).y).toBeCloseTo(view.y + 32, 0);
    expect(ui.getVisibleBox(cellNamed(ui, 'name 1')).y).toBeCloseTo(view.y + 60, 0);
    const last = ui.getVisibleBox(cellNamed(ui, 'name 999'));
    expect(last.y + last.height).toBeLessThanOrEqual(view.y + view.height + 0.5);
    // Still announced in their place in the data.
    const rows = ui.getAllByRole('row').map(node => ui.getSemantics(node).rowIndex);
    expect(rows.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('reveals a row below the frozen ones, and pages by the rows left under them', () => {
    const { ui, moves } = mount({ props: { frozenRows: 2 } });
    focusGrid(ui);
    const view = ui.getVisibleBox(grid(ui));
    press(ui, 'End', { ctrl: true });
    // Ctrl+Home goes to the first cell and takes the scrolled rows back
    // to the top, so row 3 sits under the frozen two again.
    press(ui, 'Home', { ctrl: true });
    ui.frame();
    expect(grid(ui).properties.get('scrollY')).toBe(0);
    expect(ui.getVisibleBox(cellNamed(ui, 'name 2')).y).toBeCloseTo(view.y + 88, 0);

    // 200 high less the header and two frozen rows is 112: four rows.
    press(ui, 'PageDown');
    expect(moves.at(-1)).toEqual({ row: 4, column: 'name' });
    press(ui, 'PageDown');
    press(ui, 'PageDown');
    ui.frame();
    press(ui, 'ArrowUp');
    press(ui, 'ArrowUp');
    press(ui, 'ArrowUp');
    press(ui, 'ArrowUp');
    press(ui, 'ArrowUp');
    ui.frame();
    // Walking up, the active row is revealed beside the frozen rows,
    // never under them.
    const active = moves.at(-1)!;
    const box = ui.getVisibleBox(cellNamed(ui, `name ${active.row}`));
    expect(box.y).toBeGreaterThanOrEqual(view.y + 88 - 0.5);
  });

  it('selects and edits a frozen row like any other', () => {
    const { ui, data } = mount({ props: { frozenRows: 1 } });
    ui.fireEvent.doubleClick(cellNamed(ui, 'name 0'));
    ui.frame();
    ui.fireEvent.type('!');
    press(ui, 'Enter');
    expect(data.changes).toEqual([[0, 'name', 'name 0!']]);
    expect(selected(ui)).toEqual(['name 1']);
  });
});

describe('DataGrid, row headers', () => {
  it('numbers the rows in a column of row headers that stays at the start', () => {
    const wide: readonly DataGridColumn[] = Array.from({ length: 8 }, (_, index) => ({
      key: `m${index}`,
      header: `M${index}`,
      width: 100
    }));
    const { ui } = mount({ columns: wide, props: { rowHeader: true, getValue: (row, column) => `${column} ${row}` } });
    const headers = ui.getAllByRole('rowheader');
    expect(headers.slice(0, 3).map(node => ui.getSemantics(node).label)).toEqual(['1', '2', '3']);
    expect(ui.getSemantics(headers[0]).columnIndex).toBe(1);
    expect(ui.getSemantics(cellNamed(ui, 'm0 0')).columnIndex).toBe(2);
    expect(ui.getSemantics(grid(ui))).toMatchObject({ columnCount: 9 });

    focusGrid(ui);
    press(ui, 'End');
    ui.frame();
    const view = ui.getVisibleBox(grid(ui));
    expect(ui.getVisibleBox(ui.getByRole('rowheader', { name: '1' })).x).toBeCloseTo(view.x, 0);
    // The last column ends inside the grid, and the first scrolled
    // column is revealed beside the row headers, not under them.
    const last = ui.getVisibleBox(cellNamed(ui, 'm7 0'));
    expect(last.x + last.width).toBeLessThanOrEqual(view.x + view.width + 0.5);
    press(ui, 'Home');
    press(ui, 'ArrowRight');
    ui.frame();
    expect(ui.getVisibleBox(cellNamed(ui, 'm1 0')).x).toBeGreaterThanOrEqual(view.x + 48 - 0.5);
  });

  it('takes its text from rowHeader when it is a function', () => {
    const { ui } = mount({ props: { rowHeader: (row: number) => `R${row * 10}` } });
    expect(ui.getByRole('rowheader', { name: 'R20' })).toBeTruthy();
  });

  it('selects a row on a click, stretches rows with a Shift+click, and everything from the corner', () => {
    const ranges: DataGridRange[] = [];
    const { ui, moves } = mount({
      props: { rowHeader: true, onSelectionChange: (range: DataGridRange) => ranges.push(range) }
    });
    ui.fireEvent.click(ui.getByRole('rowheader', { name: '3' }));
    ui.frame();
    expect(moves.at(-1)).toEqual({ row: 2, column: 'name' });
    expect(selected(ui)).toEqual(['name 2', '3', '$10']);
    expect(focusedId(ui)).toBe(grid(ui).id);

    ui.fireEvent.click(ui.getByRole('rowheader', { name: '5' }), { modifiers: { shift: true } });
    ui.frame();
    expect(ranges.at(-1)).toEqual({ from: { row: 2, column: 'name' }, to: { row: 4, column: 'amount' } });
    expect(selected(ui)).toEqual(['name 2', '3', '$10', 'name 3', '4', '$10', 'name 4', '5', '$10']);

    ui.fireEvent.click(ui.getAllByRole('columnheader')[0]);
    ui.frame();
    expect(ranges.at(-1)).toEqual({ from: { row: 0, column: 'name' }, to: { row: 999, column: 'amount' } });
  });

  it('stands at the right edge under right to left', () => {
    const { ui } = mount({ direction: 'rtl', props: { rowHeader: true } });
    const view = ui.getVisibleBox(grid(ui));
    const first = ui.getVisibleBox(ui.getByRole('rowheader', { name: '1' }));
    expect(first.x + first.width).toBeCloseTo(view.x + view.width, 0);
    const name = ui.getVisibleBox(cellNamed(ui, 'name 0'));
    expect(name.x + name.width).toBeCloseTo(first.x, 0);
  });
});

describe('DataGrid, formulas', () => {
  const SHEET: readonly DataGridColumn[] = [
    { key: 'a', header: 'Item', width: 100, editable: true },
    { key: 'b', header: 'Cost', width: 100, editable: true, align: 'end', format: value => `$${value}` },
    { key: 'c', header: 'Note', width: 100, editable: true }
  ];

  /** A sheet store seeded by A1 names, written back on every change. */
  function sheet(seed: Record<string, string>, options: { formulas?: boolean } = {}) {
    const values = new Map<string, string>();
    for (const [name, value] of Object.entries(seed)) {
      const column = SHEET[name.charCodeAt(0) - 65].key;
      values.set(`${Number(name.slice(1)) - 1}:${column}`, value);
    }
    const changes: [number, string, string][] = [];
    const mounted = mount({
      columns: SHEET,
      rows: 20,
      props: {
        formulas: options.formulas ?? true,
        getValue: (row, column) => values.get(`${row}:${column}`) ?? '',
        onCellChange: (row, column, value) => {
          changes.push([row, column, value]);
          values.set(`${row}:${column}`, value);
        }
      }
    });
    return { ...mounted, changes };
  }

  it('shows what a formula comes to, through the column format, and edits the formula', () => {
    const { ui } = sheet({ B1: '4', B2: '6', B3: '=SUM(B1:B2)', C1: '=B3*2' });
    expect(ui.getSemantics(cellNamed(ui, '$10')).columnIndex).toBe(2);
    expect(cellNamed(ui, '20')).toBeTruthy();

    ui.fireEvent.click(cellNamed(ui, '$10'));
    press(ui, 'F2');
    expect(editor(ui)!.properties.get('value')).toBe('=SUM(B1:B2)');
  });

  it('works everything that reads a cell out again after a commit, with no revision', () => {
    const { ui, changes } = sheet({ B1: '4', B2: '6', B3: '=SUM(B1:B2)', C1: '=B3*2' });
    focusGrid(ui);
    press(ui, 'ArrowRight');
    press(ui, '1');
    ui.fireEvent.type('4');
    press(ui, 'Enter');
    expect(changes).toEqual([[0, 'b', '14']]);
    expect(cellNamed(ui, '$20')).toBeTruthy();
    expect(cellNamed(ui, '40')).toBeTruthy();

    // A cell that becomes a formula is worked out at once.
    press(ui, 'ArrowRight');
    press(ui, '=');
    ui.fireEvent.type('B1+1');
    press(ui, 'Enter');
    expect(changes.at(-1)).toEqual([1, 'c', '=B1+1']);
    expect(cellNamed(ui, '15')).toBeTruthy();
  });

  it('shows an error by its code, in the danger colour', () => {
    const { ui } = sheet({ A1: 'Paper', B1: '=1/0', B2: '=A1+1', B3: '=B3', B4: '12' });
    const division = cellNamed(ui, '#DIV/0!');
    expect(textIn(division).properties.get('color')).toBe('danger');
    expect(cellNamed(ui, '#VALUE!')).toBeTruthy();
    expect(cellNamed(ui, '#CYCLE!')).toBeTruthy();
    expect(textIn(cellNamed(ui, '$12')).properties.get('color')).not.toBe('danger');
  });

  it('copies what a formula shows, unformatted, and pastes the text as it comes', () => {
    const { ui, changes } = sheet({ A1: 'Paper', B1: '4', B2: '=B1*3' });
    const copied: string[] = [];
    ui.runtime.services.get(ShellService).setHandler((request: ShellRequest) => {
      if (request.type === 'clipboard') {
        copied.push(request.text);
      }
    });
    focusGrid(ui);
    press(ui, 'ArrowDown', { shift: true });
    press(ui, 'ArrowRight', { shift: true });
    press(ui, 'c', { ctrl: true });
    expect(copied).toEqual(['Paper\t4\n\t12']);

    press(ui, 'Escape');
    press(ui, 'ArrowDown');
    press(ui, 'ArrowDown');
    press(ui, 'ArrowRight');
    ui.fireEvent.paste('=B2+1\t=B3');
    ui.frame();
    expect(changes).toEqual([
      [2, 'b', '=B2+1'],
      [2, 'c', '=B3']
    ]);
    expect(cellNamed(ui, '$13')).toBeTruthy();
    expect(cellNamed(ui, '13')).toBeTruthy();
  });

  it('works formulas out again on a new revision, for data that changed on its own', () => {
    const values = new Map<string, string>([
      ['0:b', '1'],
      ['1:b', '=B1*100']
    ]);
    const revision = new BehaviorSubject(0);
    const { ui } = mount({
      columns: SHEET,
      rows: 20,
      props: { formulas: true, revision, getValue: (row, column) => values.get(`${row}:${column}`) ?? '' }
    });
    expect(cellNamed(ui, '$100')).toBeTruthy();
    values.set('0:b', '2');
    ui.frame();
    // Kept until the grid is told: a scroll frame works nothing out.
    expect(cellNamed(ui, '$100')).toBeTruthy();
    revision.next(1);
    ui.frame();
    expect(cellNamed(ui, '$200')).toBeTruthy();
  });

  it('names each column header by its letter as well', () => {
    const { ui } = sheet({});
    expect(ui.getAllByRole('columnheader').map(node => ui.getSemantics(node).label)).toEqual([
      'Item, column A',
      'Cost, column B',
      'Note, column C'
    ]);
  });

  it('leaves a value that starts with = alone when formulas are off', () => {
    const { ui } = sheet({ B1: '=1+1' }, { formulas: false });
    expect(cellNamed(ui, '$=1+1')).toBeTruthy();
    expect(ui.getAllByRole('columnheader').map(node => ui.getSemantics(node).label)).toEqual(['Item', 'Cost', 'Note']);
  });
});
