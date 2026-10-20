import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { fr, percent } from 'gesso-core';
import { Button, DataTable, type DataColumn, type DataTableSort } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** One row of every table here. */
interface Person {
  readonly id: number;
  readonly name: string;
  readonly team: string;
  readonly score: number;
  readonly note: string;
}

const NAMES = ['Ravi', 'Ana', 'Mikael', 'Yuki', 'Priya', 'Tomas', 'Noor', 'Elif', 'Sam', 'Ines', 'Kofi', 'Wei'];
const TEAMS = ['Platform', 'Design', 'Research'];

/** `count` people, the same every time, so a row can be recognised after a sort or a scroll. */
function people(count: number): readonly Person[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    name: `${NAMES[id % NAMES.length]} ${id + 1}`,
    team: TEAMS[id % TEAMS.length],
    // Scattered rather than in order, so a sort visibly moves things.
    score: (id * 7919) % 101,
    note: id % 5 === 0 ? 'On leave until the end of the quarter, then back on the platform team full time' : 'Fine'
  }));
}

const TWELVE = people(12);
const ONE = people(1);
const NONE: readonly Person[] = [];
const MANY = people(100000);

const PersonTable = DataTable<Person>;

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
const byScore = (a: Person, b: Person) => a.score - b.score;

/** Row number, name, team and score: the shape most states use. */
const COLUMNS: readonly DataColumn<Person>[] = [
  {
    key: 'id',
    header: '#',
    width: 56,
    align: 'end',
    compare: (a, b) => a.id - b.id,
    cell: (row, _index, color) => <text text={String(row.id + 1)} fontSize={12} color={color} />
  },
  {
    key: 'name',
    header: 'Name',
    width: fr(2),
    compare: byName,
    cell: (row, _index, color) => <text text={row.name} fontSize={13} color={color} />
  },
  {
    key: 'team',
    header: 'Team',
    width: fr(1),
    cell: (row, _index, color) => <text text={row.team} fontSize={12} color={color} />
  },
  {
    key: 'score',
    header: 'Score',
    width: 64,
    align: 'end',
    compare: byScore,
    cell: (row, _index, color) => <text text={String(row.score)} fontSize={13} color={color} />
  }
];

/** Fixed widths that add up to far more than the card. */
const WIDE_COLUMNS: readonly DataColumn<Person>[] = [
  ...COLUMNS.map(column => ({ ...column, width: 160 })),
  {
    key: 'note',
    header: 'Notes',
    width: 320,
    cell: (row, _index, color) => <text text={row.note} fontSize={12} color={color} maxLines={1} />
  }
];

/** One column that cuts its text short and one that wraps it, so rows differ in height. */
const LONG_COLUMNS: readonly DataColumn<Person>[] = [
  {
    key: 'name',
    header: 'A header far too long to fit in its column',
    width: 110,
    compare: byName,
    cell: (row, _index, color) => (
      <text
        text={`${row.name} Featherstonehaugh-Cholmondeley`}
        fontSize={13}
        color={color}
        maxLines={1}
        textOverflow="ellipsis"
      />
    )
  },
  {
    key: 'note',
    header: 'Notes',
    width: fr(1),
    cell: (row, _index, color) => <text text={row.note} fontSize={12} color={color} textWrap="word" />
  }
];

function describeSort(sort: DataTableSort | null): string {
  return sort === null ? 'Unsorted' : `Sorted by ${sort.column}, ${sort.direction}`;
}

function describeChoice(rows: readonly Person[], index: number): string {
  if (index < 0) {
    return 'Chosen: nobody';
  }
  const row = rows[index];
  return row === undefined ? `Chosen: row ${index}, which is not in the data` : `Chosen: ${row.name} (row ${index})`;
}

/**
 * A table whose sort and choice are held here and read back in a line
 * under it, so what the table drew can be checked against what it said.
 */
function LiveTable(
  inputs: Inputs<{
    rows: readonly Person[];
    columns?: readonly DataColumn<Person>[];
    defaultSort?: DataTableSort | null;
    rowHeight?: number;
  }>,
  _ctx: ComponentContext
) {
  const rows = inputs.rows.value;
  const sort = internalState<DataTableSort | null>(inputs.defaultSort.value ?? null);
  const chosen = internalState(-1);
  const opened = internalState('nothing');
  const line = combineLatest([sort, chosen]).pipe(
    map(([order, row]) => `${describeSort(order)}. ${describeChoice(rows, row)}`)
  );
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <PersonTable
        label="People"
        columns={inputs.columns.value ?? COLUMNS}
        rows={rows}
        rowHeight={inputs.rowHeight.value ?? 28}
        columnGap={8}
        flexGrow={1}
        minHeight={0}
        sort={sort}
        onSortChange={next => (sort.value = next)}
        selectedRow={chosen}
        onSelect={index => (chosen.value = index)}
        onActivate={index => (opened.value = rows[index]?.name ?? `row ${index}`)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {line}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {opened.pipe(map(name => `Enter opened: ${name}`))}
      </text>
    </column>
  );
}

/** Sort and choice set by buttons outside the table, with no header press behind them. */
function DrivenTable(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const sort = internalState<DataTableSort | null>(null);
  const chosen = internalState(-1);
  const line = combineLatest([sort, chosen]).pipe(
    map(([order, row]) => `${describeSort(order)}. ${describeChoice(TWELVE, row)}`)
  );
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <PersonTable
        label="People"
        columns={COLUMNS}
        rows={TWELVE}
        flexGrow={1}
        minHeight={0}
        sort={sort}
        onSortChange={next => (sort.value = next)}
        selectedRow={chosen}
        onSelect={index => (chosen.value = index)}
      />
      <row gap={6} flexWrap="wrap">
        <Button
          label="Best score first"
          size="small"
          variant="outlined"
          onClick={() => (sort.value = { column: 'score', direction: 'descending' })}
        />
        <Button label="Clear sort" size="small" variant="outlined" onClick={() => (sort.value = null)} />
        <Button label="Choose Yuki" size="small" variant="outlined" onClick={() => (chosen.value = 3)} />
        <Button label="Choose nobody" size="small" variant="outlined" onClick={() => (chosen.value = -1)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {line}
      </text>
    </column>
  );
}

/** The data swapped under a chosen row, to a shorter list and to none. */
function ShrinkingTable(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const rows = internalState<readonly Person[]>(TWELVE);
  const chosen = internalState(10);
  const line = combineLatest([rows, chosen]).pipe(
    map(([data, row]) => `${data.length} rows. ${describeChoice(data, row)}`)
  );
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <PersonTable
        label="People"
        columns={COLUMNS}
        rows={rows}
        flexGrow={1}
        minHeight={0}
        selectedRow={chosen}
        onSelect={index => (chosen.value = index)}
      />
      <row gap={6} flexWrap="wrap">
        <Button label="12 rows" size="small" variant="outlined" onClick={() => (rows.value = TWELVE)} />
        <Button label="3 rows" size="small" variant="outlined" onClick={() => (rows.value = people(3))} />
        <Button label="No rows" size="small" variant="outlined" onClick={() => (rows.value = NONE)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {line}
      </text>
    </column>
  );
}

export const dataTableFixture: WorkbenchFixture = {
  id: 'data-table',
  name: 'DataTable',
  source: 'packages/components/src/DataTable.ts',
  states: [
    {
      name: 'Sort and choose',
      try: 'Click Name: an arrow ▲ appears and the rows reorder; again ▼; a third time the arrow goes and the order is back. Choose Ana 2, then sort: she stays highlighted and the line still names her.',
      width: 560,
      height: 360,
      stretch: true,
      render: () => <LiveTable rows={TWELVE} />
    },
    {
      name: 'Keyboard',
      try: 'Click a row, then Down, Up, Page Down, Page Up, Home and End. The highlight moves and is always scrolled into view under the header, never hidden behind it. Enter names the row on the last line.',
      width: 560,
      height: 360,
      stretch: true,
      render: () => <LiveTable rows={people(60)} />
    },
    {
      name: 'No rows',
      try: 'Only the header shows, with no blank or ghost rows under it. Click the table and press Down, Home and End: the line stays at nobody.',
      width: 560,
      height: 240,
      stretch: true,
      render: () => <LiveTable rows={NONE} />
    },
    {
      name: 'One row',
      try: 'Down, Up, Home and End all leave the one row chosen. Sorting by any column keeps it there, and the header does not jump in height.',
      width: 560,
      height: 240,
      stretch: true,
      render: () => <LiveTable rows={ONE} />
    },
    {
      name: '100,000 rows',
      try: 'Drag the scrollbar and fling the wheel hard. The # column always counts up by one with no blank rows, gaps or repeats, and the header stays put. End chooses row 100,000 and shows it. Sorting by Score takes well under a second.',
      width: 560,
      height: 360,
      stretch: true,
      render: () => <LiveTable rows={MANY} />
    },
    {
      name: 'Columns wider than the card',
      try: 'The columns add up to about 960px in a 530px table. Scroll sideways (a trackpad swipe or a sideways wheel): the header and rows move together until Notes is fully in view, and stop there. Under Right to left it opens on its right edge and the same swipe the other way reaches Notes on the left. Nothing is drawn past the rounded border.',
      width: 560,
      height: 320,
      stretch: true,
      render: () => <LiveTable rows={TWELVE} columns={WIDE_COLUMNS} />
    },
    {
      name: 'Long text',
      try: 'The header ellipsises on one line, and its arrow stays on that line when you sort. Names ellipsise; notes wrap and make their rows taller. Scroll: tall rows never overlap their neighbours, and a chosen tall row is highlighted top to bottom.',
      width: 420,
      height: 360,
      stretch: true,
      render: () => <LiveTable rows={people(30)} columns={LONG_COLUMNS} rowHeight={28} />
    },
    {
      name: 'Sortable and not',
      try: 'Team has no sort: clicking its header does nothing and Tab skips it. Tab reaches #, Name and Score, each with a focus ring, and Enter or Space sorts. Score numbers are right-aligned under a right-aligned header.',
      width: 560,
      height: 320,
      stretch: true,
      render: () => <LiveTable rows={TWELVE} defaultSort={{ column: 'score', direction: 'descending' }} />
    },
    {
      name: 'Driven from outside',
      try: 'Each button changes the table with no header press: the arrow appears on Score and goes again, Yuki 4 is highlighted wherever the sort puts her, and Choose nobody clears the highlight. The line agrees every time.',
      width: 560,
      height: 380,
      stretch: true,
      render: () => <DrivenTable />
    },
    {
      name: 'Data shrinks under the choice',
      try: 'Row 10 is chosen. Press 3 rows, then No rows, then 12 rows. No row is ever highlighted that is not there, and the table never shows stale rows from the longer list.',
      width: 560,
      height: 380,
      stretch: true,
      render: () => <ShrinkingTable />
    }
  ]
};
