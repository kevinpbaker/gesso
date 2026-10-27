import { BehaviorSubject, combineLatest, distinctUntilChanged, map, skip, type Observable } from 'rxjs';

import { ShellService, TextService, input, themeTokenCell, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Box,
  UiProperties,
  EditableText,
  LazySheet,
  Row,
  Text,
  borderShapes,
  borders,
  decorated,
  defineModifier,
  editorFor,
  resolveProperty,
  resolveString,
  type DecorationShape,
  type LayoutBox,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiModifier,
  type UiModifierHost,
  type UiNode,
  type UiNodeRef,
  type UiPasteEvent,
  type UiPointerEvent,
  type UiSemanticState,
  type UiTextChangeEvent,
  type UiVirtualSheet
} from 'gesso-core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  columnLetters,
  createFormulaEvaluator,
  formatFormulaValue,
  isFormulaError,
  type FormulaEvaluator
} from './formula';
import { CONTROL_EDGE, CONTROL_FOCUS_RING, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { controlTokens } from './tokens';

/**
 * An editable grid of any size, windowed on both axes.
 *
 * `DataTable` is rows of records, each row measured, one axis
 * windowed; this is the other shape, a spreadsheet: every row the same
 * height and every column a width the caller states, so the window on
 * each axis is arithmetic on the scroll offset and nothing is measured
 * at all. That is `LazySheet`, which existed in the engine with nothing
 * in the library using it; this is the component that does.
 *
 * What it adds to the sheet is a grid a person can work in: one active
 * cell that the keyboard walks across the whole data rather than the
 * cells that happen to be mounted, a range of cells selected from it,
 * a cell editor that opens in place, copy and paste as tab-separated
 * text, a header that stays while the rows scroll under it, rows at the
 * top and columns at the start that stay while the rest scroll past
 * them, a column of row headers, columns a person can resize, and, when
 * asked for, formulas worked out from the other cells.
 *
 * The data is never handed over. A grid of a hundred thousand rows and
 * fifty columns is five million values, and the only ones it ever asks
 * for are the few hundred in view, through `getValue`. A commit is
 * reported through `onCellChange` and the grid reads that cell again
 * afterwards; data that changes for any other reason says so through
 * `revision`.
 */
export interface DataGridColumn {
  /** Identity: what `getValue`, `onCellChange` and an active cell name. */
  readonly key: string;
  /** The header's text, and the column's accessible name. */
  readonly header: string;
  /**
   * Width in pixels: where the column starts, when the widths are the
   * grid's to keep, or what it falls back to when `columnWidths` leaves
   * it out.
   *
   * A number rather than a track, because the window is arithmetic on
   * the widths: a sheet that had to size `fr` tracks from their
   * content would be measuring the very cells it exists not to mount.
   */
  readonly width: number;
  /** The narrowest a person can make the column. 40 by default. */
  readonly minWidth?: number;
  /** Whether a person may resize the column. True by default. */
  readonly resizable?: boolean;
  /** Whether a person may change this column's cells. False by default. */
  readonly editable?: boolean;
  /** Where the value sits in its cell, in the header and in every row. */
  readonly align?: 'start' | 'center' | 'end';
  /**
   * How a value is drawn and announced, when the stored string is not
   * it: a number with its separators, an amount with its currency. The
   * editor opens on the stored value, not on this, and a copy takes the
   * stored value too.
   */
  readonly format?: (value: string) => string;
}

/** One cell: the row's index, and the column's `key`. */
export interface DataGridCell {
  readonly row: number;
  readonly column: string;
}

/**
 * A rectangle of cells, named by two opposite corners.
 *
 * `from` is the corner the range grew from, which is the active cell
 * whenever a key or the pointer made it, and `to` is the corner that
 * Shift+arrows and a drag move. Either may be above or to the right of
 * the other; the rectangle is the same.
 */
export interface DataGridRange {
  readonly from: DataGridCell;
  readonly to: DataGridCell;
}

export interface DataGridProps extends ControlLayoutProps {
  /** Receives the node that *is* the grid, for focus and scrolling. */
  ref?: UiNodeRef;
  /**
   * The columns. Read once, when the grid is built: their widths are
   * the sheet's geometry, which every mounted row is laid out against.
   */
  columns: readonly DataGridColumn[];
  /** How many rows there are. Bound, so the data may grow and shrink. */
  rowCount: number;
  /**
   * The stored value of one cell.
   *
   * Asked only for the cells in view, and again for each of them when
   * the grid is told its data changed. It must be cheap, because a
   * scroll asks it once for every cell that comes into view.
   */
  getValue: (row: number, column: string) => string;
  /**
   * A changed cell: an edit committed, a cell cleared, or one value of
   * a paste. The grid reads that cell again straight after, so an
   * application that writes the value back here sees it drawn on the
   * same frame; one that refuses it sees the old value come back. Other
   * cells that depend on it are the application's to announce, with
   * `revision`.
   */
  onCellChange?: (row: number, column: string, value: string) => void;
  /**
   * Anything that changes when the data does for a reason the grid did
   * not cause: a reload, a sort, another person's edit, a total that
   * follows an edited cell. Every change reads the cells in view again.
   * It is never read for its value.
   */
  revision?: unknown;
  /** How many columns at the start stay in view while the rest scroll. Read once. */
  frozenColumns?: number;
  /** How many rows at the top stay below the header while the rest scroll. Read once. */
  frozenRows?: number;
  /**
   * A column of row headers at the start, which stays while the rest
   * scroll: `true` numbers the rows from 1, and a function names each
   * row itself. A click on one selects its row, and a click on the
   * corner above them selects everything. Read once.
   */
  rowHeader?: boolean | ((row: number) => string);
  /** The row header column's width. 48 by default. Read once. */
  rowHeaderWidth?: number;
  /**
   * Column widths by `key`, when the application owns them. Supplying
   * it makes the widths controlled: a resize asks through
   * `onColumnResize` and draws nothing until the record changes. A
   * column the record leaves out keeps its own `width`.
   */
  columnWidths?: Readonly<Record<string, number>>;
  /**
   * Called with a column's new width, in whole pixels, at every step of
   * a drag on its header's edge, on a double click of the edge, and on
   * each Alt+Shift+arrow.
   */
  onColumnResize?: (column: string, width: number) => void;
  /**
   * Work out cells whose value starts with `=` as formulas: A1
   * references by column position and row number, ranges, the usual
   * operators and a short list of functions (see `formula.ts`). The cell
   * shows the result and the editor the formula. Read once.
   */
  formulas?: boolean;
  /** The active cell, when the application owns it. Supplying it makes it controlled. */
  activeCell?: DataGridCell;
  /** The cell to start on. The first cell when neither prop is given. */
  defaultActiveCell?: DataGridCell;
  /** Called with the cell an arrow, a key or a click moved to. */
  onActiveCellChange?: (cell: DataGridCell) => void;
  /**
   * The selected range, when the application owns it. Supplying it
   * makes it controlled. Whatever moves the active cell collapses the
   * range onto it.
   */
  selection?: DataGridRange;
  /** The range to start with. The active cell alone when neither prop is given. */
  defaultSelection?: DataGridRange;
  /** Called with the range Shift, a drag, Ctrl+A, Escape or a paste asked for. */
  onSelectionChange?: (range: DataGridRange) => void;
  /** Every row's height. Read once. */
  rowHeight?: number;
  /** The header row's height. Read once. */
  headerHeight?: number;
  /** No cell may be edited, whatever its column says. */
  readOnly?: boolean;
  /** Takes no focus, no pointer and no key. */
  disabled?: boolean;
  /** The grid's accessible name. */
  label?: string;
}

/** The cell being edited, and what its editor opened on. */
interface Edit {
  readonly row: number;
  readonly column: number;
  readonly text: string;
}

/** A range as indices, normalised so `top <= bottom` and `first <= last`. */
interface Rect {
  readonly top: number;
  readonly bottom: number;
  readonly first: number;
  readonly last: number;
}

/**
 * One mounted cell, kept by the slot its row is mounted in.
 *
 * The sheet mounts its rows in slots that outlive them (`recycleRows`),
 * so a jump that replaces every row in view hands each slot a new row
 * rather than building a new one. A cell here is the element the slot
 * returns for one column, every time, and what it shows is pushed into
 * it through the subjects below: the reconciler finds the same element
 * it built last time and passes over the node without touching it, and
 * only the subjects whose value changed write anything.
 */
interface SlotCell {
  readonly column: number;
  /** The row the cell shows now; -1 while it shows none. */
  row: number;
  node: UiNode | null;
  readonly element: UiElement;
  /** The value as drawn: the text, and the cell's accessible name. */
  readonly shown: BehaviorSubject<string>;
  readonly states: BehaviorSubject<readonly UiSemanticState[]>;
  /** The active cell's outline, which is paint and moves nothing. */
  readonly outline: BehaviorSubject<number>;
  readonly fill: BehaviorSubject<string>;
  /** The text's colour: the danger colour for a formula's error. */
  readonly color: BehaviorSubject<string>;
  /**
   * Whether the value it shows now is a formula's, so a commit
   * anywhere works it out again. Cells holding plain values are not
   * read again for someone else's edit.
   */
  formula: boolean;
  /** The edges of the selected range this cell sits on. */
  readonly edges: BehaviorSubject<readonly DecorationShape[]>;
  /** Whether the editor is open in this cell. */
  readonly open: BehaviorSubject<boolean>;
}

/**
 * The keys this binds, as data.
 *
 * Not `keymap` from the internals, for one reason: a handler here can
 * decline. Tab past the end of a row, a character typed at a read-only
 * cell and Enter on one are left for whatever listens above, so
 * focus can leave the grid by Tab and an application's own shortcuts
 * still reach it. A handler that returns `false` declines; anything
 * else consumes the key.
 */
type GridKeymap = Readonly<Record<string, (event: UiKeyboardEvent) => boolean | void>>;

/** One mounted row header, kept by its slot like a row's cells. */
interface GutterCell {
  row: number;
  readonly element: UiElement;
  readonly shown: BehaviorSubject<string>;
  readonly fill: BehaviorSubject<string>;
}

/** The padding either side of a cell's text, which a fitted column leaves room for. */
const CELL_PADDING = 8;
/** How far Alt+Shift and an arrow resizes a column. */
const RESIZE_STEP = 10;
/** The grip at a header's end edge, wide enough to find with a mouse. */
const EDGE_GRIP = 6;

/** An editable grid of any size, windowed on both axes. */
export function DataGrid(inputs: Inputs<DataGridProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Grid');
  const readOnly = input(inputs.readOnly, false);
  const disabled = input(inputs.disabled, false);
  const rowCount = inputs.rowCount;
  const focus = trackFocus(ctx, inputs.ref);
  const tokens = themeTokenCell(controlTokens);
  const shell = ctx.inject(ShellService);
  const measure = ctx.inject(TextService);

  const columns = inputs.columns.value;
  const columnCount = columns.length;
  const rowHeight = inputs.rowHeight.value ?? 28;
  const headerHeight = inputs.headerHeight.value ?? 32;
  const frozen = Math.min(columnCount, Math.max(0, Math.floor(inputs.frozenColumns.value ?? 0)));
  const frozenRows = Math.max(0, Math.floor(inputs.frozenRows.value ?? 0));
  const indexOfColumn = new Map(columns.map((column, index) => [column.key, index]));
  const rowHeaderInput = inputs.rowHeader.value;
  /** The row header column's width, which the sheet calls its gutter; 0 when there is none. */
  const gutter =
    rowHeaderInput === undefined || rowHeaderInput === false ? 0 : Math.max(0, inputs.rowHeaderWidth.value ?? 48);
  const rowLabel: (row: number) => string =
    typeof rowHeaderInput === 'function' ? rowHeaderInput : row => String(row + 1);
  /** A cell's column among all the grid's columns, for `columnIndex`, which counts the row headers. */
  const columnBase = gutter > 0 ? 2 : 1;

  // ---------------------------------------------------------------------------
  // Column widths
  // ---------------------------------------------------------------------------

  /**
   * Whether the application owns the widths.
   *
   * Decided once, as `controlled` decides it: a grid whose widths were
   * the application's and then became its own would have nobody to ask
   * which of the two to draw.
   */
  const widthsControlled = inputs.columnWidths.value !== undefined;
  const widthsFrom = (record: Readonly<Record<string, number>> | undefined): number[] =>
    columns.map(column => {
      const width = record?.[column.key];
      return typeof width === 'number' && Number.isFinite(width) && width >= 0 ? width : column.width;
    });
  /**
   * The widths drawn now.
   *
   * Every cell takes its width from a subject per column rather than
   * from its column's definition, so a resize writes one property on
   * each mounted cell of that column and builds nothing. The sheet is
   * handed the array whole, because its window is a prefix sum over it.
   */
  const widths = widthsFrom(inputs.columnWidths.value);
  const widthSubjects = widths.map(width => new BehaviorSubject(width));
  /** Where each frozen column is held, past the row headers and the frozen columns before it. */
  const insets = widths.map((_, column) => new BehaviorSubject(gutter + offsetIn(widths, column)));
  const minWidthOf = (column: number): number => Math.max(1, columns[column]?.minWidth ?? 40);
  const canResize = (column: number): boolean =>
    columns[column] !== undefined && columns[column].resizable !== false && !disabled.value;

  const active = controlled<DataGridCell>({
    component: 'DataGrid',
    name: 'activeCell',
    source: inputs.activeCell,
    initial: inputs.defaultActiveCell,
    fallback: { row: 0, column: columns[0]?.key ?? '' },
    onChange: inputs.onActiveCellChange
  });
  const start = active.current();
  const selection = controlled<DataGridRange>({
    component: 'DataGrid',
    name: 'selection',
    source: inputs.selection,
    initial: inputs.defaultSelection,
    fallback: { from: start, to: start },
    onChange: inputs.onSelectionChange
  });
  const editing = new BehaviorSubject<Edit | null>(null);
  /** What the open editor holds now, which its own `value` does not follow. */
  let draft = '';
  /**
   * What the editor shows before it has the keyboard.
   *
   * The editor appears on the frame after the key that opened it, and
   * takes focus on its first layout. Keys typed in between still reach
   * the grid, and are written here, so the editor opens on all of them
   * in order rather than on the first alone.
   */
  const editorText = new BehaviorSubject('');
  /** Whether the open editor has taken the keyboard yet. */
  let editorFocused = false;

  let sheet: UiVirtualSheet | null = null;
  /** The grid's node, for its scroll offsets and its reading direction. */
  let gridNode: UiNode | null = null;
  const viewport = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  /** Where the grid is seen on the canvas, for turning a pointer into a cell. */
  let seen: LayoutBox | null = null;
  const scrollX = new BehaviorSubject(0);
  const scrollY = new BehaviorSubject(0);

  /**
   * Whether the grid reads right to left, as of its last layout.
   *
   * The first rows are built before the grid is in the tree and has a
   * direction to ask, so they are built left to right and built again
   * if the first layout finds otherwise. Three things depend on it:
   * which side a frozen column sticks to, which edge of the last frozen
   * column the freeze line is drawn on, and which side of a range is
   * its start. Keys ask the node directly, at the moment they arrive,
   * as the slider's do.
   */
  let rtl = false;
  const readsRtl = (): boolean => {
    const node = gridNode ?? focus.node();
    return node !== null && resolveString(node, 'textDirection') === 'rtl';
  };

  const indexOf = (cell: DataGridCell): { row: number; column: number } => ({
    row: cell.row,
    column: indexOfColumn.get(cell.column) ?? 0
  });
  const cellAt = (row: number, column: number): DataGridCell => ({ row, column: columns[column].key });
  const keyOf = (row: number, column: number): number => row * columnCount + column;
  const activeKey = active.value.pipe(map(cell => keyOf(cell.row, indexOfColumn.get(cell.column) ?? 0)));
  const rectOf = (range: DataGridRange): Rect => {
    const a = indexOf(range.from);
    const b = indexOf(range.to);
    return {
      top: Math.min(a.row, b.row),
      bottom: Math.max(a.row, b.row),
      first: Math.min(a.column, b.column),
      last: Math.max(a.column, b.column)
    };
  };

  const canEdit = (column: number): boolean => columns[column]?.editable === true && !readOnly.value && !disabled.value;
  const read = (row: number, column: number): string => {
    const definition = columns[column];
    return definition === undefined ? '' : inputs.getValue.value(row, definition.key);
  };
  const formatted = (column: number, value: string): string => {
    const format = columns[column].format;
    return format === undefined ? value : format(value);
  };

  /**
   * The formula engine, when the grid has formulas.
   *
   * It reads the same `getValue` the cells do, by column position, and
   * answers `undefined` past the data so a reference there is `#REF!`.
   * It keeps every value it works out until it is told the data
   * changed, which the grid does after each commit, clear and paste and
   * on every `revision`: scrolling changes no data, and a running total
   * down a long column would otherwise be walked from the top on every
   * frame of a scroll.
   */
  const evaluator: FormulaEvaluator | null =
    inputs.formulas.value === true
      ? createFormulaEvaluator((row, column) =>
          row >= 0 && row < rowCount.value && column >= 0 && column < columnCount ? read(row, column) : undefined
        )
      : null;
  const isFormula = (stored: string): boolean => evaluator !== null && stored.startsWith('=');
  /** What a copy takes from a cell: the stored value, or a formula's result as plain text. */
  const copyValue = (row: number, column: number): string => {
    const stored = read(row, column);
    return evaluator !== null && isFormula(stored) ? formatFormulaValue(evaluator.evaluate(row, column)) : stored;
  };

  // ---------------------------------------------------------------------------
  // The mounted cells, and what each of them shows
  // ---------------------------------------------------------------------------

  /** Each slot's cells, by column. A frozen row has no slot and is kept under its negated row. */
  const slots = new Map<number, Map<number, SlotCell>>();
  /**
   * The cell showing each grid position now, by key.
   *
   * Keyed by the cell's index in the whole grid, row-major, which for a
   * hundred thousand rows of fifty columns is five million and
   * comfortably a number. It is what lets the active cell, the editor,
   * a commit and a paste reach the one or two cells they change without
   * looking at the others.
   */
  const mounted = new Map<number, SlotCell>();
  const cellsChanged = new BehaviorSubject(0);
  // The active cell's node, so it can be the grid's `activeDescendant`
  // and a screen reader reads each cell as the keyboard reaches it
  // while focus stays on the grid.
  const activeNode = combineLatest([activeKey, cellsChanged]).pipe(
    map(([key]) => mounted.get(key)?.node ?? null),
    distinctUntilChanged()
  );

  /** What the cells are drawn from, as of the last change to any of it. */
  let activeNow = keyOf(start.row, indexOfColumn.get(start.column) ?? 0);
  let editNow: number | null = null;
  let rectNow: Rect = rectOf(selection.current());
  /** Whether the range is more than one cell, which is when it is drawn. */
  let rangeNow = false;

  const set = <T>(subject: BehaviorSubject<T>, value: T): void => {
    if (subject.value !== value) {
      subject.next(value);
    }
  };

  /** Pushes a cell's state, out of the active cell, the edit and the range. */
  const paint = (cell: SlotCell): void => {
    const { row, column } = cell;
    if (row < 0) {
      return;
    }
    const key = keyOf(row, column);
    const isActive = key === activeNow;
    const open = key === editNow;
    const rect = rectNow;
    const inRange = row >= rect.top && row <= rect.bottom && column >= rect.first && column <= rect.last;
    set(cell.states, statesOf(isActive || inRange, !canEdit(column)));
    set(cell.outline, isActive || open ? 2 : 0);
    // The active cell keeps its own background inside a range, as in a
    // spreadsheet: it is where typing goes, and the outline alone
    // would be lost against the fill.
    set(
      cell.fill,
      rangeNow && inRange && !isActive ? 'selectionBackground' : column < frozen ? 'controlBackground' : 'transparent'
    );
    set(cell.edges, rangeNow && inRange ? edgesOf(rect, row, column, rtl) : NO_EDGES);
    set(cell.open, open);
  };
  /**
   * Reads a cell's value and pushes what it shows.
   *
   * A formula's result goes through the column's `format` like any
   * value, so a total in a money column has its separators; an error is
   * shown by its code, unformatted and in the danger colour, since an
   * amount of `$#REF!` would hide that it is one.
   */
  const refresh = (cell: SlotCell): void => {
    const { row, column } = cell;
    if (row < 0) {
      return;
    }
    const stored = read(row, column);
    let text: string;
    let error = false;
    if (evaluator !== null && isFormula(stored)) {
      cell.formula = true;
      const value = evaluator.evaluate(row, column);
      error = isFormulaError(value);
      text = isFormulaError(value) ? value.error : formatted(column, formatFormulaValue(value));
    } else {
      cell.formula = false;
      text = formatted(column, stored);
    }
    set(cell.shown, text);
    set(cell.color, disabled.value ? 'controlForegroundDisabled' : error ? 'danger' : 'controlForeground');
  };
  /** Reads one cell again, if it is mounted, and nothing else. */
  const refreshAt = (row: number, column: number): void => {
    const cell = mounted.get(keyOf(row, column));
    if (cell !== undefined) {
      refresh(cell);
    }
  };
  const refreshAll = (): void => {
    evaluator?.invalidate();
    for (const cell of mounted.values()) {
      refresh(cell);
      paint(cell);
    }
  };

  /**
   * Works out every formula in view again, after the data changed.
   *
   * Only the cells that showed a formula's result are read again: a
   * plain value cannot have changed because another cell did, and the
   * cell that was written has been read back already.
   */
  const recalculate = (): void => {
    if (evaluator === null) {
      return;
    }
    evaluator.invalidate();
    for (const cell of mounted.values()) {
      if (cell.formula) {
        refresh(cell);
      }
    }
  };

  /** The mounted row headers, by the slot their row is in. */
  const gutters = new Map<number, GutterCell>();
  /** A row header's fill: the selection's, beside a row the range reaches. */
  const paintGutter = (cell: GutterCell): void => {
    const inRange = cell.row >= rectNow.top && cell.row <= rectNow.bottom;
    set(cell.fill, inRange ? 'selectionBackground' : 'surface');
  };

  /** Points a cell at a row. Returns whether it moved. */
  const show = (cell: SlotCell, row: number): boolean => {
    if (cell.row === row) {
      return false;
    }
    if (cell.row >= 0) {
      const old = keyOf(cell.row, cell.column);
      if (mounted.get(old) === cell) {
        mounted.delete(old);
      }
    }
    cell.row = row;
    mounted.set(keyOf(row, cell.column), cell);
    refresh(cell);
    paint(cell);
    return true;
  };

  // One pass over whatever changed: an arrow key touches the two cells
  // it moved between, however many are on screen, and a range touches
  // the cells in view, which is what drawing one costs anyway.
  const followState = combineLatest([activeKey, editing, selection.value]).subscribe(([key, edit, range]) => {
    const touched = new Set<SlotCell | undefined>();
    const before = { active: activeNow, edit: editNow, range: rangeNow, rect: rectNow };
    activeNow = key;
    editNow = edit === null ? null : keyOf(edit.row, edit.column);
    rectNow = rectOf(range);
    rangeNow = rectNow.top !== rectNow.bottom || rectNow.first !== rectNow.last;
    if (before.range || rangeNow) {
      for (const cell of mounted.values()) {
        touched.add(cell);
      }
    } else {
      touched.add(mounted.get(before.active));
      touched.add(mounted.get(activeNow));
      touched.add(before.edit === null ? undefined : mounted.get(before.edit));
      touched.add(editNow === null ? undefined : mounted.get(editNow));
      // A single-cell range that is not the active cell, as a
      // controlled selection may name, is drawn as selected too.
      touched.add(mounted.get(keyOf(before.rect.top, before.rect.first)));
      touched.add(mounted.get(keyOf(rectNow.top, rectNow.first)));
    }
    for (const cell of touched) {
      if (cell !== undefined) {
        paint(cell);
      }
    }
    // A few dozen at most, and each writes only when its row went in
    // or out of the range.
    for (const cell of gutters.values()) {
      paintGutter(cell);
    }
  });

  // ---------------------------------------------------------------------------
  // Moving, and the range
  // ---------------------------------------------------------------------------

  /** How tall the frozen rows are together, which the scrolled rows start below. */
  const frozenHeight = (): number =>
    frozenRows === 0 ? 0 : (sheet?.rowOffsetOf(frozenRows) ?? Math.min(frozenRows, rowCount.value) * rowHeight);

  /**
   * Scrolls until a cell is clear of the header, the frozen rows, the
   * row headers and the frozen columns.
   *
   * The sheet knows where every row and column starts without mounting
   * them, which is what lets Ctrl+End reach a cell five million cells
   * away. Offsets are measured from the sheet's start, so under right
   * to left, where the horizontal offset runs negative toward the end,
   * the distance is the offset negated and so is what is written back.
   * Returns false when there is no viewport yet to reveal it in.
   */
  const reveal = (row: number, column: number): boolean => {
    const box = viewport.value;
    if (sheet === null || gridNode === null || box.height <= 0) {
      return false;
    }
    // A frozen row or column is always in view, so revealing one
    // scrolls nothing along that axis.
    if (row >= frozenRows) {
      const nowY = numberProp(gridNode, 'scrollY');
      const above = headerHeight + frozenHeight();
      const top = headerHeight + sheet.rowOffsetOf(row);
      const bottom = top + sheet.rowHeightOf(row);
      if (top < nowY + above) {
        scrollY.next(Math.max(0, top - above));
      } else if (bottom > nowY + box.height) {
        scrollY.next(Math.max(0, bottom - box.height));
      }
    }
    if (column >= frozen) {
      // The sheet's column offsets are measured past the row headers,
      // and so is `lead`, which is everything that stays at the start.
      const sign = readsRtl() ? -1 : 1;
      const along = sign * numberProp(gridNode, 'scrollX');
      const lead = sheet.offsetOf(frozen);
      const begin = sheet.offsetOf(column);
      const end = gutter + begin + sheet.widthOf(column);
      if (begin < along + lead) {
        scrollX.next(sign * Math.max(0, begin - lead));
      } else if (end > along + box.width) {
        scrollX.next(sign * Math.max(0, end - box.width));
      }
    }
    return true;
  };
  let pendingReveal = false;
  const revealActive = (): void => {
    const { row, column } = indexOf(active.current());
    pendingReveal = rowCount.value > 0 && !reveal(row, column);
  };

  /** Collapses the range onto the active cell, telling nobody when it already is. */
  const collapse = (): boolean => {
    const cell = active.current();
    const range = selection.current();
    if (sameCell(range.from, cell) && sameCell(range.to, cell)) {
      return false;
    }
    selection.change({ from: cell, to: cell });
    return true;
  };

  const moveTo = (row: number, column: number): void => {
    const rows = rowCount.value;
    if (rows <= 0 || columnCount === 0) {
      return;
    }
    const next = cellAt(clamp(row, 0, rows - 1), clamp(column, 0, columnCount - 1));
    if (sameCell(active.current(), next)) {
      // Already there, which a controlled grid must still be told
      // nothing about; but it may have been scrolled away by hand, or
      // be one corner of a range a plain key now collapses.
      collapse();
      revealActive();
      return;
    }
    active.change(next);
  };
  const moveBy = (rows: number, across: number): void => {
    const { row, column } = indexOf(active.current());
    moveTo(row + rows, column + across);
  };

  /** The corner a Shift key moves: the range's far one, or the active cell when the range did not grow from it. */
  const corner = (): { row: number; column: number } => {
    const range = selection.current();
    return sameCell(range.from, active.current()) ? indexOf(range.to) : indexOf(active.current());
  };
  /** Stretches the range from the active cell to a cell, and reveals it. */
  const extendTo = (row: number, column: number): void => {
    const rows = rowCount.value;
    if (rows <= 0 || columnCount === 0) {
      return;
    }
    const nextRow = clamp(row, 0, rows - 1);
    const nextColumn = clamp(column, 0, columnCount - 1);
    const from = active.current();
    const range = selection.current();
    const to = cellAt(nextRow, nextColumn);
    if (!sameCell(range.from, from) || !sameCell(range.to, to)) {
      selection.change({ from, to });
    }
    reveal(nextRow, nextColumn);
  };
  const extendBy = (rows: number, across: number): void => {
    const { row, column } = corner();
    extendTo(row + rows, column + across);
  };
  /** Ctrl+A, or a click on the corner: every cell, with the active cell where it was. */
  const selectAll = (): boolean => {
    if (rowCount.value <= 0 || columnCount === 0) {
      return false;
    }
    selection.change({ from: cellAt(0, 0), to: cellAt(rowCount.value - 1, columnCount - 1) });
    return true;
  };

  /** The first column wholly in view past whatever stays at the start: where a row selected from its header becomes active. */
  const firstInView = (): number => {
    if (frozen > 0 || sheet === null || gridNode === null) {
      return 0;
    }
    const along = (readsRtl() ? -1 : 1) * numberProp(gridNode, 'scrollX');
    const column = sheet.columnAt(gutter + along);
    return sheet.offsetOf(column) < along ? Math.min(columnCount - 1, column + 1) : column;
  };
  /**
   * A click on a row header: that row, whole, or with Shift every row
   * from the active cell's to it.
   *
   * The active cell moves to the clicked row's first column in view
   * rather than its first column, so the click does not scroll the
   * sheet sideways; the range still runs across every column, so it
   * grew from its first, not from the active cell.
   */
  const selectRows = (row: number, extend: boolean): void => {
    const rows = rowCount.value;
    if (disabled.value || rows <= 0 || columnCount === 0) {
      return;
    }
    finishEdit(true);
    const target = clamp(row, 0, rows - 1);
    const to = cellAt(target, columnCount - 1);
    if (extend) {
      selection.change({ from: cellAt(active.current().row, 0), to });
    } else {
      moveTo(target, firstInView());
      selection.change({ from: cellAt(target, 0), to });
    }
    focus.focus();
  };

  /** A page is the rows the viewport shows under the header and the frozen rows, at least one. */
  const page = (): number => {
    const height = viewport.value.height - headerHeight - frozenHeight();
    return height > 0 ? Math.max(1, Math.floor(height / rowHeight)) : 10;
  };

  // Whatever moved the active cell, a key, a click or the application,
  // it is scrolled into view, and the range collapses onto it.
  const followActive = active.value.subscribe(() => revealActive());
  const collapseOnMove = active.value.pipe(skip(1)).subscribe(() => collapse());

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  const startEdit = (text?: string): boolean => {
    const { row, column } = indexOf(active.current());
    if (rowCount.value <= 0 || !canEdit(column)) {
      return false;
    }
    draft = text ?? read(row, column);
    editorFocused = false;
    editorText.next(draft);
    editing.next({ row, column, text: draft });
    return true;
  };
  /**
   * Closes the editor, reporting what it holds when that changed.
   *
   * Idempotent, because three things can close one editor: the key
   * that commits it, the blur that follows when focus goes back to the
   * grid, and a click elsewhere. The first to arrive wins and the rest
   * find nothing open.
   */
  const finishEdit = (commit: boolean): boolean => {
    const edit = editing.value;
    if (edit === null) {
      return false;
    }
    editing.next(null);
    editorFocused = false;
    if (commit && write(edit.row, edit.column, draft)) {
      recalculate();
    }
    return true;
  };
  /** Closes the editor and gives the keyboard back to the grid. */
  const leaveEdit = (commit: boolean, rows: number, across: number): void => {
    finishEdit(commit);
    moveBy(rows, across);
    focus.focus();
  };

  /**
   * Reports one cell's new value and reads that cell back.
   *
   * Only that cell: reading every cell in view after each edit cost a
   * `getValue` per mounted cell for a change to one, and a paste of a
   * hundred values cost a hundred screens of them. A cell whose value
   * follows from the edited one (a total) is the application's to
   * announce, through `revision`, unless it is a formula: with
   * `formulas` on, the caller works those out again once its writes are
   * done, with `recalculate`.
   */
  const write = (row: number, column: number, value: string): boolean => {
    const definition = columns[column];
    if (definition === undefined || !canEdit(column) || value === read(row, column)) {
      return false;
    }
    inputs.onCellChange.value?.(row, definition.key, value);
    // The engine still holds this cell's old value, and whatever read
    // it; the cell read back below must not be worked out from those.
    evaluator?.invalidate();
    // Read again, which is how the application's answer reaches the
    // screen: written back, the new value; refused, the old one.
    refreshAt(row, column);
    return true;
  };

  /** The columns of the range a person may change, or none. */
  const editableIn = (rect: Rect): number[] => {
    const out: number[] = [];
    for (let column = rect.first; column <= rect.last; column++) {
      if (canEdit(column)) {
        out.push(column);
      }
    }
    return out;
  };
  /** Delete and Backspace: every editable cell in the range, emptied. */
  const clearRange = (): boolean => {
    if (rowCount.value <= 0) {
      return false;
    }
    const rect = rectOf(selection.current());
    const editable = editableIn(rect);
    let wrote = false;
    for (let row = rect.top; row <= rect.bottom; row++) {
      for (const column of editable) {
        wrote = write(row, column, '') || wrote;
      }
    }
    if (wrote) {
      recalculate();
    }
    return editable.length > 0;
  };

  // ---------------------------------------------------------------------------
  // The clipboard
  // ---------------------------------------------------------------------------

  /**
   * The range as tab-separated text, rows by newline, with the stored
   * values, or what a formula comes to.
   *
   * A formula is copied as its result rather than its text. Its
   * references are positions in this grid, and pasted anywhere else (in
   * another application, or two rows down in this one, since nothing
   * here moves a reference along with its cell) they would name other
   * cells and work out to something the person never saw.
   */
  const rangeText = (): string => {
    const rect = rectOf(selection.current());
    const lines: string[] = [];
    for (let row = rect.top; row <= rect.bottom; row++) {
      const fields: string[] = [];
      for (let column = rect.first; column <= rect.last; column++) {
        fields.push(tsvField(copyValue(row, column)));
      }
      lines.push(fields.join('\t'));
    }
    return lines.join('\n');
  };
  /**
   * Ctrl+C: the range, through the shell's clipboard.
   *
   * A render worker has no clipboard; `ShellService` hands the text to
   * whichever host the runtime has. The answer is not waited for: the
   * text is on its way, and a grid has nobody to tell that the browser
   * refused it.
   */
  const copy = (): boolean => {
    if (rowCount.value <= 0 || columnCount === 0) {
      return false;
    }
    void shell.copyText(rangeText());
    return true;
  };
  /** Ctrl+X: a copy, then the editable cells of the range emptied. Read-only cells are copied and kept. */
  const cut = (): boolean => {
    if (!copy()) {
      return false;
    }
    clearRange();
    return true;
  };
  /**
   * A paste: tab-separated text written from the active cell, across
   * and down.
   *
   * Clipped at the grid's edges rather than growing it, since the rows
   * are the application's. A read-only cell under the block keeps its
   * value and the rest are written around it. The range becomes the
   * block that landed, so a person sees where it went.
   */
  const paste = (event: UiPasteEvent): void => {
    if (disabled.value || readOnly.value || editing.value !== null || rowCount.value <= 0 || columnCount === 0) {
      return;
    }
    const block = parseTsv(event.text);
    if (block.length === 0) {
      return;
    }
    event.preventDefault();
    const { row: top, column: first } = indexOf(active.current());
    const bottom = Math.min(rowCount.value - 1, top + block.length - 1);
    let last = first;
    let wrote = false;
    for (let row = top; row <= bottom; row++) {
      const values = block[row - top];
      const end = Math.min(columnCount - 1, first + values.length - 1);
      last = Math.max(last, end);
      for (let column = first; column <= end; column++) {
        wrote = write(row, column, values[column - first]) || wrote;
      }
    }
    if (wrote) {
      recalculate();
    }
    const from = active.current();
    const to = cellAt(bottom, last);
    if (!sameCell(selection.current().from, from) || !sameCell(selection.current().to, to)) {
      selection.change({ from, to });
    }
  };

  // ---------------------------------------------------------------------------
  // Resizing a column
  // ---------------------------------------------------------------------------

  /**
   * Draws a set of widths: every mounted cell of a column that changed,
   * the sheet's window, and where each frozen column is held.
   *
   * The sheet rebuilds its rows, which costs no cells: each row hands
   * back the cells its slot already has, so a drag across a frame
   * writes one width per mounted cell of the column and moves the rest.
   */
  const applyWidths = (next: readonly number[]): void => {
    let changed = false;
    for (let column = 0; column < columnCount; column++) {
      if (next[column] !== widths[column]) {
        widths[column] = next[column];
        widthSubjects[column].next(next[column]);
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    for (let column = 0; column < frozen; column++) {
      set(insets[column], gutter + offsetIn(widths, column));
    }
    sheet?.setColumnWidths(widths);
  };
  /**
   * A resize a person asked for, clamped to the column's minimum and
   * rounded to a whole pixel.
   *
   * An uncontrolled grid draws it and then reports it; a controlled one
   * only reports it, and draws it if the application writes it back.
   */
  const resizeColumn = (column: number, width: number): void => {
    if (!canResize(column)) {
      return;
    }
    const next = Math.max(minWidthOf(column), Math.round(width));
    if (next === widths[column]) {
      return;
    }
    if (!widthsControlled) {
      const all = widths.slice();
      all[column] = next;
      applyWidths(all);
    }
    inputs.onColumnResize.value?.(columns[column].key, next);
  };
  const followWidths = widthsControlled
    ? inputs.columnWidths.pipe(skip(1)).subscribe(record => applyWidths(widthsFrom(record)))
    : null;

  /** The header's title text, by column, for the font a fitted column measures its header in. */
  const headerTitles = new Map<number, UiNode>();
  /**
   * A double click on a header's edge: the column as wide as its widest
   * value in view, or as its header, whichever is wider.
   *
   * Only the values in view, because those are the only ones the grid
   * has; asking `getValue` for a hundred thousand rows to fit one
   * column would cost what the windowing exists to save. The text is
   * measured by the runtime's own measurer, in the font each text node
   * already resolved, so the width is the one layout will give it.
   */
  const fitColumn = (column: number): void => {
    if (!canResize(column) || !measure.ready) {
      return;
    }
    let widest = 0;
    const title = headerTitles.get(column);
    if (title !== undefined) {
      const letters = evaluator !== null ? measure.widthOf(`${columnLetters(column)} `, fontOf(title)) : 0;
      widest = letters + measure.widthOf(columns[column].header, fontOf(title));
    }
    for (const cell of mounted.values()) {
      const text = cell.column === column && !cell.open.value ? textOf(cell.node) : null;
      if (text !== null) {
        widest = Math.max(widest, measure.widthOf(cell.shown.value, fontOf(text)));
      }
    }
    // Both paddings, and the line at the cell's end.
    resizeColumn(column, Math.ceil(widest) + CELL_PADDING * 2 + 1);
  };

  /** A drag on a header's edge: which column, and where the press and the width started. */
  let resizing: { readonly column: number; readonly x: number; readonly width: number } | null = null;
  const pressEdge = (column: number, event: UiPointerEvent): void => {
    // Pressing an edge is not pressing a cell, nor a drag the grid
    // should scroll for.
    event.stopPropagation();
    if (!canResize(column)) {
      return;
    }
    finishEdit(true);
    resizing = { column, x: event.x, width: widths[column] };
    event.preventDefault();
  };
  /**
   * The press is captured by the grip it started on, so its moves keep
   * arriving here wherever the pointer goes. The distance is turned
   * from where the grid is seen into its own pixels, as a cell drag's
   * is, and turned around under right to left, where a column's end
   * edge is its left one and a drag leftward widens it.
   */
  const dragEdge = (event: UiPointerEvent): void => {
    event.stopPropagation();
    if (resizing === null || (event.buttons & 1) === 0) {
      return;
    }
    const box = viewport.value;
    const scale = seen !== null && seen.width > 0 ? box.width / seen.width : 1;
    const moved = (event.x - resizing.x) * scale * (rtl ? -1 : 1);
    resizeColumn(resizing.column, resizing.width + moved);
    event.preventDefault();
  };
  const releaseEdge = (event: UiPointerEvent): void => {
    event.stopPropagation();
    resizing = null;
  };

  // ---------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------

  /**
   * Tab walks across a row and leaves the grid off either end of it.
   *
   * Wrapping to the next row would make Tab a trap in a grid of a
   * hundred thousand rows: the person would have to walk all of them
   * to reach whatever follows. Off the end of a row the key is not
   * consumed, so focus moves on as it would from any control.
   */
  const tab = (event: UiKeyboardEvent): boolean => {
    const back = event.modifiers.shift;
    const { column } = indexOf(active.current());
    const next = column + (back ? -1 : 1);
    if (next < 0 || next >= columnCount) {
      return false;
    }
    moveBy(0, back ? -1 : 1);
    return true;
  };
  /** An arrow or a page key: moves the active cell, or with Shift the range's far corner. */
  const step =
    (rows: () => number, across: () => number) =>
    (event: UiKeyboardEvent): void =>
      event.modifiers.shift ? extendBy(rows(), across()) : moveBy(rows(), across());
  // Left and Right follow the reading direction: Right is toward the
  // end of the row left to right, and toward its start right to left.
  const sideways = (by: number) => (): number => (readsRtl() ? -by : by);
  const none = (): number => 0;
  const toCorner =
    (end: boolean) =>
    (event: UiKeyboardEvent): void => {
      const extend = event.modifiers.shift;
      const { row } = extend ? corner() : indexOf(active.current());
      const atCorner = event.modifiers.ctrl || event.modifiers.meta;
      const toRow = atCorner ? (end ? rowCount.value - 1 : 0) : row;
      const toColumn = end ? columnCount - 1 : 0;
      if (extend) {
        extendTo(toRow, toColumn);
      } else {
        moveTo(toRow, toColumn);
      }
      // Revealing a frozen cell scrolls nothing, since it is always in
      // view, so Home would leave the scrolled columns wherever they
      // were. Going to the start takes them back to their start too, as
      // a spreadsheet with frozen panes does.
      if (!end) {
        scrollX.next(0);
        if (atCorner) {
          scrollY.next(0);
        }
      }
    };

  const gridKeys: GridKeymap = {
    ArrowDown: step(() => 1, none),
    ArrowUp: step(() => -1, none),
    ArrowRight: step(none, sideways(1)),
    ArrowLeft: step(none, sideways(-1)),
    PageDown: step(() => page(), none),
    PageUp: step(() => -page(), none),
    Home: toCorner(false),
    End: toCorner(true),
    Tab: tab,
    Enter: () => startEdit(),
    F2: () => startEdit(),
    Delete: clearRange,
    Backspace: clearRange,
    // A range goes back to the active cell; the active cell alone
    // leaves Escape for a dialog the grid sits in.
    Escape: collapse
  };
  /** Chords with Ctrl, or Cmd on a Mac, by the letter. */
  const chords: GridKeymap = {
    a: selectAll,
    c: copy,
    x: cut
  };

  /**
   * A key that arrived at the grid while an editor it opened is still
   * on its way to the keyboard.
   *
   * The editor is built on the key that opens it and focused on its
   * first layout, a frame later; a person typing "Zoe" over a cell
   * types the "o" and often the "e" in that gap. They are written into
   * what the editor will open on, in order, and the keys that close an
   * editor close this one as they would once it had focus.
   */
  const intoOpening = (event: UiKeyboardEvent): boolean => {
    if (isCharacter(event)) {
      draft += event.key;
      editorText.next(draft);
      return true;
    }
    if (event.key === 'Backspace') {
      draft = [...draft].slice(0, -1).join('');
      editorText.next(draft);
      return true;
    }
    const handler = editorKeys[event.key];
    if (handler !== undefined) {
      handler(event);
      return true;
    }
    return false;
  };

  const onGridKey = (event: UiKeyboardEvent): void => {
    if (disabled.value) {
      return;
    }
    let consumed: boolean;
    if (editing.value !== null) {
      // An editor with the keyboard bubbles its keys through here on
      // their way up. Its caret owns the arrows, Home and End; the keys
      // that close it are handled on the editor itself.
      if (editorFocused) {
        return;
      }
      consumed = intoOpening(event);
    } else if (isResizeKey(event)) {
      // Alt+Shift and an arrow resizes the active cell's column, by
      // the edge the arrow points at: Right pulls the end edge out left
      // to right, and Left does under right to left, where the end is
      // the left side.
      const { column } = indexOf(active.current());
      const wider = (event.key === 'ArrowRight') !== readsRtl();
      consumed = canResize(column);
      resizeColumn(column, widths[column] + (wider ? RESIZE_STEP : -RESIZE_STEP));
    } else if ((event.modifiers.ctrl || event.modifiers.meta) && !event.modifiers.alt && event.key.length === 1) {
      const handler = chords[event.key.toLowerCase()];
      consumed = handler !== undefined && handler(event) !== false;
    } else {
      const handler = gridKeys[event.key];
      if (handler !== undefined) {
        consumed = handler(event) !== false;
      } else if (isCharacter(event)) {
        // Typing over a cell replaces it, as in every spreadsheet: the
        // editor opens on the character rather than on the old value.
        consumed = startEdit(event.key);
      } else {
        consumed = false;
      }
    }
    if (consumed) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const editorKeys: GridKeymap = {
    Enter: () => leaveEdit(true, 1, 0),
    Tab: event => leaveEdit(true, 0, event.modifiers.shift ? -1 : 1),
    Escape: () => leaveEdit(false, 0, 0)
  };
  const onEditorKey = (event: UiKeyboardEvent): void => {
    const handler = editorKeys[event.key];
    if (handler !== undefined) {
      handler(event);
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // ---------------------------------------------------------------------------
  // The pointer
  // ---------------------------------------------------------------------------

  /** Whether a press is being dragged across cells, stretching the range. */
  let dragging = false;
  /**
   * Whether the press that a click is about to follow was already
   * handled on its way down, so the click does not handle it again: a
   * Shift+click would otherwise collapse the range it just made.
   */
  let pressed = false;

  /** A press or a click on a cell: makes it active, or with Shift stretches the range to it. */
  const choose = (row: number, column: number, extend: boolean): void => {
    // The hit tester already skips a disabled grid's cells; this is for
    // a click delivered to one by node, as a test or an automation does.
    if (disabled.value || row < 0) {
      return;
    }
    const edit = editing.value;
    if (edit !== null && edit.row === row && edit.column === column) {
      // A click inside the open editor places its caret; it is not a
      // click on the cell.
      return;
    }
    finishEdit(true);
    if (extend) {
      extendTo(row, column);
    } else {
      moveTo(row, column);
    }
    focus.focus();
  };
  const pressCell = (cell: SlotCell, event: UiPointerEvent): void => {
    const edit = editing.value;
    if (disabled.value || (edit !== null && keyOf(edit.row, edit.column) === keyOf(cell.row, cell.column))) {
      return;
    }
    choose(cell.row, cell.column, event.modifiers.shift);
    pressed = true;
    dragging = true;
  };
  const clickCell = (cell: SlotCell, event: UiPointerEvent): void => {
    if (pressed) {
      pressed = false;
      return;
    }
    choose(cell.row, cell.column, event.modifiers.shift);
  };
  /**
   * A drag across cells stretches the range to the cell under the
   * pointer.
   *
   * The press is captured by the cell it started on, so its moves
   * arrive here from that cell wherever the pointer is, and the cell
   * under it is worked out by the sheet rather than hit-tested: a drag
   * past the edge is heading for cells that are not mounted. Revealing
   * that cell scrolls toward it, a row or a column a move.
   */
  const onPointerMove = (event: UiPointerEvent): void => {
    if (!dragging || sheet === null || seen === null || (event.buttons & 1) === 0) {
      return;
    }
    const box = viewport.value;
    const scaleX = seen.width > 0 ? box.width / seen.width : 1;
    const scaleY = seen.height > 0 ? box.height / seen.height : 1;
    const { row, column } = sheet.cellAt((event.x - seen.x) * scaleX, (event.y - seen.y) * scaleY);
    const { row: atRow, column: atColumn } = corner();
    if (row !== atRow || column !== atColumn) {
      // Moving off the cell the press began on is a drag, and no click
      // follows it.
      pressed = false;
      extendTo(row, column);
    }
    event.preventDefault();
  };
  const onPointerUp = (): void => {
    dragging = false;
  };

  // A new `revision`, or a new `getValue`, is new data under the same
  // cells, which the cells cannot know without being told. A change of
  // `readOnly` or `disabled` changes which of them say read-only.
  // `disabled` also dims every cell's text.
  const followData = combineLatest([inputs.revision, inputs.getValue, readOnly, disabled])
    .pipe(skip(1))
    .subscribe(() => refreshAll());
  // A formula that reads past the last row is `#REF!`, so a change in
  // the row count can change what one comes to.
  const followRows = rowCount.pipe(skip(1)).subscribe(() => recalculate());
  ctx.onUnmount(() => {
    followActive.unsubscribe();
    collapseOnMove.unsubscribe();
    followState.unsubscribe();
    followData.unsubscribe();
    followRows.unsubscribe();
    followWidths?.unsubscribe();
  });

  const onLayout = (node: UiNode, box: LayoutBox | null, where: LayoutBox | null): void => {
    gridNode = node;
    seen = where;
    const nowRtl = resolveString(node, 'textDirection') === 'rtl';
    if (nowRtl !== rtl) {
      rtl = nowRtl;
      // Frozen columns stick to the other side now, and a range's
      // start is its other edge, so every cell is built again; the
      // slots are kept by the sheet, so the nodes are matched by key.
      // `onLayout` may change layout; the runtime lays out again
      // before it paints.
      slots.clear();
      mounted.clear();
      gutters.clear();
      headers.clear();
      sheet?.invalidate();
    }
    if (box !== null && (box.width !== viewport.value.width || box.height !== viewport.value.height)) {
      viewport.next(box);
    }
    if (pendingReveal) {
      revealActive();
    }
  };

  // ---------------------------------------------------------------------------
  // Building
  // ---------------------------------------------------------------------------

  const textColor = disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : 'controlForeground')));

  /**
   * The sticky inset that holds a frozen column, on the side the row
   * starts from: past the row headers and the frozen columns before it,
   * which a resize of one of those moves.
   */
  const frozenAt = (column: number): Record<string, unknown> =>
    rtl
      ? { position: 'sticky', right: insets[column], zIndex: 1 }
      : { position: 'sticky', left: insets[column], zIndex: 1 };
  /** The row headers stay at the very start, under nothing but the header row. */
  const startEdge = (): Record<string, unknown> =>
    rtl ? { position: 'sticky', right: 0, zIndex: 1 } : { position: 'sticky', left: 0, zIndex: 1 };
  /** A cell's lines: heavier under the last frozen row and after the last frozen column. */
  const linesOf = (column: number, under: 1 | 2 = 1): UiModifier =>
    column === frozen - 1 ? gridLines(under, rtl ? 'left' : 'right', 2) : gridLines(under, 'right', 1);
  /** A row header's lines, on the side the cells are. */
  const gutterLines = (under: 1 | 2): UiModifier => gridLines(under, rtl ? 'left' : 'right', 1);

  const editorModifier = editInPlace(() => {
    editorFocused = true;
  });

  /**
   * One cell, built once for its slot and column and shown at whatever
   * row the slot holds. `under` is the line beneath it: heavier in the
   * last frozen row, whose slot never holds another row.
   */
  const buildCell = (column: number, under: 1 | 2): SlotCell => {
    const definition = columns[column];
    const shown = new BehaviorSubject('');
    const open = new BehaviorSubject(false);
    const edges = new BehaviorSubject<readonly DecorationShape[]>(NO_EDGES);
    const states = new BehaviorSubject<readonly UiSemanticState[]>(NONE);
    const outline = new BehaviorSubject(0);
    const fill = new BehaviorSubject(column < frozen ? 'controlBackground' : 'transparent');
    const color = new BehaviorSubject(disabled.value ? 'controlForegroundDisabled' : 'controlForeground');
    const text = Text({
      text: shown,
      color,
      textStyle: 'body',
      maxLines: 1,
      textWrap: 'none',
      textOverflow: 'ellipsis',
      selectable: false
    });
    const cell: SlotCell = {
      column,
      row: -1,
      node: null,
      shown,
      states,
      outline,
      fill,
      color,
      formula: false,
      edges,
      open,
      element: Box(
        {
          key: String(column),
          ref: (node: UiNode | null) => {
            if (node !== null) {
              cell.node = node;
            } else {
              // Its slot left the window, or its column did. Whatever
              // row it showed is no longer mounted here.
              if (cell.row >= 0 && mounted.get(keyOf(cell.row, column)) === cell) {
                mounted.delete(keyOf(cell.row, column));
              }
              cell.node = null;
              cell.row = -1;
            }
            cellsChanged.next(cellsChanged.value + 1);
          },
          role: 'gridcell',
          label: shown,
          states,
          // Its column in the whole grid, which after a sideways scroll
          // is not its place among the cells mounted beside it.
          columnIndex: column + columnBase,
          width: widthSubjects[column],
          height: rowHeight,
          flexShrink: 0,
          paddingLeft: 8,
          paddingRight: 8,
          x: definition.align ?? 'start',
          y: 'center',
          backgroundColor: fill,
          // The active cell is outlined rather than filled, as in a
          // spreadsheet: the value under it stays in its own colours.
          // `borderWidth` is paint-only, so the outline moves nothing.
          borderWidth: outline,
          borderColor: 'controlAccent',
          modifiers: [linesOf(column, under), decorated(edges)],
          onPointerDown: (event: UiPointerEvent) => pressCell(cell, event),
          onClick: (event: UiPointerEvent) => clickCell(cell, event),
          onDoubleClick: () => {
            choose(cell.row, column, false);
            startEdit();
          },
          ...(column < frozen ? frozenAt(column) : {})
        },
        open.pipe(map(editing => [editing ? editor(column) : text]))
      )
    };
    return cell;
  };

  const editor = (column: number): UiElement => {
    const definition = columns[column];
    return EditableText({
      key: 'editor',
      value: editorText,
      label: definition.header,
      modifiers: [editorModifier],
      width: widthSubjects[column].pipe(map(width => Math.max(0, width - CELL_PADDING * 2))),
      textWrap: 'none',
      textStyle: 'body',
      color: 'controlForeground',
      backgroundColor: 'controlBackground',
      onInput: (event: UiTextChangeEvent) => {
        draft = event.value;
      },
      onKeyDown: onEditorKey,
      // Leaving the editor by a click elsewhere keeps what was typed,
      // as a spreadsheet does. A key that already closed it leaves
      // nothing for this to do.
      onBlur: () => {
        finishEdit(true);
      }
    });
  };

  /** Each column's header cell, built once and handed back whenever the header is, so a resize rebuilds none of them. */
  const headers = new Map<number, UiElement>();
  const headerCell = (column: number): UiElement => {
    const built = headers.get(column);
    if (built !== undefined) {
      return built;
    }
    const definition = columns[column];
    const title = Text({
      ref: (node: UiNode | null) => {
        if (node === null) {
          headerTitles.delete(column);
        } else {
          headerTitles.set(column, node);
        }
      },
      text: definition.header,
      color: textColor,
      textStyle: 'label',
      fontWeight: 600,
      maxLines: 1,
      textWrap: 'none',
      textOverflow: 'ellipsis',
      selectable: false,
      flexShrink: 1,
      minWidth: 0
    });
    // With formulas the header says which letter references the
    // column, ahead of its name: a formula is written in letters, and
    // a name alone would leave the person counting columns.
    const letters = evaluator === null ? null : columnLetters(column);
    const content =
      letters === null
        ? title
        : Row(
            { gap: 6, y: 'center', minWidth: 0, flexShrink: 1 },
            Text({
              text: letters,
              color: 'textMuted',
              textStyle: 'label',
              maxLines: 1,
              textWrap: 'none',
              selectable: false,
              flexShrink: 0
            }),
            title
          );
    const resizable = definition.resizable !== false;
    const cell = Box(
      {
        key: String(column),
        role: 'columnheader',
        label: letters === null ? definition.header : `${definition.header}, column ${letters}`,
        columnIndex: column + columnBase,
        width: widthSubjects[column],
        height: headerHeight,
        flexShrink: 0,
        paddingLeft: CELL_PADDING,
        paddingRight: CELL_PADDING,
        x: definition.align ?? 'start',
        y: 'center',
        backgroundColor: 'surface',
        modifiers: [linesOf(column)],
        // Positioned, so the grip below is placed against this cell's
        // edge and not against the header row's; a frozen cell already
        // is, by being sticky.
        ...(column < frozen ? frozenAt(column) : { position: 'relative' })
      },
      content,
      // The grip a drag or a double click resizes the column by: over
      // the header's end edge, where the line between it and the next
      // column is. It is not in the semantics tree; the keyboard has
      // Alt+Shift and the arrows instead.
      ...(resizable
        ? [
            Box({
              key: 'edge',
              position: 'absolute',
              top: 0,
              ...(rtl ? { left: 0 } : { right: 0 }),
              width: EDGE_GRIP,
              height: headerHeight,
              cursor: disabled.pipe(map(off => (off ? 'default' : 'col-resize'))),
              onPointerDown: (event: UiPointerEvent) => pressEdge(column, event),
              onPointerMove: dragEdge,
              onPointerUp: releaseEdge,
              onDoubleClick: () => fitColumn(column)
            })
          ]
        : [])
    );
    headers.set(column, cell);
    return cell;
  };

  /**
   * The cell above the row headers, which selects everything when
   * clicked, as a spreadsheet's corner does. It heads the row header
   * column, so it is that column's `columnheader`.
   */
  const cornerCell = (): UiElement =>
    Box({
      key: 'corner',
      role: 'columnheader',
      label: 'Row',
      columnIndex: 1,
      width: gutter,
      height: headerHeight,
      flexShrink: 0,
      backgroundColor: 'surface',
      modifiers: [gutterLines(1)],
      onClick: () => {
        if (disabled.value) {
          return;
        }
        finishEdit(true);
        selectAll();
        focus.focus();
      },
      ...startEdge()
    });

  /** A row header, built once for its slot and pointed at whatever row the slot holds. */
  const gutterCell = (id: number, row: number, under: 1 | 2): GutterCell => {
    let cell = gutters.get(id);
    if (cell === undefined) {
      const shown = new BehaviorSubject('');
      const fill = new BehaviorSubject('surface');
      const made: GutterCell = {
        row,
        shown,
        fill,
        element: Box(
          {
            key: 'rowheader',
            role: 'rowheader',
            label: shown,
            columnIndex: 1,
            width: gutter,
            height: rowHeight,
            flexShrink: 0,
            paddingLeft: CELL_PADDING,
            paddingRight: CELL_PADDING,
            x: 'end',
            y: 'center',
            backgroundColor: fill,
            modifiers: [gutterLines(under)],
            onClick: (event: UiPointerEvent) => selectRows(made.row, event.modifiers.shift),
            ...startEdge()
          },
          Text({
            text: shown,
            color: 'textMuted',
            textStyle: 'label',
            maxLines: 1,
            textWrap: 'none',
            textOverflow: 'ellipsis',
            selectable: false
          })
        )
      };
      cell = made;
      gutters.set(id, cell);
    }
    cell.row = row;
    set(cell.shown, rowLabel(row));
    paintGutter(cell);
    return cell;
  };

  /** The columns a row holds: the frozen ones, then the window's. */
  const columnsIn = (first: number, last: number): number[] => {
    const out: number[] = [];
    for (let column = 0; column < frozen; column++) {
      out.push(column);
    }
    for (let column = Math.max(first, frozen); column <= last; column++) {
      out.push(column);
    }
    return out;
  };

  /**
   * One row, out of the cells its slot already has.
   *
   * Asked for whenever a row arrives in a slot, and again for every row
   * when the columns in view change. The cells for columns still in
   * view are the same elements as last time, repointed at this row; a
   * column that left is let go and one that arrived is built.
   */
  const renderRow = (row: number, first: number, last: number, slot?: number): UiElement => {
    const id = slot ?? -(row + 1);
    let cells = slots.get(id);
    if (cells === undefined) {
      cells = new Map();
      slots.set(id, cells);
    }
    const wanted = columnsIn(first, last);
    // A column that left the window is let go; its node goes with the
    // row's next reconcile, and its `ref` gives up its place.
    const keep = new Set(wanted);
    for (const column of cells.keys()) {
      if (!keep.has(column)) {
        cells.delete(column);
      }
    }
    // A frozen row has a slot of its own that holds no other row, so
    // the last of them can be built with the heavier line under it.
    const under = row === frozenRows - 1 && slot === undefined ? 2 : 1;
    let moved = false;
    const children = wanted.map(column => {
      let cell = cells.get(column);
      if (cell === undefined) {
        cell = buildCell(column, under);
        cells.set(column, cell);
      }
      moved = show(cell, row) || moved;
      return cell.element;
    });
    if (moved) {
      cellsChanged.next(cellsChanged.value + 1);
    }
    // The sheet takes a gutter as the row's first child.
    if (gutter > 0) {
      children.unshift(gutterCell(id, row, under).element);
    }
    // Where the row sits in the whole grid, not among the dozens
    // mounted: row 4,213 of 100,000 says so. The header row is row 1.
    const place = { role: 'row' as const, rowIndex: row + 2 };
    if (row < frozenRows) {
      // Held below the header, and above the rows that scroll under
      // it, as the header is held above them all.
      return Row(
        {
          ...place,
          position: 'sticky',
          top: headerHeight + (sheet?.rowOffsetOf(row) ?? row * rowHeight),
          zIndex: 2,
          backgroundColor: 'controlBackground'
        },
        ...children
      );
    }
    return Row(place, ...children);
  };

  return LazySheet(
    {
      ...layoutOf(inputs),
      ref: node => {
        gridNode = node;
        focus.ref(node);
      },
      sheetRef: value => {
        sheet = value;
      },
      modifiers: modifiersOf(
        inputs,
        gridLayout(onLayout),
        // The grid's size in the whole data, header row and row
        // headers included, so a screen reader can say "row 4,213 of
        // 100,001" of a grid that mounts thirty rows.
        gridSize({ rows: rowCount.pipe(map(rows => rows + 1)), columns: columnCount + (gutter > 0 ? 1 : 0) }),
        tokens.modifier,
        CONTROL_FOCUS_RING,
        CONTROL_EDGE
      ),
      rowCount,
      columnCount,
      rowHeight,
      columnWidth: widths,
      headerHeight,
      gutterWidth: gutter,
      frozenColumns: frozen,
      frozenRows,
      // A jump keeps the row nodes and repoints their cells: see
      // `SlotCell`.
      recycleRows: true,
      header: (first, last) =>
        Row(
          {
            // Sticky, so it stays while the rows scroll under it, and
            // above them in paint order: it is the first child, and
            // without a zIndex every row would be drawn over it. The
            // frozen rows are held at 2, so it is above those too.
            position: 'sticky',
            top: 0,
            zIndex: 3,
            role: 'row',
            rowIndex: 1,
            label: 'Column headers',
            backgroundColor: 'surface'
          },
          ...(gutter > 0 ? [cornerCell()] : []),
          ...columnsIn(first, last).map(headerCell)
        ),
      scrollX,
      scrollY,
      focusable: disabled.pipe(map(off => !off)),
      disabled,
      role: 'grid',
      label,
      states: readOnly.pipe(map(locked => (locked ? READONLY : NONE))),
      activeDescendant: activeNode,
      onKeyDown: onGridKey,
      onPointerMove,
      onPointerUp,
      onPaste: paste,
      backgroundColor: 'controlBackground',
      // The border is `CONTROL_EDGE` rather than a `borderWidth`: the
      // sticky header's own background would be painted over it.
      borderRadius: tokens.select(t => t.radius.scroller)
    },
    renderRow
  );
}

/**
 * Hands the grid its node and its laid-out box after every layout,
 * with where it is seen on the canvas.
 *
 * `measureFlow` alone reports only a change of size, and the reading
 * direction can be learned only from a node that is in the tree, which
 * is first true here. A modifier per grid rather than a shared one,
 * because the callback is the grid's own; the grid renders once, so it
 * is attached once.
 */
const gridLayoutKind = defineModifier<(node: UiNode, box: LayoutBox | null, seen: LayoutBox | null) => void>({
  name: 'dataGridLayout',
  attach(host: UiModifierHost, report) {
    host.onLayout(() => report(host.node, host.flowBox(), host.layoutBox()));
  }
});
function gridLayout(report: (node: UiNode, box: LayoutBox | null, seen: LayoutBox | null) => void): UiModifier {
  return gridLayoutKind(report);
}

/**
 * Says how many rows and columns the grid has in the whole data.
 *
 * A modifier rather than props because `rowCount` and `columnCount` are
 * also the names of `LazySheet`'s geometry, which it takes for itself
 * and never puts on the node; the semantics properties of the same
 * names have to be set on the node another way.
 */
const gridSize = defineModifier<{ readonly rows: Observable<number>; readonly columns: number }>({
  name: 'dataGridSize',
  attach(host: UiModifierHost, size) {
    host.set('rowCount', size.rows);
    host.set('columnCount', size.columns);
  }
});

/**
 * Puts the caret at the end of an editor and focuses it, on its first
 * layout, then tells the grid it has.
 *
 * `autoFocus` does the second half and not the first: a fresh editor's
 * caret is at 0, so a person who pressed Enter to edit a value would be
 * typing in front of it, and one who typed a character to replace the
 * cell would have every following character land before the first.
 * Focus waits for the first layout for the reason `autoFocus` gives:
 * before that the node is not in the tree focus traverses. Until the
 * grid hears it has, the keys that still reach the grid are the
 * editor's.
 */
const editInPlace = defineModifier<() => void>({
  name: 'dataGridEditor',
  attach(host: UiModifierHost, focused) {
    let done = false;
    host.onLayout(() => {
      if (done) {
        return;
      }
      done = true;
      const model = editorFor(host.node);
      model.select(model.text.length);
      host.focus({ preventScroll: true });
      focused();
    });
  }
});

/**
 * The lines between cells: under each, and at the end of each.
 *
 * `right` is the end of a cell left to right and its start right to
 * left, and either way it is the line between a cell and its
 * neighbour, so one set serves both directions. The exception is the
 * line after the last frozen column, which has to be on the side the
 * scrolled columns pass under, or it scrolls away with them.
 */
const LINES = new Map<string, UiModifier>();
/**
 * The lines a cell draws: one under it, and one on a side, each 1 or 2
 * wide. Built once per combination and shared, since every cell of a
 * kind draws the same ones; 2 is the freeze line, under the last frozen
 * row and after the last frozen column.
 */
function gridLines(under: 1 | 2, side: 'left' | 'right', width: 1 | 2): UiModifier {
  const key = `${under}${side}${width}`;
  let lines = LINES.get(key);
  if (lines === undefined) {
    lines = borders({ bottom: under, [side]: width, color: 'controlBorder' });
    LINES.set(key, lines);
  }
  return lines;
}

const NO_EDGES: readonly DecorationShape[] = [];
/**
 * The outline of a range, one set of edges per combination a cell can
 * sit on, built once: top 1, right 2, bottom 4, left 8.
 *
 * Each cell on the range's border draws its own share of the outline
 * as a decoration, so a range of any size costs no nodes, and a cell
 * that leaves the border hands its node the shared empty list.
 */
const EDGES: readonly (readonly DecorationShape[])[] = Array.from({ length: 16 }, (_, bits) =>
  bits === 0
    ? NO_EDGES
    : borderShapes({
        top: bits & 1 ? 2 : 0,
        right: bits & 2 ? 2 : 0,
        bottom: bits & 4 ? 2 : 0,
        left: bits & 8 ? 2 : 0,
        color: 'selectionForeground'
      })
);

/** The edges of a range a cell inside it draws. The range's start is on the right under right to left. */
function edgesOf(rect: Rect, row: number, column: number, rtl: boolean): readonly DecorationShape[] {
  const atStart = column === rect.first;
  const atEnd = column === rect.last;
  const left = rtl ? atEnd : atStart;
  const right = rtl ? atStart : atEnd;
  return EDGES[(row === rect.top ? 1 : 0) | (right ? 2 : 0) | (row === rect.bottom ? 4 : 0) | (left ? 8 : 0)];
}

const NONE: readonly UiSemanticState[] = [];
const READONLY: readonly UiSemanticState[] = ['readonly'];
const SELECTED: readonly UiSemanticState[] = ['selected'];
const SELECTED_READONLY: readonly UiSemanticState[] = ['readonly', 'selected'];

/** A cell's states, as shared arrays so an unchanged cell writes nothing. */
function statesOf(selected: boolean, locked: boolean): readonly UiSemanticState[] {
  if (selected) {
    return locked ? SELECTED_READONLY : SELECTED;
  }
  return locked ? READONLY : NONE;
}

function sameCell(a: DataGridCell, b: DataGridCell): boolean {
  return a.row === b.row && a.column === b.column;
}

/** Alt+Shift with Left or Right, and nothing else held: a column resize. */
function isResizeKey(event: UiKeyboardEvent): boolean {
  const { ctrl, meta, alt, shift } = event.modifiers;
  return alt && shift && !ctrl && !meta && (event.key === 'ArrowLeft' || event.key === 'ArrowRight');
}

/** The text node a cell draws, under the fragment its content is bound through; null while it has none. */
function textOf(node: UiNode | null): UiNode | null {
  let inner = node?.firstChild ?? null;
  while (inner !== null && inner.firstChild !== null) {
    inner = inner.firstChild;
  }
  return inner;
}

/** The font a text node resolved, as the text measurer takes it. */
function fontOf(node: UiNode): {
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  letterSpacing: number;
} {
  return {
    fontSize: resolveProperty(node, UiProperties.fontSize),
    fontFamily: resolveProperty(node, UiProperties.fontFamily),
    fontWeight: resolveProperty(node, UiProperties.fontWeight),
    letterSpacing: resolveProperty(node, UiProperties.letterSpacing) ?? 0
  };
}

/** A key that types a character, rather than a command or a chord. */
function isCharacter(event: UiKeyboardEvent): boolean {
  const { ctrl, meta, alt } = event.modifiers;
  return !ctrl && !meta && !alt && [...event.key].length === 1;
}

/**
 * One value as a field of tab-separated text.
 *
 * Quoted when it holds a tab, a line break or a quote, with its quotes
 * doubled, which is what a spreadsheet writes and reads back: without
 * it a note with a line break in it would paste as two rows.
 */
function tsvField(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Tab-separated text as rows of values, the way a spreadsheet's copy
 * writes it.
 *
 * Rows end at a line break in any of its three spellings, and a final
 * one ends the last row rather than starting an empty one. A field
 * that starts with a quote runs to the closing quote, tabs and line
 * breaks included, with a doubled quote standing for one; a quote
 * anywhere else is just a character, as in `5" pipe`.
 */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let fresh = true;
  let quoted = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      index++;
      continue;
    }
    if (char === '"' && fresh) {
      quoted = true;
      fresh = false;
    } else if (char === '\t') {
      row.push(field);
      field = '';
      fresh = true;
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fresh = true;
      if (char === '\r' && text[index + 1] === '\n') {
        index++;
      }
    } else {
      field += char;
      fresh = false;
    }
    index++;
  }
  if (!fresh || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function numberProp(node: UiNode, name: string): number {
  const value = node.properties.get(name);
  return typeof value === 'number' ? value : 0;
}

function offsetIn(widths: readonly number[], column: number): number {
  let sum = 0;
  for (let index = 0; index < column; index++) {
    sum += widths[index] ?? 0;
  }
  return sum;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
