import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Button, DataGrid, type DataGridCell, type DataGridColumn } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const NAMES = ['Ravi', 'Ana', 'Mikael', 'Yuki', 'Priya', 'Tomas', 'Noor', 'Elif', 'Sam', 'Ines', 'Kofi', 'Wei'];
const LONG =
  'A note far longer than its column, which should end in an ellipsis on one line and never spill into the next cell';

/** The value of a cell nobody has edited, the same every time so a scroll can be checked. */
function seed(row: number, column: string): string {
  switch (column) {
    case 'name':
      return `${NAMES[row % NAMES.length]} ${row + 1}`;
    case 'id':
      return String(row + 1);
    case 'team':
      return ['Platform', 'Design', 'Research'][row % 3];
    case 'score':
      return String((row * 7919) % 101);
    case 'note':
      return row % 3 === 0 ? LONG : 'Fine';
    default:
      // `c12` and the like, in the wide grids: the cell names itself.
      return `${column.toUpperCase()}:${row + 1}`;
  }
}

/** Id, name, team and score: the shape most states use. Id is read-only. */
const COLUMNS: readonly DataGridColumn[] = [
  { key: 'id', header: '#', width: 56, align: 'end' },
  { key: 'name', header: 'Name', width: 140, editable: true },
  { key: 'team', header: 'Team', width: 110, editable: true },
  { key: 'score', header: 'Score', width: 72, editable: true, align: 'end' }
];

/** Fifty columns, every one editable, for the large and the narrow states. */
const FIFTY: readonly DataGridColumn[] = Array.from({ length: 50 }, (_, index) => ({
  key: `c${index}`,
  header: `C${index}`,
  width: 96,
  editable: true
}));

/** A frozen name, then columns enough to scroll sideways under it. */
const FROZEN_COLUMNS: readonly DataGridColumn[] = [
  { key: 'name', header: 'Name', width: 140, editable: true },
  ...Array.from({ length: 12 }, (_, index) => ({
    key: `c${index}`,
    header: `Month ${index + 1}`,
    width: 96,
    editable: true
  }))
];

/** Read-only and editable columns side by side. */
const MIXED_COLUMNS: readonly DataGridColumn[] = [
  { key: 'id', header: '# (read-only)', width: 110, align: 'end' },
  { key: 'name', header: 'Name', width: 140, editable: true },
  { key: 'team', header: 'Team (read-only)', width: 140 },
  { key: 'score', header: 'Score', width: 80, editable: true, align: 'end' }
];

/** A header and a column of text that cannot fit. */
const LONG_COLUMNS: readonly DataGridColumn[] = [
  { key: 'name', header: 'A header far too long to fit in its column', width: 110, editable: true },
  { key: 'note', header: 'Notes', width: 220, editable: true }
];

function describeCell(cell: DataGridCell): string {
  return `Active: ${cell.column}, row ${cell.row + 1}`;
}

function describeRange(range: { from: DataGridCell; to: DataGridCell }): string {
  return `Range: ${range.from.column} ${range.from.row + 1} to ${range.to.column} ${range.to.row + 1}`;
}

/** Item, three months and a total, every one editable so the formulas can be changed. */
const BUDGET_COLUMNS: readonly DataGridColumn[] = [
  { key: 'item', header: 'Item', width: 130, editable: true },
  ...['Jan', 'Feb', 'Mar'].map((month): DataGridColumn => ({
    key: month.toLowerCase(),
    header: month,
    width: 84,
    editable: true,
    align: 'end'
  })),
  { key: 'total', header: 'Total', width: 96, editable: true, align: 'end' }
];
const BUDGET_ITEMS = ['Rent', 'Salaries', 'Laptops', 'Travel', 'Coffee', 'Software'];

/**
 * A small budget as a spreadsheet would hold it: values in the months,
 * a SUM along each row, totals and an average under them, and two rows
 * that are errors on purpose.
 */
function budgetSeed(row: number, column: string): string {
  const months = ['jan', 'feb', 'mar'];
  const n = row + 1;
  if (row < BUDGET_ITEMS.length) {
    if (column === 'item') {
      return BUDGET_ITEMS[row];
    }
    if (column === 'total') {
      return `=SUM(B${n}:D${n})`;
    }
    return String(((row + 2) * 137 * (months.indexOf(column) + 3)) % 900);
  }
  const letter = { jan: 'B', feb: 'C', mar: 'D', total: 'E' }[column];
  switch (row) {
    case 7:
      return column === 'item' ? 'Total' : `=SUM(${letter}1:${letter}6)`;
    case 8:
      return column === 'item' ? 'Average' : `=ROUND(AVERAGE(${letter}1:${letter}6), 1)`;
    case 9:
      return column === 'item' ? 'Per head (0 people)' : column === 'jan' ? '=B8/0' : '';
    case 10:
      return column === 'item' ? 'Past the edge' : column === 'jan' ? '=Z99+1' : '';
    default:
      return '';
  }
}

/**
 * A grid over a store held here, with the active cell, the range and
 * the last edit read back in lines under it, so what the grid drew can
 * be checked against what it said.
 */
function LiveGrid(
  inputs: Inputs<{
    rows: number;
    columns: readonly DataGridColumn[];
    frozenColumns?: number;
    frozenRows?: number;
    rowHeader?: boolean | ((row: number) => string);
    formulas?: boolean;
    values?: (row: number, column: string) => string;
    readOnly?: boolean;
    disabled?: boolean;
  }>,
  _ctx: ComponentContext
) {
  const edits = new Map<string, string>();
  const values = inputs.values.value ?? seed;
  const read = (row: number, column: string): string => edits.get(`${row}:${column}`) ?? values(row, column);
  const columns = inputs.columns.value;
  const active = internalState<DataGridCell>({ row: 0, column: columns[0].key });
  const range = internalState('one cell');
  const last = internalState('nothing yet');
  const resized = internalState('nothing yet');
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <DataGrid
        label="People"
        columns={columns}
        rowCount={inputs.rows.value}
        frozenColumns={inputs.frozenColumns.value ?? 0}
        frozenRows={inputs.frozenRows.value ?? 0}
        rowHeader={inputs.rowHeader.value ?? false}
        formulas={inputs.formulas.value ?? false}
        readOnly={inputs.readOnly.value ?? false}
        disabled={inputs.disabled.value ?? false}
        getValue={read}
        onCellChange={(row, column, value) => {
          edits.set(`${row}:${column}`, value);
          last.value = `${column}, row ${row + 1} = "${value}"`;
        }}
        onColumnResize={(column, width) => (resized.value = `${column} is ${width}px`)}
        activeCell={active}
        onActiveCellChange={cell => (active.value = cell)}
        onSelectionChange={next => (range.value = describeRange(next))}
        flexGrow={1}
        minHeight={0}
      />
      <text textStyle="bodySmall" color="textMuted">
        {active.pipe(map(describeCell))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {range}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {last.pipe(map(edit => `Last edit: ${edit}`))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {resized.pipe(map(width => `Last resize: ${width}`))}
      </text>
    </column>
  );
}

/** Widths the application owns, with a button that puts them back. */
function OwnedWidths(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const start = { id: 56, name: 140, team: 110, score: 72 };
  const widths = internalState<Record<string, number>>(start);
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <DataGrid
        label="People"
        columns={COLUMNS}
        rowCount={60}
        getValue={seed}
        columnWidths={widths}
        onColumnResize={(column, width) => (widths.value = { ...widths.value, [column]: Math.min(width, 240) })}
        flexGrow={1}
        minHeight={0}
      />
      <row gap={6}>
        <Button label="Reset widths" size="small" variant="outlined" onClick={() => (widths.value = start)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {widths.pipe(
          map(
            record =>
              `Widths: ${Object.entries(record)
                .map(([key, width]) => `${key} ${width}`)
                .join(', ')}`
          )
        )}
      </text>
    </column>
  );
}

/**
 * The active cell and the data changed from outside the grid, with no
 * key or click behind either: a jump far off screen, and a reload that
 * replaces every value at once.
 */
function DrivenGrid(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const active = internalState<DataGridCell>({ row: 0, column: 'name' });
  const revision = new BehaviorSubject(0);
  let suffix = '';
  const read = (row: number, column: string): string => `${seed(row, column)}${column === 'name' ? suffix : ''}`;
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <DataGrid
        label="People"
        columns={COLUMNS}
        rowCount={10_000}
        getValue={read}
        revision={revision}
        activeCell={active}
        onActiveCellChange={cell => (active.value = cell)}
        flexGrow={1}
        minHeight={0}
      />
      <row gap={6} flexWrap="wrap">
        <Button
          label="Go to row 5,000"
          size="small"
          variant="outlined"
          onClick={() => (active.value = { row: 4999, column: 'score' })}
        />
        <Button
          label="Reload data"
          size="small"
          variant="outlined"
          onClick={() => {
            suffix = suffix === '' ? ' (reloaded)' : '';
            revision.next(revision.value + 1);
          }}
        />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {active.pipe(map(describeCell))}
      </text>
    </column>
  );
}

export const dataGridFixture: WorkbenchFixture = {
  id: 'data-grid',
  name: 'DataGrid',
  source: 'packages/components/src/DataGrid.ts',
  states: [
    {
      name: 'Small editable grid',
      try: 'Click a Name cell: it gets a 2px outline and the Active line names it. Double-click it, type, and press Enter: the Last edit line shows the new value, the cell shows it, and the outline moves down one row. # cells take the outline but never open an editor.',
      width: 520,
      height: 300,
      stretch: true,
      render: () => <LiveGrid rows={12} columns={COLUMNS} />
    },
    {
      name: 'Keyboard editing walk',
      try: 'Click Ravi 1, then without the mouse: Down, Right, Tab, Shift+Tab, End, Home move the outline as named. F2 opens the editor with the caret after the text; Left moves the caret, not the outline. Type and Tab: committed, outline one right. Type a letter over Score: it replaces the value. Escape: the old value is back. Delete clears an editable cell. Tab from Score leaves the grid. On Name, type a whole word as fast as you can and press Enter at once: every letter is in the committed value, in order, and none is lost to the editor opening.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <LiveGrid rows={60} columns={COLUMNS} />
    },
    {
      name: '100,000 rows by 50 columns',
      try: 'Fling the wheel both ways and drag both scrollbars. Cells always read C<column>:<row> for the row and column they are in, with no blanks, gaps or repeats, and the header stays put. Ctrl+End (Cmd+End) goes to C49:100000 and shows it; Ctrl+Home comes back. Scrolling stays smooth: no visible stall while dragging, even dragging the vertical thumb from top to bottom in one quick move.',
      width: 560,
      height: 380,
      stretch: true,
      render: () => <LiveGrid rows={100_000} columns={FIFTY} />
    },
    {
      name: 'Selecting a range',
      try: 'Click Ravi 1, then Shift+Down twice and Shift+Right twice: nine cells take a light selection fill with a 2px border round the block, the Ravi 1 cell keeps its own background and its accent outline, and the Range line reads name 1 to score 3. Shift+click a cell further down: the block reaches it. Drag from Ana 2 down and across: the block follows the pointer, and holding the drag below the grid scrolls it. Escape: back to one outlined cell, no fill. Ctrl+A (Cmd+A): every cell filled, the outline still where it was. A plain arrow: one cell again. Type a letter with a block selected: the active cell edits.',
      width: 520,
      height: 340,
      stretch: true,
      render: () => <LiveGrid rows={60} columns={COLUMNS} />
    },
    {
      name: 'Copy and paste',
      try: 'Select Name and Team for rows 1 to 3 and press Ctrl+C (Cmd+C), then paste into a real spreadsheet or a text editor: three lines, the two values on each separated by a tab. Copy a block of cells from a spreadsheet, click Name on row 10 here and press Ctrl+V: the values land across and down from it, the read-only # and Team columns keep their own values, the block ends up selected, and the Last edit line names the last value written. Paste a block wider than the grid: the extra columns are dropped. Ctrl+X on a block copies all of it and empties Name and Score but not # or Team. Delete on a block empties the same cells.',
      width: 520,
      height: 340,
      stretch: true,
      render: () => <LiveGrid rows={60} columns={MIXED_COLUMNS} />
    },
    {
      name: 'Frozen first column',
      try: 'Scroll sideways: the Name column and its header stay at the left, the months slide under them, and a heavier line marks the freeze. Arrow right to Month 12, then back left: each month is shown in full beside the Name column, never half under it.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <LiveGrid rows={200} columns={FROZEN_COLUMNS} frozenColumns={1} />
    },
    {
      name: 'Resizing columns',
      try: 'Hover the line at the right of a header: the pointer becomes a column-resize cursor. Drag it right: the column and every cell under it widen with the pointer, the columns after it move along, and the Last resize line counts the pixels. Drag far left: it stops at 40px, never narrower. Double-click the line after Notes: the column fits the longest note in view (no ellipsis) or, if none is long, its header. Click a Name cell and press Alt+Shift+Right three times: Name grows 10px a press without the outline moving; Alt+Shift+Left shrinks it back.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <LiveGrid rows={40} columns={LONG_COLUMNS} />
    },
    {
      name: 'Widths owned by the app',
      try: 'Drag Name wider: it follows only up to 240px, because the application caps what it writes back, and the Widths line agrees with what is drawn. Reset widths puts every column back at once.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <OwnedWidths />
    },
    {
      name: 'Frozen rows and columns',
      try: 'The first two rows stay under the header while the rest scroll up under them, with a heavier line beneath row 2; Name stays at the left with its own heavier line, and the top-left cells stay put both ways. Ctrl+End (Cmd+End), then Up: each row is shown in full below row 2, never half under it. Page Down moves by the rows visible below the frozen ones. Ctrl+Home goes back to row 1 and scrolls the rest to the top.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <LiveGrid rows={200} columns={FROZEN_COLUMNS} frozenColumns={1} frozenRows={2} />
    },
    {
      name: 'Row headers',
      try: 'A narrow column of row numbers stays at the left while the rest scroll sideways. Click number 3: the whole row is selected, the outline is on its first visible cell, and the number takes the selection fill. Shift+click 7: rows 3 to 7. Click the blank corner above the numbers: everything is selected. Ctrl+C after clicking a number copies the whole row.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <LiveGrid rows={200} columns={FROZEN_COLUMNS} rowHeader />
    },
    {
      name: 'Formulas: a budget',
      try: 'Each header shows its letter (A to E). Totals read as numbers, not formulas, Row 10 shows #DIV/0! and row 11 #REF! in red. Click Jan for Rent (B1), type 1000 and press Enter: its row Total, the Jan Total in row 8 and the Average in row 9 all change at once. F2 on a Total shows =SUM(B1:D1) in the editor. Type =B1*2 in an empty cell: it shows the result. Type =E1 into E1: #CYCLE!. Select the Totals row and copy: the text has numbers, not formulas.',
      width: 560,
      height: 380,
      stretch: true,
      render: () => <LiveGrid rows={14} columns={BUDGET_COLUMNS} values={budgetSeed} rowHeader formulas />
    },
    {
      name: 'Read-only columns',
      try: 'Enter, F2, a double click and typing all do nothing on the read-only columns, and Delete does not clear them; on Name and Score they edit. A screen reader hears "read only" on those cells.',
      width: 520,
      height: 300,
      stretch: true,
      render: () => <LiveGrid rows={30} columns={MIXED_COLUMNS} />
    },
    {
      name: 'Read-only grid',
      try: 'Nothing can be edited anywhere, but the outline still moves with the keys and clicks, and the grid still takes focus.',
      width: 520,
      height: 300,
      stretch: true,
      render: () => <LiveGrid rows={30} columns={COLUMNS} readOnly />
    },
    {
      name: 'Long cell text',
      try: 'The long header and every long note end in an ellipsis on one line, inside their cell. Open a long note with F2: the editor scrolls its text sideways rather than wrapping or widening the cell.',
      width: 420,
      height: 300,
      stretch: true,
      render: () => <LiveGrid rows={40} columns={LONG_COLUMNS} />
    },
    {
      name: 'Narrow card',
      try: 'A 220px card over fifty columns: it scrolls both ways, the header stays at the top, and nothing is drawn past the rounded border. Arrow keys keep the outline in view in both directions.',
      width: 220,
      height: 300,
      stretch: true,
      render: () => <LiveGrid rows={500} columns={FIFTY} />
    },
    {
      name: 'Right to left',
      try: 'Name starts at the right edge and is frozen there; the months run off to the left. Left arrow moves toward Month 12 and Right back toward Name. Scroll left: Name stays at the right with its freeze line on its left side. End reaches Month 12 at the left edge.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => (
        <box textDirection="rtl" width={percent(100)} height={percent(100)}>
          <LiveGrid rows={200} columns={FROZEN_COLUMNS} frozenColumns={1} />
        </box>
      )
    },
    {
      name: 'Disabled',
      try: 'Clicks, double clicks and keys do nothing, Tab skips the grid, and the text is dimmed. It still scrolls with the wheel.',
      width: 520,
      height: 300,
      stretch: true,
      render: () => <LiveGrid rows={30} columns={COLUMNS} disabled />
    },
    {
      name: 'Driven from outside',
      try: 'Go to row 5,000 scrolls the grid to row 5000 and outlines its Score with no click. Reload data appends "(reloaded)" to every name in view at once, and again takes it away.',
      width: 520,
      height: 340,
      stretch: true,
      render: () => <DrivenGrid />
    }
  ]
};
