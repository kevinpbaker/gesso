import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';

import { input, themeTokenCell, type ComponentContext, type Inputs } from '@gesso/framework';
import { controlTokens } from './tokens';
import {
  Box,
  Grid,
  Row,
  Text,
  LazyGrid,
  type UiChild,
  type UiElement,
  type UiNodeRef,
  fr,
  type UiTrackSize,
  measure,
  type LayoutBox,
  type UiSemanticState
} from '@gesso/core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_EDGE,
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';
import { stepIndex, virtualList } from './virtual';

/**
 * A table of any length whose rows share their columns with the header.
 *
 * This is the component two engine deferrals were waiting for.
 * `decisions/0010-grid.md` left "a table whose virtualized rows share
 * the header's tracks" to it, and `ROADMAP.md` L5 left an observable
 * count to it — because a table that sorts a hundred thousand rows has
 * to tell its window that what index 5 means has changed. Both landed
 * in the engine: `subgrid: 'columns'` and `LazyGrid` for the first,
 * `count` as an Observable and `revision` for the second.
 *
 * What is left here is a table: a sticky header whose cells sort, rows
 * that say where they sit in the whole set rather than in the fifteen
 * that are mounted, and arrows that walk the data rather than the
 * nodes.
 *
 * It is the library's one generic component, and `createComponent`
 * cannot infer the row type through `Inputs`, so a caller names it:
 * `createComponent(DataTable<Person>, { columns, rows })`.
 */
export interface DataColumn<T> {
  /** Identity, for the sort. */
  readonly key: string;
  /** The header's text, and the column's accessible name. */
  readonly header: string;
  /** The track this column takes. `fr(1)` when omitted. */
  readonly width?: UiTrackSize;
  /** Orders two rows by this column. Required to make it sortable. */
  readonly compare?: (a: T, b: T) => number;
  /** The content of one cell. */
  readonly cell: (row: T, index: number) => UiChild;
  readonly align?: 'start' | 'center' | 'end';
}

export interface DataTableSort {
  readonly column: string;
  readonly direction: 'ascending' | 'descending';
}

export interface DataTableProps<T> extends ControlLayoutProps {
  /** Receives the node that *is* the table, for focus and scrolling. */
  ref?: UiNodeRef;
  /**
   * The columns. Fixed for the life of the table: they are its track
   * list, and a grid's tracks are not something its rows can be asked
   * to re-agree on between frames. Which one is sorted is not fixed.
   */
  columns: readonly DataColumn<T>[];
  /** The rows, in their natural order. Sorting reorders a view of them. */
  rows: readonly T[];
  sort?: DataTableSort | null;
  defaultSort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  /** The chosen row, as its index in `rows` — so it survives a sort. */
  selectedRow?: number;
  defaultSelectedRow?: number;
  onSelect?: (index: number) => void;
  /** Enter or Space on the chosen row. */
  onActivate?: (index: number) => void;
  /** Expected row height, for the rows that have not been measured. */
  rowHeight?: number;
  /** Space between the columns. */
  columnGap?: number;
  label?: string;
}

export function DataTable<T>(inputs: Inputs<DataTableProps<T>>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Table');
  const rowHeight = input(inputs.rowHeight, 28);
  const columnGap = input(inputs.columnGap, 0);
  const focus = trackFocus(ctx, inputs.ref);
  const list = virtualList();
  const tokens = themeTokenCell(controlTokens);
  const headerBox = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  headerBox.subscribe(box => list.setLead(box.height));

  const columns = inputs.columns.value;

  const sort = controlled<DataTableSort | null>({
    component: 'DataTable',
    name: 'sort',
    source: inputs.sort,
    initial: inputs.defaultSort,
    fallback: null,
    onChange: inputs.onSortChange
  });
  const selected = controlled<number>({
    component: 'DataTable',
    name: 'selectedRow',
    source: inputs.selectedRow,
    initial: inputs.defaultSelectedRow,
    fallback: -1,
    onChange: inputs.onSelect
  });

  const count = inputs.rows.pipe(map(rows => rows.length));
  /**
   * Every change of the data or the sort, as one value.
   *
   * The window re-renders its mounted rows when this changes, which is
   * exactly what a sort needs: the rows do not move, the data under
   * them does. It is also what the window's `count` cannot say — a
   * hundred thousand rows sorted are still a hundred thousand rows.
   */
  const revision = combineLatest([inputs.rows, sort.value]);

  // The order is a permutation of the row indices, recomputed only when
  // the rows or the sort actually change: the renderer asks for it once
  // per mounted row, and sorting a hundred thousand rows fifteen times
  // a frame is the obvious way to make this component useless.
  let cached: { rows: readonly T[]; sort: DataTableSort | null; order: number[]; positionOf: number[] } | null = null;
  const view = (): { order: number[]; positionOf: number[] } => {
    const rows = inputs.rows.value;
    const current = sort.current();
    if (cached !== null && cached.rows === rows && sameSort(cached.sort, current)) {
      return cached;
    }
    const order = rows.map((_, index) => index);
    const column = current === null ? undefined : columns.find(candidate => candidate.key === current.column);
    const compare = column?.compare;
    if (current !== null && compare !== undefined) {
      const direction = current.direction === 'ascending' ? 1 : -1;
      order.sort((a, b) => direction * compare(rows[a], rows[b]));
    }
    const positionOf: number[] = Array.from({ length: rows.length }, () => 0);
    order.forEach((rowIndex, position) => (positionOf[rowIndex] = position));
    cached = { rows, sort: current, order, positionOf };
    return cached;
  };

  const choose = (position: number): void => {
    const { order } = view();
    if (position < 0 || position >= order.length) {
      return;
    }
    selected.change(order[position]);
    list.reveal(position);
  };
  const positionOfSelected = (): number => {
    const { positionOf } = view();
    const row = selected.current();
    return row >= 0 && row < positionOf.length ? positionOf[row] : -1;
  };
  const step = (by: number): void => choose(stepIndex(positionOfSelected(), by, inputs.rows.value.length));
  const activate = (): void => {
    const row = selected.current();
    if (row >= 0) {
      inputs.onActivate.value?.(row);
    }
  };

  const toggleSort = (column: DataColumn<T>): void => {
    if (column.compare === undefined) {
      return;
    }
    const current = sort.current();
    if (current === null || current.column !== column.key) {
      sort.change({ column: column.key, direction: 'ascending' });
    } else if (current.direction === 'ascending') {
      sort.change({ column: column.key, direction: 'descending' });
    } else {
      sort.change(null);
    }
  };

  const header = Grid(
    {
      subgrid: 'columns',
      modifiers: [measure(headerBox)],
      // Sticky, so the header stays while the rows scroll under it, and
      // above them in paint order — it is the first child, so without a
      // zIndex the rows would be drawn over it.
      position: 'sticky',
      top: 0,
      zIndex: 1,
      backgroundColor: 'surface',
      role: 'row',
      label: 'Column headers'
    },
    ...columns.map(column => headerCell(column, sort.value, () => toggleSort(column)))
  );

  const row = (position: number): UiElement => {
    const { order } = view();
    const rowIndex = order[position];
    const data = inputs.rows.value[rowIndex];
    const chosen = selected.value.pipe(map(current => current === rowIndex));
    return Grid(
      {
        subgrid: 'columns',
        modifiers: [CONTROL_INTERACTION],
        role: 'row',
        posInSet: position + 1,
        setSize: count,
        states: chosen.pipe(map(on => (on ? (['selected'] as UiSemanticState[]) : []))),
        backgroundColor: chosen.pipe(map(on => (on ? 'selectionBackground' : 'transparent'))),
        color: chosen.pipe(map(on => (on ? 'selectionForeground' : 'controlForeground'))),
        onClick: () => choose(position)
      },
      ...columns.map(column =>
        Box(
          {
            key: column.key,
            role: 'cell',
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 4,
            paddingBottom: 4,
            x: column.align ?? 'start',
            y: 'center'
          },
          data === undefined ? Text({ text: '' }) : column.cell(data, rowIndex)
        )
      )
    );
  };

  return LazyGrid(
    {
      ...layoutOf(inputs),
      ref: node => {
        list.ref(node);
        focus.ref(node);
      },
      windowRef: list.windowRef,
      modifiers: modifiersOf(inputs, list.viewport, tokens.modifier, CONTROL_FOCUS_RING, CONTROL_EDGE),
      scrollY: list.scrollY,
      focusable: true,
      count,
      revision,
      estimatedExtent: rowHeight.value,
      columns: columns.map(column => column.width ?? fr(1)),
      columnGap: columnGap.value,
      header,
      role: 'grid',
      label,
      backgroundColor: 'controlBackground',
      // The border is `CONTROL_EDGE` rather than a `borderWidth`: the
      // sticky header's own background would be painted over it.
      borderRadius: tokens.select(t => t.radius.scroller),
      onKeyDown: keymap({
        ArrowDown: () => step(1),
        ArrowUp: () => step(-1),
        PageDown: () => step(PAGE),
        PageUp: () => step(-PAGE),
        Home: () => choose(0),
        End: () => choose(inputs.rows.value.length - 1),
        Enter: activate,
        ' ': activate
      })
    },
    row
  );
}

/**
 * A header cell.
 *
 * A sortable one is a tab stop of its own and answers to Enter and
 * Space, because sorting a table from the keyboard is not something a
 * roving selection over the rows can express. Which way it is sorted is
 * a `description`: ARIA says it with `aria-sort` and `UiSemantics` has
 * no state for it, so this is the honest place until F6b's mirror
 * decides what to do with one.
 */
function headerCell<T>(column: DataColumn<T>, sort: Observable<DataTableSort | null>, toggle: () => void): UiElement {
  const sortable = column.compare !== undefined;
  const direction = sort.pipe(
    map(current => (current !== null && current.column === column.key ? current.direction : null))
  );
  // A column with no `compare` cannot be sorted, and its cell carries
  // no handlers at all — an `onClick` of undefined is a build error,
  // not a handler that does nothing.
  const sorting = sortable
    ? {
        focusable: true,
        modifiers: [CONTROL_INTERACTION],
        cursor: 'pointer' as const,
        onClick: toggle,
        onKeyDown: keymap({ Enter: toggle, ' ': toggle })
      }
    : {};
  return Box(
    {
      key: column.key,
      role: 'columnheader',
      label: column.header,
      description: direction.pipe(map(value => (value === null ? undefined : `sorted ${value}`))),
      paddingLeft: 8,
      paddingRight: 8,
      paddingTop: 6,
      paddingBottom: 6,
      x: column.align ?? 'start',
      y: 'center',
      ...sorting
    },
    // The label and the arrow are two texts in a row, not one string:
    // a fixed-width column narrower than "Score ▲" wrapped the arrow
    // onto a second line and made the header two rows tall. The label
    // shrinks and ellipsizes; the arrow keeps its width whether or not
    // it is showing, so the header does not jump when a column is
    // sorted.
    Row(
      { gap: 4, y: 'center' },
      Text({
        text: column.header,
        color: 'controlForeground',
        fontWeight: 600,
        fontSize: 12,
        maxLines: 1,
        textWrap: 'none',
        textOverflow: 'ellipsis',
        flexShrink: 1,
        selectable: false
      }),
      Text({
        // The arrow is text, as the checkbox's tick is: a drawn glyph
        // is the Media tier's `Icon`, and this does not wait for it.
        text: direction.pipe(map(value => (value === null ? '' : ARROWS[value]))),
        color: 'controlForeground',
        fontSize: 10,
        width: 9,
        flexShrink: 0,
        selectable: false
      })
    )
  );
}

const ARROWS = { ascending: '▲', descending: '▼' } as const;

function sameSort(a: DataTableSort | null, b: DataTableSort | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.column === b.column && a.direction === b.direction;
}

/** Rows a page key moves by; see `LazyList`. */
const PAGE = 10;
