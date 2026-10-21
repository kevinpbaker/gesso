import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import { Box, Column, type UiNode } from 'gesso-core';
import { DataGrid, type DataGridCell, type DataGridColumn, type DataGridProps } from './DataGrid';

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
const press = (ui: Rendered, key: string, modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean }): void => {
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
    expect(ui.getSemantics(last)).toMatchObject({ posInSet: 100_000, setSize: 100_000 });

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

    const rows = ui.getAllByRole('row').map(node => ui.getSemantics(node));
    expect(rows[0].label).toBe('Column headers');
    expect(rows[1]).toMatchObject({ posInSet: 1, setSize: 1000 });
    expect(rows[2]).toMatchObject({ posInSet: 2, setSize: 1000 });
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
    // The rows were built again to read the value back, and the active
    // descendant followed the new cells rather than the old ones.
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
