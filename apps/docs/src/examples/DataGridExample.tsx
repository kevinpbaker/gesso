import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { DataGrid, type DataGridCell, type DataGridColumn } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

/** How many rows the example has: enough that only a window of them could ever be mounted. */
export const ROWS = 10_000;

const ITEMS = ['Paper', 'Toner', 'Desks', 'Chairs', 'Laptops', 'Monitors', 'Cables', 'Coffee', 'Rent', 'Travel'];
const OWNERS = ['Ravi', 'Ana', 'Mikael', 'Yuki', 'Priya', 'Tomas', 'Noor'];
const QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const;

/**
 * The stored value of a cell nobody has edited.
 *
 * Worked out from the row rather than held: ten thousand rows by eight
 * columns is eighty thousand strings, and the grid only ever asks for
 * the few hundred in view. A real application would read its own store
 * here; the shape of the call is the same.
 */
function seed(row: number, column: string): string {
  switch (column) {
    case 'item':
      return `${ITEMS[row % ITEMS.length]} ${Math.floor(row / ITEMS.length) + 1}`;
    case 'owner':
      return OWNERS[(row * 3) % OWNERS.length];
    case 'note':
      return row % 7 === 0 ? 'Renewed every year, and due for a second quote before the next renewal' : '';
    default: {
      const quarter = QUARTERS.indexOf(column as (typeof QUARTERS)[number]);
      return String(((row + 1) * 37 * (quarter + 3)) % 900);
    }
  }
}

/** Thousands separated, for the money columns. The editor opens on the bare number. */
const money = (value: string): string => {
  const number = Number(value);
  return value === '' || Number.isNaN(number) ? value : number.toLocaleString('en-US');
};

/**
 * The columns, declared once at module scope: their widths are the
 * sheet's geometry, read when the grid is built.
 *
 * The quarters are editable and the total is not. It is worked out from
 * them, so typing into it would be typing into nothing; the grid marks
 * its cells read-only and refuses Enter, F2 and typing there.
 */
const COLUMNS: readonly DataGridColumn[] = [
  { key: 'item', header: 'Item', width: 140, editable: true },
  { key: 'owner', header: 'Owner', width: 100, editable: true },
  ...QUARTERS.map((key): DataGridColumn => ({
    key,
    header: key.toUpperCase(),
    width: 80,
    editable: true,
    align: 'end',
    format: money
  })),
  { key: 'total', header: 'Total', width: 90, align: 'end', format: money },
  { key: 'note', header: 'Note', width: 260, editable: true }
];

// #region grid
/**
 * A budget of ten thousand rows, edited in place.
 *
 * **The data stays here.** The grid holds no values: it asks
 * `getValue` for the cells in view, reports a committed edit through
 * `onCellChange`, and reads the cells in view again straight after,
 * which is how the Total beside an edited quarter changes with it.
 *
 * **The active cell is controlled,** so the line under the grid can
 * say where it is. The application writes back every cell it is asked
 * for; a grid whose application did not would stay where it was.
 *
 * The Item column is frozen: scroll sideways and it stays, with the
 * header above everything. Click a cell, then use the arrows, Tab,
 * Home and End, Page Up and Page Down, Ctrl+Home and Ctrl+End. Enter
 * or F2 edits, typing replaces, Escape puts the old value back.
 */
export function Budget(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const edits = new Map<string, string>();
  const read = (row: number, column: string): string => {
    if (column === 'total') {
      return String(QUARTERS.reduce((sum, quarter) => sum + (Number(read(row, quarter)) || 0), 0));
    }
    return edits.get(`${row}:${column}`) ?? seed(row, column);
  };

  const active = internalState<DataGridCell>({ row: 0, column: 'item' });
  const last = internalState('nothing yet');

  return (
    <column gap={10} padding={16} width={percent(100)} height={percent(100)}>
      <DataGrid
        label="Budget"
        columns={COLUMNS}
        rowCount={ROWS}
        frozenColumns={1}
        getValue={read}
        onCellChange={(row, column, value) => {
          edits.set(`${row}:${column}`, value);
          last.value = `${column.toUpperCase()} of row ${row + 1} set to "${value}"`;
        }}
        activeCell={active}
        onActiveCellChange={cell => (active.value = cell)}
        flexGrow={1}
        minHeight={0}
      />
      <text
        text={active.pipe(map(cell => `Active: ${cell.column.toUpperCase()}, row ${cell.row + 1} of ${ROWS}`))}
        fontSize={12}
        color="textMuted"
      />
      <text text={last.pipe(map(edit => `Last edit: ${edit}`))} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion grid
