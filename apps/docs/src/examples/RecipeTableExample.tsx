import { map } from 'rxjs/operators';

import { fr, percent } from '@gesso/core';
import { DataTable, type DataColumn } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region data
/** One request. A hundred thousand of these is the whole screen's data. */
export interface Request {
  readonly id: number;
  readonly route: string;
  readonly status: number;
  readonly ms: number;
}

const ROUTES = [
  'GET /v1/orders',
  'POST /v1/orders',
  'GET /v1/customers',
  'GET /v1/invoices',
  'POST /v1/webhooks',
  'GET /v1/reports'
];
const STATUSES = [200, 200, 200, 201, 304, 404, 500];

/**
 * A deterministic spread over the index.
 *
 * Not `Math.random`: the table is the same on every reload, so the
 * spec beside this file can name the row a sort puts first, and two
 * readers looking at the page see the same screen.
 */
function scramble(index: number): number {
  return Math.imul(index + 1, 2654435761) >>> 0;
}

/**
 * The rows, built once at module scope.
 *
 * A hundred thousand objects is about six megabytes and a few
 * milliseconds, and it is the honest shape of this recipe: the data is
 * in memory and the table sorts it there. Data too large to hold is a
 * query, and `rows` is then the page of it you have.
 */
export const REQUESTS: readonly Request[] = Array.from({ length: 100000 }, (_, index) => {
  const noise = scramble(index);
  return {
    id: index + 1,
    route: ROUTES[noise % ROUTES.length],
    status: STATUSES[(noise >>> 7) % STATUSES.length],
    ms: 4 + ((noise >>> 11) % 996)
  };
});
// #endregion data

// #region columns
/**
 * The columns, declared once at module scope.
 *
 * They are the table's track list, which is fixed for the life of the
 * table, so building them inside the component would be a new array on
 * every render for no gain.
 *
 * Every column has a `compare`, so every header sorts. A column without
 * one is drawn and never sorted, which is the right answer for a column
 * whose order means nothing.
 *
 * No cell names a colour. `color` is inherited, and the row sets it to
 * the selection foreground while it is the chosen row, so a cell that
 * named its own colour would be the one thing on the row that did not
 * change when the row was picked.
 */
const COLUMNS: readonly DataColumn<Request>[] = [
  {
    key: 'id',
    header: '#',
    width: 68,
    align: 'end',
    compare: (a, b) => a.id - b.id,
    cell: request => <text text={request.id.toLocaleString('en-US')} fontSize={12} />
  },
  {
    key: 'route',
    header: 'Route',
    width: fr(1),
    // A plain comparison rather than `localeCompare`: these are ASCII
    // route names, and the sort runs over every row at once.
    compare: (a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0),
    cell: request => <text text={request.route} fontSize={12} />
  },
  {
    key: 'status',
    header: 'Status',
    width: 64,
    align: 'end',
    compare: (a, b) => a.status - b.status,
    cell: request => <text text={String(request.status)} fontSize={12} />
  },
  {
    key: 'ms',
    header: 'Time',
    width: 72,
    align: 'end',
    compare: (a, b) => a.ms - b.ms,
    cell: request => <text text={`${request.ms} ms`} fontSize={12} />
  }
];
// #endregion columns

/** How the chosen request reads under the table. */
function describe(index: number): string {
  if (index < 0) {
    return 'No request chosen. Click a row, or tab to the table and use the arrows.';
  }
  const request = REQUESTS[index];
  return `Request ${request.id.toLocaleString('en-US')}: ${request.route}, ${request.status} in ${request.ms} ms`;
}

// #region table
/**
 * A hundred thousand requests, sorted from the header and picked from
 * with the mouse or the keyboard.
 *
 * `DataTable` is the library's one generic component, and a JSX tag
 * cannot pass a type argument to the props it checks. An instantiation
 * expression names the row type once, and the tag below is an ordinary
 * component whose `columns`, `rows` and `onSelect` are all typed.
 */
const RequestTable = DataTable<Request>;

/**
 * The screen: a table, and the one line of detail that follows it.
 *
 * Three decisions are worth reading off this.
 *
 * **The chosen row is the application's, and it is an index into
 * `rows`.** Sorting reorders a view; it does not move the choice. The
 * detail line reads `REQUESTS[chosen]` and cannot disagree with the
 * highlighted row, because they are the same number.
 *
 * **The sort is the table's own.** Nothing outside the table sets it
 * here, so no sort prop is passed at all: the table starts in the order
 * the requests arrived and owns the cycle from then on. Take `sort` and
 * `onSortChange` instead when something else has to write it, such as a
 * saved view or a link.
 *
 * **`rowHeight` is what the rows actually are, not a guess.** The
 * window places unmeasured rows at the estimate, so a wrong one makes
 * the scrollbar settle visibly as the reader scrolls.
 */
export function Requests(_props: Inputs<{}>, _ctx: ComponentContext) {
  const chosen = internalState(-1);

  return (
    <column gap={10} padding={16} width={percent(100)} height={percent(100)}>
      <text text="100,000 requests" fontSize={12} color="textMuted" />
      <RequestTable
        label="Requests"
        columns={COLUMNS}
        rows={REQUESTS}
        rowHeight={26}
        columnGap={8}
        height={240}
        selectedRow={chosen}
        onSelect={index => (chosen.value = index)}
      />
      <text text={chosen.pipe(map(describe))} fontSize={12} color="textMuted" />
    </column>
  );
}
// #endregion table
