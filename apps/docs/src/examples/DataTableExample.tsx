import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { fr, percent } from 'gesso-core';
import { DataTable, type DataColumn, type DataTableSort } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/** One row of the table. */
interface Run {
  readonly name: string;
  readonly team: string;
  readonly score: number;
}

/** Twelve rows, which is more than the table is tall. */
const RUNS: readonly Run[] = [
  { name: 'Ravi', team: 'Platform', score: 41 },
  { name: 'Ana', team: 'Design', score: 27 },
  { name: 'Mikael', team: 'Platform', score: 34 },
  { name: 'Yuki', team: 'Research', score: 88 },
  { name: 'Priya', team: 'Design', score: 62 },
  { name: 'Tomas', team: 'Research', score: 19 },
  { name: 'Noor', team: 'Platform', score: 73 },
  { name: 'Elif', team: 'Design', score: 55 },
  { name: 'Sam', team: 'Research', score: 96 },
  { name: 'Ines', team: 'Platform', score: 12 },
  { name: 'Kofi', team: 'Design', score: 48 },
  { name: 'Wei', team: 'Research', score: 80 }
];

/**
 * The columns, declared once at module scope rather than in the call.
 *
 * They are the table's track list, and a track list is not something
 * the rows can be asked to re-agree on between frames. A column with a
 * `compare` sorts; the Team column has none, so its header takes no
 * click, no focus and no keys.
 *
 * No cell names a colour. `color` is inherited, so the text in a
 * chosen row is drawn in the selection foreground without any cell
 * knowing that the row is chosen.
 */
const COLUMNS: readonly DataColumn<Run>[] = [
  {
    key: 'name',
    header: 'Name',
    width: fr(2),
    compare: (a, b) => a.name.localeCompare(b.name),
    cell: run => <text text={run.name} fontSize={13} />
  },
  {
    key: 'team',
    header: 'Team',
    width: fr(1),
    cell: run => <text text={run.team} fontSize={12} />
  },
  {
    key: 'score',
    header: 'Score',
    width: 76,
    align: 'end',
    compare: (a, b) => a.score - b.score,
    cell: run => <text text={String(run.score)} fontSize={13} />
  }
];

/** How a sort reads in the caption under the table. */
function describeSort(sort: DataTableSort | null): string {
  return sort === null ? 'In the order the data came in' : `Sorted by ${sort.column}, ${sort.direction}`;
}

// #region table
/**
 * The table, with its row type named once.
 *
 * `DataTable` is the library's one generic component, and a JSX tag
 * cannot pass a type argument through to the props it checks. An
 * instantiation expression names the type once here, and the tag below
 * is an ordinary component whose `columns`, `rows` and `onSelect` are
 * all typed as `Run`.
 */
const RunTable = DataTable<Run>;

/**
 * A table of twelve rows, sorted and chosen from, with the application
 * owning both.
 *
 * **The sort is controlled.** Pressing a header asks for the next sort
 * in the cycle (ascending, then descending, then none) and the
 * application writes it back, which is why the two buttons below can
 * set and clear the same value with no header press behind them.
 *
 * **The chosen row is controlled too, and it is an index into `rows`
 * rather than a position on screen.** Choose a row, sort the table, and
 * the same person is still chosen: the row moved and the selection did
 * not.
 *
 * The header is sticky, so it stays while the rows scroll under it, and
 * every row shares its column tracks: the table is one grid, and a row
 * is a subgrid of it.
 *
 * Click the table and use the arrows, Page Up and Page Down, Home and
 * End to move the choice; Enter or Space opens it.
 */
export function Runs(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const sort = internalState<DataTableSort | null>(null);
  const chosen = internalState(-1);
  const opened = internalState('nothing yet');

  const caption = combineLatest([sort, chosen]).pipe(
    map(([order, row]) => `${describeSort(order)}. Chosen: ${row < 0 ? 'nobody' : RUNS[row].name}`)
  );

  return (
    <column gap={12} padding={16} width={percent(100)} height={percent(100)}>
      <RunTable
        label="Scores"
        columns={COLUMNS}
        rows={RUNS}
        rowHeight={26}
        columnGap={8}
        height={168}
        sort={sort}
        onSortChange={next => (sort.value = next)}
        selectedRow={chosen}
        onSelect={index => (chosen.value = index)}
        onActivate={index => (opened.value = RUNS[index].name)}
      />
      <row gap={12} y="center">
        <button
          label="Sort by score"
          onClick={() => (sort.value = { column: 'score', direction: 'descending' })}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Sort by score" fontSize={12} color="text" />
        </button>
        <button
          label="Clear sort"
          onClick={() => (sort.value = null)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Clear sort" fontSize={12} color="text" />
        </button>
      </row>
      <text text={caption} fontSize={12} color="textMuted" />
      <text text={opened.pipe(map(name => `Enter opened: ${name}`))} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion table
