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

/**
 * A grid over a store held here, with the active cell and the last edit
 * read back in two lines under it, so what the grid drew can be checked
 * against what it said.
 */
function LiveGrid(
  inputs: Inputs<{
    rows: number;
    columns: readonly DataGridColumn[];
    frozenColumns?: number;
    readOnly?: boolean;
    disabled?: boolean;
  }>,
  _ctx: ComponentContext
) {
  const edits = new Map<string, string>();
  const read = (row: number, column: string): string => edits.get(`${row}:${column}`) ?? seed(row, column);
  const columns = inputs.columns.value;
  const active = internalState<DataGridCell>({ row: 0, column: columns[0].key });
  const last = internalState('nothing yet');
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <DataGrid
        label="People"
        columns={columns}
        rowCount={inputs.rows.value}
        frozenColumns={inputs.frozenColumns.value ?? 0}
        readOnly={inputs.readOnly.value ?? false}
        disabled={inputs.disabled.value ?? false}
        getValue={read}
        onCellChange={(row, column, value) => {
          edits.set(`${row}:${column}`, value);
          last.value = `${column}, row ${row + 1} = "${value}"`;
        }}
        activeCell={active}
        onActiveCellChange={cell => (active.value = cell)}
        flexGrow={1}
        minHeight={0}
      />
      <text textStyle="bodySmall" color="textMuted">
        {active.pipe(map(describeCell))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {last.pipe(map(edit => `Last edit: ${edit}`))}
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
      try: 'Click Ravi 1, then without the mouse: Down, Right, Tab, Shift+Tab, End, Home move the outline as named. F2 opens the editor with the caret after the text; Left moves the caret, not the outline. Type and Tab: committed, outline one right. Type a letter over Score: it replaces the value. Escape: the old value is back. Delete clears an editable cell. Tab from Score leaves the grid.',
      width: 520,
      height: 320,
      stretch: true,
      render: () => <LiveGrid rows={60} columns={COLUMNS} />
    },
    {
      name: '100,000 rows by 50 columns',
      try: 'Fling the wheel both ways and drag both scrollbars. Cells always read C<column>:<row> for the row and column they are in, with no blanks, gaps or repeats, and the header stays put. Ctrl+End (Cmd+End) goes to C49:100000 and shows it; Ctrl+Home comes back. Scrolling stays smooth: no visible stall while dragging.',
      width: 560,
      height: 380,
      stretch: true,
      render: () => <LiveGrid rows={100_000} columns={FIFTY} />
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
