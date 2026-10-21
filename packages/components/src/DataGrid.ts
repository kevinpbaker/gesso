import { BehaviorSubject, combineLatest, distinctUntilChanged, map, skip } from 'rxjs';

import { input, themeTokenCell, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Box,
  EditableText,
  LazySheet,
  Row,
  Text,
  borders,
  defineModifier,
  editorFor,
  resolveString,
  type LayoutBox,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiModifier,
  type UiModifierHost,
  type UiNode,
  type UiNodeRef,
  type UiSemanticState,
  type UiTextChangeEvent,
  type UiVirtualSheet
} from 'gesso-core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { CONTROL_EDGE, CONTROL_FOCUS_RING, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { rowCells } from './rowCells';
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
 * cells that happen to be mounted, a cell editor that opens in place,
 * a header that stays while the rows scroll under it, and columns at
 * the start that stay while the rest scroll past them.
 *
 * The data is never handed over. A grid of a hundred thousand rows and
 * fifty columns is five million values, and the only ones it ever asks
 * for are the few hundred in view, through `getValue`. A commit is
 * reported through `onCellChange` and the grid reads the cell again
 * afterwards; data that changes for any other reason says so through
 * `revision`.
 */
export interface DataGridColumn {
  /** Identity: what `getValue`, `onCellChange` and an active cell name. */
  readonly key: string;
  /** The header's text, and the column's accessible name. */
  readonly header: string;
  /**
   * Width in pixels.
   *
   * A number rather than a track, because the window is arithmetic on
   * the widths: a sheet that had to size `fr` tracks from their
   * content would be measuring the very cells it exists not to mount.
   */
  readonly width: number;
  /** Whether a person may change this column's cells. False by default. */
  readonly editable?: boolean;
  /** Where the value sits in its cell, in the header and in every row. */
  readonly align?: 'start' | 'center' | 'end';
  /**
   * How a value is drawn and announced, when the stored string is not
   * it: a number with its separators, an amount with its currency. The
   * editor opens on the stored value, not on this.
   */
  readonly format?: (value: string) => string;
}

/** One cell: the row's index, and the column's `key`. */
export interface DataGridCell {
  readonly row: number;
  readonly column: string;
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
   * A committed edit. The grid reads the cell again straight after, so
   * an application that writes the value back here sees it drawn on
   * the same frame; one that refuses it sees the old value come back.
   */
  onCellChange?: (row: number, column: string, value: string) => void;
  /**
   * Anything that changes when the data does for a reason the grid did
   * not cause: a reload, a sort, another person's edit. Every change
   * reads the cells in view again. It is never read for its value.
   */
  revision?: unknown;
  /** How many columns at the start stay in view while the rest scroll. Read once. */
  frozenColumns?: number;
  /** The active cell, when the application owns it. Supplying it makes it controlled. */
  activeCell?: DataGridCell;
  /** The cell to start on. The first cell when neither prop is given. */
  defaultActiveCell?: DataGridCell;
  /** Called with the cell an arrow, a key or a click moved to. */
  onActiveCellChange?: (cell: DataGridCell) => void;
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

/** What one cell is doing, read off the active cell and the edit. */
type CellMode = 'idle' | 'active' | 'editing';

/** The cell being edited, and what its editor opened on. */
interface Edit {
  readonly row: number;
  readonly column: number;
  readonly text: string;
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

export function DataGrid(inputs: Inputs<DataGridProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Grid');
  const readOnly = input(inputs.readOnly, false);
  const disabled = input(inputs.disabled, false);
  const rowCount = inputs.rowCount;
  const focus = trackFocus(ctx, inputs.ref);
  const tokens = themeTokenCell(controlTokens);

  const columns = inputs.columns.value;
  const columnCount = columns.length;
  const rowHeight = inputs.rowHeight.value ?? 28;
  const headerHeight = inputs.headerHeight.value ?? 32;
  const frozen = Math.min(columnCount, Math.max(0, Math.floor(inputs.frozenColumns.value ?? 0)));
  const widths = columns.map(column => column.width);
  const indexOfColumn = new Map(columns.map((column, index) => [column.key, index]));

  const active = controlled<DataGridCell>({
    component: 'DataGrid',
    name: 'activeCell',
    source: inputs.activeCell,
    initial: inputs.defaultActiveCell,
    fallback: { row: 0, column: columns[0]?.key ?? '' },
    onChange: inputs.onActiveCellChange
  });
  const editing = new BehaviorSubject<Edit | null>(null);
  /** What the open editor holds now, which its own `value` does not follow. */
  let draft = '';

  let sheet: UiVirtualSheet | null = null;
  /** The grid's node, for its scroll offsets and its reading direction. */
  let gridNode: UiNode | null = null;
  const viewport = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const scrollX = new BehaviorSubject(0);
  const scrollY = new BehaviorSubject(0);

  /**
   * Whether the grid reads right to left, as of its last layout.
   *
   * The first rows are built before the grid is in the tree and has a
   * direction to ask, so they are built left to right and built again
   * if the first layout finds otherwise. Two things depend on it: which
   * side a frozen column sticks to, and which edge of the last frozen
   * column the freeze line is drawn on. Keys ask the node directly, at
   * the moment they arrive, as the slider's do.
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
  const keyOf = (row: number, column: number): number => row * columnCount + column;
  const activeKey = active.value.pipe(map(cell => keyOf(cell.row, indexOfColumn.get(cell.column) ?? 0)));
  const editingKey = editing.pipe(map(edit => (edit === null ? null : keyOf(edit.row, edit.column))));

  /**
   * One mode per mounted cell, out of the active cell and the edit.
   *
   * Through `rowCells`, so an arrow key touches the two cells it moved
   * between and no others, however many are on screen. Keyed by the
   * cell's index in the whole grid, row-major, which for a hundred
   * thousand rows of fifty columns is five million and comfortably a
   * number.
   */
  const modeOf = rowCells(
    combineLatest([activeKey, editingKey]),
    ([current, edited], key): CellMode => (edited === key ? 'editing' : current === key ? 'active' : 'idle'),
    {
      initial: 'idle',
      changed: (next, previous) =>
        previous === undefined
          ? undefined
          : [next[0], next[1], previous[0], previous[1]].filter((key): key is number => key !== null),
      label: 'DataGrid.cell'
    }
  );

  // The cells' nodes, by key, so the active one can be the grid's
  // `activeDescendant` and a screen reader reads each cell as the
  // keyboard reaches it while focus stays on the grid.
  const cellNodes = new Map<number, UiNode>();
  const cellsChanged = new BehaviorSubject(0);
  const activeNode = combineLatest([activeKey, cellsChanged]).pipe(
    map(([key]) => cellNodes.get(key) ?? null),
    distinctUntilChanged()
  );

  const canEdit = (column: number): boolean => columns[column]?.editable === true && !readOnly.value && !disabled.value;
  const read = (row: number, column: number): string => {
    const definition = columns[column];
    return definition === undefined ? '' : inputs.getValue.value(row, definition.key);
  };

  /**
   * Scrolls until a cell is clear of the header and the frozen columns.
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
    const nowY = numberProp(gridNode, 'scrollY');
    const top = headerHeight + sheet.rowOffsetOf(row);
    const bottom = top + sheet.rowHeightOf(row);
    if (top < nowY + headerHeight) {
      scrollY.next(Math.max(0, top - headerHeight));
    } else if (bottom > nowY + box.height) {
      scrollY.next(Math.max(0, bottom - box.height));
    }
    // A frozen column is always in view, so revealing one scrolls
    // nothing sideways.
    if (column >= frozen) {
      const sign = readsRtl() ? -1 : 1;
      const along = sign * numberProp(gridNode, 'scrollX');
      const lead = sheet.offsetOf(frozen);
      const start = sheet.offsetOf(column);
      const end = start + sheet.widthOf(column);
      if (start < along + lead) {
        scrollX.next(sign * Math.max(0, start - lead));
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

  const moveTo = (row: number, column: number): void => {
    const rows = rowCount.value;
    if (rows <= 0 || columnCount === 0) {
      return;
    }
    const nextRow = clamp(row, 0, rows - 1);
    const nextColumn = clamp(column, 0, columnCount - 1);
    const current = active.current();
    if (current.row === nextRow && current.column === columns[nextColumn].key) {
      // Already there, which a controlled grid must still be told
      // nothing about; but it may have been scrolled away by hand.
      revealActive();
      return;
    }
    active.change({ row: nextRow, column: columns[nextColumn].key });
  };
  const moveBy = (rows: number, across: number): void => {
    const { row, column } = indexOf(active.current());
    moveTo(row + rows, column + across);
  };
  /** A page is the rows the viewport shows under the header, at least one. */
  const page = (): number => {
    const height = viewport.value.height - headerHeight;
    return height > 0 ? Math.max(1, Math.floor(height / rowHeight)) : 10;
  };

  const startEdit = (text?: string): boolean => {
    const { row, column } = indexOf(active.current());
    if (rowCount.value <= 0 || !canEdit(column)) {
      return false;
    }
    draft = text ?? read(row, column);
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
    const column = columns[edit.column];
    if (commit && column !== undefined && draft !== read(edit.row, edit.column)) {
      inputs.onCellChange.value?.(edit.row, column.key, draft);
      // Read again, which is how the application's answer reaches the
      // screen: written back, the new value; refused, the old one.
      sheet?.invalidate();
    }
    return true;
  };
  /** Closes the editor and gives the keyboard back to the grid. */
  const leaveEdit = (commit: boolean, rows: number, across: number): void => {
    finishEdit(commit);
    moveBy(rows, across);
    focus.focus();
  };

  const clearCell = (): boolean => {
    const { row, column } = indexOf(active.current());
    if (rowCount.value <= 0 || !canEdit(column) || read(row, column) === '') {
      return rowCount.value > 0 && canEdit(column);
    }
    inputs.onCellChange.value?.(row, columns[column].key, '');
    sheet?.invalidate();
    return true;
  };

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
  const across = (by: number) => (): void => moveBy(0, readsRtl() ? -by : by);
  const toCorner =
    (end: boolean) =>
    (event: UiKeyboardEvent): void => {
      const { row } = indexOf(active.current());
      const corner = event.modifiers.ctrl || event.modifiers.meta;
      moveTo(corner ? (end ? rowCount.value - 1 : 0) : row, end ? columnCount - 1 : 0);
    };

  const gridKeys: GridKeymap = {
    ArrowDown: () => moveBy(1, 0),
    ArrowUp: () => moveBy(-1, 0),
    // Left and Right follow the reading direction: Right is toward the
    // end of the row left to right, and toward its start right to left.
    ArrowRight: across(1),
    ArrowLeft: across(-1),
    PageDown: () => moveBy(page(), 0),
    PageUp: () => moveBy(-page(), 0),
    Home: toCorner(false),
    End: toCorner(true),
    Tab: tab,
    Enter: () => startEdit(),
    F2: () => startEdit(),
    Delete: clearCell,
    Backspace: clearCell
  };

  const onGridKey = (event: UiKeyboardEvent): void => {
    // The editor's keys bubble through here on their way up. Its caret
    // owns the arrows, Home and End while it is open; the keys that
    // close it are handled on the editor itself.
    if (editing.value !== null || disabled.value) {
      return;
    }
    const handler = gridKeys[event.key];
    let consumed: boolean;
    if (handler !== undefined) {
      consumed = handler(event) !== false;
    } else if (isCharacter(event)) {
      // Typing over a cell replaces it, as in every spreadsheet: the
      // editor opens on the character rather than on the old value.
      consumed = startEdit(event.key);
    } else {
      consumed = false;
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

  const choose = (row: number, column: number): void => {
    // The hit tester already skips a disabled grid's cells; this is for
    // a click delivered to one by node, as a test or an automation does.
    if (disabled.value) {
      return;
    }
    const edit = editing.value;
    if (edit !== null && edit.row === row && edit.column === column) {
      // A click inside the open editor places its caret; it is not a
      // click on the cell.
      return;
    }
    finishEdit(true);
    moveTo(row, column);
    focus.focus();
  };

  // Whatever moved the active cell, a key, a click or the application,
  // it is scrolled into view.
  const followActive = active.value.subscribe(() => revealActive());
  // A new `revision`, or a new `getValue`, is new data under the same
  // cells, which the window cannot know without being told.
  const followData = combineLatest([inputs.revision, inputs.getValue, readOnly, disabled])
    .pipe(skip(1))
    .subscribe(() => sheet?.invalidate());
  ctx.onUnmount(() => {
    followActive.unsubscribe();
    followData.unsubscribe();
  });

  const onLayout = (node: UiNode, box: LayoutBox | null): void => {
    gridNode = node;
    const nowRtl = resolveString(node, 'textDirection') === 'rtl';
    if (nowRtl !== rtl) {
      rtl = nowRtl;
      // Frozen columns stick to the other side now. `onLayout` may
      // change layout; the runtime lays out again before it paints.
      if (frozen > 0) {
        sheet?.invalidate();
      }
    }
    if (box !== null && (box.width !== viewport.value.width || box.height !== viewport.value.height)) {
      viewport.next(box);
    }
    if (pendingReveal) {
      revealActive();
    }
  };

  const textColor = disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : 'controlForeground')));

  /** The sticky inset that holds a frozen column, on the side the row starts from. */
  const frozenAt = (column: number): Record<string, unknown> => {
    const inset = sheet?.offsetOf(column) ?? offsetIn(widths, column);
    return rtl
      ? { position: 'sticky', right: inset, zIndex: 1, backgroundColor: 'controlBackground' }
      : { position: 'sticky', left: inset, zIndex: 1, backgroundColor: 'controlBackground' };
  };
  const linesOf = (column: number): UiModifier =>
    column === frozen - 1 ? (rtl ? FREEZE_LINE_RTL : FREEZE_LINE) : GRID_LINE;

  const cell = (row: number, column: number): UiElement => {
    const definition = columns[column];
    const key = keyOf(row, column);
    const mode = modeOf(key);
    let mine: UiNode | null = null;
    const editable = canEdit(column);
    const stored = read(row, column);
    const shown = definition.format === undefined ? stored : definition.format(stored);
    const text = Text({
      text: shown,
      color: textColor,
      fontSize: 13,
      maxLines: 1,
      textWrap: 'none',
      textOverflow: 'ellipsis',
      selectable: false
    });
    const lit = mode.pipe(
      map(current => current !== 'idle'),
      distinctUntilChanged()
    );
    const content = mode.pipe(
      map(current => current === 'editing'),
      distinctUntilChanged(),
      map(open => [open ? editor(row, column) : text])
    );
    return Box(
      {
        key: String(column),
        ref: (node: UiNode | null) => {
          // A row read again builds this cell anew, and the new node
          // may be handed over before the old one is let go, so the
          // old one's release must not take the new one's entry.
          if (node !== null) {
            mine = node;
            cellNodes.set(key, node);
          } else if (mine !== null && cellNodes.get(key) === mine) {
            cellNodes.delete(key);
          }
          cellsChanged.next(cellsChanged.value + 1);
        },
        role: 'gridcell',
        label: shown,
        states: lit.pipe(map(on => statesOf(on, !editable))),
        width: definition.width,
        height: rowHeight,
        flexShrink: 0,
        paddingLeft: 8,
        paddingRight: 8,
        x: definition.align ?? 'start',
        y: 'center',
        // The active cell is outlined rather than filled, as in a
        // spreadsheet: the value under it stays in its own colours.
        // `borderWidth` is paint-only, so the outline moves nothing.
        borderWidth: lit.pipe(map(on => (on ? 2 : 0))),
        borderColor: 'controlAccent',
        modifiers: [linesOf(column)],
        onClick: () => choose(row, column),
        onDoubleClick: () => {
          choose(row, column);
          startEdit();
        },
        ...(column < frozen ? frozenAt(column) : {})
      },
      content
    );
  };

  const editor = (row: number, column: number): UiElement => {
    const definition = columns[column];
    const edit = editing.value;
    return EditableText({
      key: 'editor',
      value: edit !== null && edit.row === row && edit.column === column ? edit.text : read(row, column),
      label: definition.header,
      modifiers: [EDIT_IN_PLACE],
      width: Math.max(0, definition.width - 16),
      textWrap: 'none',
      fontSize: 13,
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

  const headerCell = (column: number): UiElement => {
    const definition = columns[column];
    return Box(
      {
        key: String(column),
        role: 'columnheader',
        label: definition.header,
        width: definition.width,
        height: headerHeight,
        flexShrink: 0,
        paddingLeft: 8,
        paddingRight: 8,
        x: definition.align ?? 'start',
        y: 'center',
        backgroundColor: 'surface',
        modifiers: [linesOf(column)],
        ...(column < frozen ? { ...frozenAt(column), backgroundColor: 'surface' } : {})
      },
      Text({
        text: definition.header,
        color: textColor,
        fontWeight: 600,
        fontSize: 12,
        maxLines: 1,
        textWrap: 'none',
        textOverflow: 'ellipsis',
        selectable: false
      })
    );
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
      modifiers: modifiersOf(inputs, gridLayout(onLayout), tokens.modifier, CONTROL_FOCUS_RING, CONTROL_EDGE),
      rowCount,
      columnCount,
      rowHeight,
      columnWidth: widths,
      headerHeight,
      frozenColumns: frozen,
      header: (first, last) =>
        Row(
          {
            // Sticky, so it stays while the rows scroll under it, and
            // above them in paint order: it is the first child, and
            // without a zIndex every row would be drawn over it.
            position: 'sticky',
            top: 0,
            zIndex: 2,
            role: 'row',
            label: 'Column headers',
            backgroundColor: 'surface'
          },
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
      backgroundColor: 'controlBackground',
      // The border is `CONTROL_EDGE` rather than a `borderWidth`: the
      // sticky header's own background would be painted over it.
      borderRadius: tokens.select(t => t.radius.scroller)
    },
    (row, first, last) =>
      Row(
        // Where the row sits in the whole grid, not among the dozens
        // mounted: row 4,213 of 100,000 says so.
        { role: 'row', posInSet: row + 1, setSize: rowCount },
        ...columnsIn(first, last).map(column => cell(row, column))
      )
  );
}

/**
 * Hands the grid its node and its laid-out box after every layout.
 *
 * `measureFlow` alone reports only a change of size, and the reading
 * direction can be learned only from a node that is in the tree, which
 * is first true here. A modifier per grid rather than a shared one,
 * because the callback is the grid's own; the grid renders once, so it
 * is attached once.
 */
const gridLayoutKind = defineModifier<(node: UiNode, box: LayoutBox | null) => void>({
  name: 'dataGridLayout',
  attach(host: UiModifierHost, report) {
    host.onLayout(() => report(host.node, host.flowBox()));
  }
});
function gridLayout(report: (node: UiNode, box: LayoutBox | null) => void): UiModifier {
  return gridLayoutKind(report);
}

/**
 * Puts the caret at the end of an editor and focuses it, on its first
 * layout.
 *
 * `autoFocus` does the second half and not the first: a fresh editor's
 * caret is at 0, so a person who pressed Enter to edit a value would be
 * typing in front of it, and one who typed a character to replace the
 * cell would have every following character land before the first.
 * Focus waits for the first layout for the reason `autoFocus` gives:
 * before that the node is not in the tree focus traverses.
 */
const EDIT_IN_PLACE: UiModifier = defineModifier<null>({
  name: 'dataGridEditor',
  attach(host: UiModifierHost) {
    let done = false;
    host.onLayout(() => {
      if (done) {
        return;
      }
      done = true;
      const model = editorFor(host.node);
      model.select(model.text.length);
      host.focus({ preventScroll: true });
    });
  }
})(null);

/**
 * The lines between cells: under each, and at the end of each.
 *
 * `right` is the end of a cell left to right and its start right to
 * left, and either way it is the line between a cell and its
 * neighbour, so one set serves both directions. The exception is the
 * line after the last frozen column, which has to be on the side the
 * scrolled columns pass under, or it scrolls away with them.
 */
const GRID_LINE: UiModifier = borders({ bottom: 1, right: 1, color: 'controlBorder' });
const FREEZE_LINE: UiModifier = borders({ bottom: 1, right: 2, color: 'controlBorder' });
const FREEZE_LINE_RTL: UiModifier = borders({ bottom: 1, left: 2, color: 'controlBorder' });

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

/** A key that types a character, rather than a command or a chord. */
function isCharacter(event: UiKeyboardEvent): boolean {
  const { ctrl, meta, alt } = event.modifiers;
  return !ctrl && !meta && !alt && [...event.key].length === 1;
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
