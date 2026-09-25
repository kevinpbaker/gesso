import { BehaviorSubject, isObservable } from 'rxjs';

import { UiNodeType } from '../graph/UiNodeType';
import { defineModifier } from '../modifiers/UiModifier';
import type { UiModifierHost } from '../modifiers/UiModifierHost';
import { Box } from './UiComponents';
import { createElement } from './UiFactory';
import type { UiChild, UiElement } from './UiElement';
import type { Reactive, ScrollViewProps } from './UiElementProps';

/**
 * Two-axis windowing, for a surface whose geometry is known rather
 * than measured.
 *
 * `LazyColumn` and `LazyGrid` window one axis and learn the extent of
 * an item by mounting and measuring it, correcting an estimate as the
 * user scrolls. A spreadsheet is the other case: every row is the same
 * height and every column the same width because the sheet says so, so
 * there is nothing to measure and nothing to correct, and the window
 * on each axis is arithmetic on the scroll offset.
 *
 * That difference is why this is its own class rather than a second
 * axis bolted onto `UiVirtualWindow`. Dropping measurement drops the
 * correction table, the scroll anchoring and the per-frame walk that
 * collects extents — none of which a sheet can use — and what is left
 * is small enough to read in one sitting.
 *
 * It also deliberately does **not** use `subgrid: 'columns'`. A lazy
 * grid's rows share tracks with a header because their widths come
 * from their content, and `LayoutEngine.collectSubgridColumns` pays
 * for that by measuring every cell of every mounted row, at unbounded
 * constraints, on every layout. A sheet is told its column widths, so
 * a row is an ordinary `Row` of fixed-width cells and the tracks never
 * have to be sized at all.
 */
export interface SheetViewport {
  /** Horizontal scroll offset of the container. */
  scrollX: number;
  /** Vertical scroll offset of the container. */
  scrollY: number;
  /** Visible width. */
  width: number;
  /** Visible height. */
  height: number;
}

/** The cells the window has mounted, inclusive on both ends. */
export interface SheetRange {
  readonly firstRow: number;
  readonly lastRow: number;
  readonly firstColumn: number;
  readonly lastColumn: number;
}

/**
 * Builds one row, given the columns the window wants in it.
 *
 * It must return a `Row` (or anything that lays its children out
 * horizontally), and exactly one child per column in `[firstColumn,
 * lastColumn]`, each keyed by its **absolute** column index. The
 * window adds the leading spacer and sets the row's own geometry, so
 * the renderer is only ever asked for cells.
 *
 * Keys are absolute rather than positional on purpose: a scroll of one
 * row then reconciles to one row built and one dropped, instead of
 * every mounted cell being rewritten to hold its neighbour's value.
 */
export type SheetRowRenderer = (row: number, firstColumn: number, lastColumn: number) => UiChild;

export interface UiVirtualSheetOptions {
  readonly rowCount: Reactive<number>;
  readonly columnCount: Reactive<number>;
  /** The height every row has unless `rowHeights` says otherwise. */
  readonly rowHeight: number;
  /**
   * The rows that are not the default height, by row index.
   *
   * **Sparse, where `columnWidth` is an array, and the asymmetry is
   * deliberate.** A sheet has a few hundred columns and a width for
   * each of them is a reasonable thing to hand over; it has up to a
   * million rows, and an array that long — rebuilt whenever one row
   * changed — would be the largest allocation in the application, to
   * describe a sheet where every row but two is the same.
   *
   * What actually produces a non-default height is hiding a row
   * (zero), autofitting one, or wrapping text in it. All three are
   * exceptions by nature, and there are tens of them rather than
   * thousands, so the offsets are a multiplication plus a binary
   * search over the exceptions rather than a prefix sum over
   * everything.
   */
  readonly rowHeights?: ReadonlyMap<number, number>;
  /**
   * One width for every column, or a width per column.
   *
   * An array is what makes a column resizable, and it is the reason
   * the offsets below are a prefix sum rather than a multiplication.
   * A sheet of a few hundred columns keeps the sum and searches it;
   * that is two orders of magnitude cheaper than measuring, which is
   * the thing this class exists not to do.
   */
  readonly columnWidth: number | readonly number[];
  /** Rows mounted beyond each edge of the viewport. Default 3. */
  readonly rowOverscan?: Reactive<number>;
  /** Columns mounted beyond each edge of the viewport. Default 2. */
  readonly columnOverscan?: Reactive<number>;
  /**
   * A frozen strip at the start of every row — a sheet's row numbers.
   *
   * The window needs its width because it is content: it shifts every
   * column along by that much and it is part of the scrollable extent.
   * Keeping it *visible* while the sheet scrolls sideways is the
   * renderer's business, with `position: 'sticky'` on whatever the row
   * renderer puts there.
   */
  readonly gutterWidth?: number;
  /** Height of the header row above the rows, when there is one. */
  readonly headerHeight?: number;
  /**
   * Rows and columns kept mounted however far the sheet is scrolled.
   *
   * A frozen pane, and the second thing that cannot be windowed by
   * position alone — `extendRange` is no use here, because widening
   * the window back to row 0 from row 5,000 would mount five thousand
   * rows to show one.
   *
   * What this does is *mount* them and take them out of the scrolled
   * window, so they appear once rather than twice and the spacers
   * account for them. Keeping them **visible** is the renderer's
   * business, with `position: 'sticky'` — exactly as it already is
   * for the header row and the gutter, which are this idea with the
   * count fixed at one.
   *
   * With `frozenColumns` set, a row renderer is asked for the columns
   * in `[0, frozenColumns)` first and then for `[firstColumn,
   * lastColumn]`, and the window puts the leading spacer between the
   * two groups.
   */
  readonly frozenRows?: number;
  readonly frozenColumns?: number;
  /**
   * Widens the window the viewport implies, for things the document
   * says reach outside it.
   *
   * **The one place a sheet's geometry is allowed to depend on its
   * contents.** Everything else here is arithmetic on the scroll
   * offset, which is what makes it cheap; this is the exception, and
   * it exists because two things genuinely cannot be windowed by
   * position alone.
   *
   * A **merged cell** is the case that forced it. A merge spanning
   * C3:E3 is drawn by its anchor, C3, and when the sheet is scrolled
   * so the window begins at column D there is no anchor to draw —
   * the merge silently disappears at the left edge of the screen.
   * Widening the window to include the anchor is the only fix that
   * does not put the document inside this class: the caller knows
   * where its merges are, and returns a range that covers them.
   *
   * Called on every recompute, so it must be cheap — a lookup, not a
   * scan. Returning the range unchanged costs nothing at all. If what
   * it would answer changes without the viewport moving, the caller
   * says so with `invalidate`.
   */
  readonly extendRange?: (range: SheetRange) => SheetRange;
  /** Viewport assumed before the first layout. */
  readonly initialViewport?: { readonly width: number; readonly height: number };
}

/**
 * Builds the row above the rows, for the columns now in the window.
 *
 * Rendered once per column window rather than once per frame, and
 * placed before the leading spacer, so a header that is
 * `position: 'sticky'` with `top: 0` stays put while the rows scroll
 * under it and moves with them when they scroll sideways.
 */
export type SheetHeaderRenderer = (firstColumn: number, lastColumn: number) => UiChild;

/** The sheet sits on its scroll container under this property. */
export const VIRTUAL_SHEET_PROP = 'virtualSheet';

const EMPTY_RANGE: SheetRange = { firstRow: 0, lastRow: -1, firstColumn: 0, lastColumn: -1 };

export class UiVirtualSheet {
  readonly children$ = new BehaviorSubject<UiElement[]>([]);
  /**
   * The range now mounted, for whoever has to fetch the values in it.
   *
   * This is the whole reason the window is reachable from outside: the
   * render thread does not hold the cells, so the range it settles on
   * each frame is what it asks the application thread for. Emits only
   * when the range changes, so binding a command to it does not send
   * one per frame.
   */
  readonly range$ = new BehaviorSubject<SheetRange>(EMPTY_RANGE);

  private rowCount: number;
  private columnCount: number;
  private rowOverscan: number;
  private columnOverscan: number;
  private rowHeight: number;
  private readonly gutterWidth: number;
  private readonly headerHeight: number;
  private frozenRows: number;
  private frozenColumns: number;
  private readonly renderRow: SheetRowRenderer;
  private renderHeader: SheetHeaderRenderer | undefined;
  private readonly extendRange: ((range: SheetRange) => SheetRange) | undefined;

  /** One width per column, or undefined when every column is the same. */
  private widths: number[] | undefined;
  /** `offsets[c]` is where column `c` starts, measured past the gutter. */
  private offsets: number[] = [];
  private uniformWidth = 0;

  /**
   * The rows that are not `rowHeight` tall, in row order.
   *
   * Three parallel arrays rather than a map of objects: this is
   * searched on every hit test and on every frame that scrolls, and
   * the arrays are read in step.
   */
  private exceptionRows: number[] = [];
  private exceptionHeights: number[] = [];
  /** `exceptionStarts[i]` is where `exceptionRows[i]` starts, past the header. */
  private exceptionStarts: number[] = [];

  private range: SheetRange = EMPTY_RANGE;
  private viewport: SheetViewport;
  /** Rows built for the current column range, so a vertical scroll rebuilds one row. */
  private readonly mountedRows = new Map<number, UiElement>();
  /** The frozen rows, kept separately because they never leave. */
  private readonly frozenMounted = new Map<number, UiElement>();
  private mountedHeader: UiElement | undefined;

  constructor(options: UiVirtualSheetOptions, renderRow: SheetRowRenderer, renderHeader?: SheetHeaderRenderer) {
    this.rowCount = typeof options.rowCount === 'number' ? options.rowCount : 0;
    this.columnCount = typeof options.columnCount === 'number' ? options.columnCount : 0;
    this.rowHeight = positive('rowHeight', options.rowHeight);
    this.adoptHeights(options.rowHeights);
    this.gutterWidth = Math.max(0, options.gutterWidth ?? 0);
    this.headerHeight = Math.max(0, options.headerHeight ?? 0);
    this.frozenRows = Math.max(0, Math.floor(options.frozenRows ?? 0));
    this.frozenColumns = Math.max(0, Math.floor(options.frozenColumns ?? 0));
    this.rowOverscan = typeof options.rowOverscan === 'number' ? options.rowOverscan : 3;
    this.columnOverscan = typeof options.columnOverscan === 'number' ? options.columnOverscan : 2;
    this.renderRow = renderRow;
    this.renderHeader = renderHeader;
    this.extendRange = options.extendRange;
    this.adoptWidths(options.columnWidth);
    this.viewport = {
      scrollX: 0,
      scrollY: 0,
      width: options.initialViewport?.width ?? 800,
      height: options.initialViewport?.height ?? 600
    };
    this.recompute();
  }

  /**
   * New column widths, as a drag on a header edge produces.
   *
   * The prefix sum is rebuilt whole. It is one pass over the columns
   * and it happens once per frame of a drag at most, against a
   * per-column offset that would otherwise have to be corrected
   * everywhere downstream of the column that moved.
   */
  setColumnWidths(widths: number | readonly number[]): void {
    this.adoptWidths(widths);
    this.invalidate();
  }

  private adoptWidths(widths: number | readonly number[]): void {
    if (typeof widths === 'number') {
      this.uniformWidth = positive('columnWidth', widths);
      this.widths = undefined;
      this.offsets = [];
      return;
    }
    const owned = widths.slice();
    for (const width of owned) {
      if (!(width >= 0)) {
        throw new Error(`LazySheet column widths must not be negative, got ${String(width)}.`);
      }
    }
    this.widths = owned;
    this.offsets = Array.from({ length: owned.length + 1 });
    let running = 0;
    for (let column = 0; column < owned.length; column++) {
      this.offsets[column] = running;
      running += owned[column];
    }
    this.offsets[owned.length] = running;
  }

  /**
   * New row heights, as hiding a row or autofitting one produces.
   *
   * The exceptions are rebuilt whole, which is one pass over *them*
   * and not over the rows — the whole reason they are sparse. A
   * height of zero is a hidden row and is allowed; a negative one is
   * not.
   */
  setRowHeights(heights: ReadonlyMap<number, number> | undefined): void {
    this.adoptHeights(heights);
    this.invalidate();
  }

  /** The height every row has unless it is an exception. */
  setRowHeight(height: number): void {
    const next = positive('rowHeight', height);
    if (next === this.rowHeight) {
      return;
    }
    this.rowHeight = next;
    // The exception starts are measured against the default, so they
    // are wrong the moment it moves.
    this.rebuildExceptionStarts();
    this.invalidate();
  }

  private adoptHeights(heights: ReadonlyMap<number, number> | undefined): void {
    this.exceptionRows = [];
    this.exceptionHeights = [];
    if (heights !== undefined) {
      const rows = [...heights.keys()].sort((a, b) => a - b);
      for (const row of rows) {
        const height = heights.get(row) ?? 0;
        if (!(height >= 0)) {
          throw new Error(`LazySheet row heights must not be negative, got ${String(height)}.`);
        }
        // A row that happens to be the default height is not an
        // exception, and keeping it as one would make every offset
        // past it a search that finds nothing.
        if (height !== this.rowHeight) {
          this.exceptionRows.push(row);
          this.exceptionHeights.push(height);
        }
      }
    }
    this.rebuildExceptionStarts();
  }

  /**
   * Where each exception begins, and what they cost in total.
   *
   * `start` is the row's own offset past the header, so the inverse —
   * `rowAt` — can binary search it directly rather than reconstructing
   * it per probe.
   */
  private rebuildExceptionStarts(): void {
    this.exceptionStarts = new Array<number>(this.exceptionRows.length);
    let extra = 0;
    for (let index = 0; index < this.exceptionRows.length; index++) {
      this.exceptionStarts[index] = this.exceptionRows[index] * this.rowHeight + extra;
      extra += this.exceptionHeights[index] - this.rowHeight;
    }
  }

  /** The index of the last exception starting at or before an offset, or -1. */
  private exceptionAt(offset: number): number {
    let low = 0;
    let high = this.exceptionStarts.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.exceptionStarts[mid] <= offset) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  }

  /** How many exceptions come before a row, as an index into them. */
  private exceptionsBefore(row: number): number {
    let low = 0;
    let high = this.exceptionRows.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.exceptionRows[mid] < row) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  /** The height of one row. Zero when it is hidden. */
  rowHeightOf(row: number): number {
    if (this.exceptionRows.length === 0) {
      return this.rowHeight;
    }
    const index = this.exceptionsBefore(row);
    return this.exceptionRows[index] === row ? this.exceptionHeights[index] : this.rowHeight;
  }

  /** Where a row starts, measured past the header. */
  rowOffsetOf(row: number): number {
    const clamped = clamp(row, 0, this.rowCount);
    return clamped * this.rowHeight + this.extraWithin(clamped);
  }

  /** Total height of the rows, not counting the header. */
  private get rowsHeight(): number {
    return this.rowCount * this.rowHeight + this.extraWithin(this.rowCount);
  }

  /**
   * What the exceptions before `row` add to or take off the offset.
   *
   * Read off the last exception before it rather than summed: the
   * start of an exception already carries everything before it, so
   * its end minus where it *would* have ended is the running total.
   */
  private extraWithin(row: number): number {
    const before = this.exceptionsBefore(row);
    if (before === 0) {
      return 0;
    }
    const index = before - 1;
    return (
      this.exceptionStarts[index] + this.exceptionHeights[index] - (this.exceptionRows[index] + 1) * this.rowHeight
    );
  }

  /** The width of one column. */
  widthOf(column: number): number {
    if (this.widths === undefined) {
      return this.uniformWidth;
    }
    return this.widths[column] ?? 0;
  }

  /** Where a column starts, measured past the gutter. */
  offsetOf(column: number): number {
    if (this.widths === undefined) {
      return column * this.uniformWidth;
    }
    const clamped = clamp(column, 0, this.offsets.length - 1);
    return this.offsets[clamped] ?? 0;
  }

  /** Total width of the columns, not counting the gutter. */
  private get columnsWidth(): number {
    return this.widths === undefined ? this.columnCount * this.uniformWidth : (this.offsets[this.widths.length] ?? 0);
  }

  get contentWidth(): number {
    return this.gutterWidth + this.columnsWidth;
  }

  /** Where the scrolled columns begin, past the gutter and the frozen ones. */
  private get frozenWidth(): number {
    return this.offsetOf(this.frozenColumns);
  }

  get contentHeight(): number {
    return this.headerHeight + this.rowsHeight;
  }

  /**
   * The cell under a point in the scroll container's own coordinates.
   *
   * The window already knows where everything is and how far it is
   * scrolled, which is the whole of this: a drag towards a cell — a
   * fill handle, a selection being stretched — is usually heading for
   * one that has not been mounted, so there is no node to hit-test and
   * arithmetic is the only answer available.
   */
  cellAt(x: number, y: number): { row: number; column: number } {
    return {
      row: this.rowAt(this.viewport.scrollY + y),
      column: this.columnAt(this.viewport.scrollX + x)
    };
  }

  /**
   * The row at a content offset, clamped to the sheet.
   *
   * A division when every row is the default height — the common case
   * by a very long way — and otherwise a binary search over the
   * exceptions followed by a division inside the uniform run that
   * follows the one it lands in.
   *
   * A hidden row occupies no offset at all, so the offset where it
   * *would* be belongs to the row after it. That falls out of the
   * arithmetic rather than being special-cased: a zero-height
   * exception starts and ends at the same place, so the point is
   * never inside it.
   */
  rowAt(offset: number): number {
    const last = Math.max(0, this.rowCount - 1);
    const past = offset - this.headerHeight;
    if (this.exceptionRows.length === 0) {
      return clamp(Math.floor(past / this.rowHeight), 0, last);
    }
    if (past <= 0) {
      return 0;
    }
    const index = this.exceptionAt(past);
    if (index === -1) {
      return clamp(Math.floor(past / this.rowHeight), 0, last);
    }
    const start = this.exceptionStarts[index];
    const height = this.exceptionHeights[index];
    if (past < start + height) {
      return clamp(this.exceptionRows[index], 0, last);
    }
    // Past that exception, and before the next one: the rows between
    // are all the default height.
    const after = this.exceptionRows[index] + 1;
    return clamp(after + Math.floor((past - start - height) / this.rowHeight), 0, last);
  }

  /**
   * The column at a content offset, clamped to the sheet.
   *
   * A binary search over the prefix sum when the columns differ, and
   * a division when they do not — the uniform case is the common one
   * and should not pay for the general one.
   */
  columnAt(offset: number): number {
    const last = Math.max(0, this.columnCount - 1);
    const past = offset - this.gutterWidth;
    if (this.widths === undefined) {
      return clamp(Math.floor(past / this.uniformWidth), 0, last);
    }
    if (past <= 0) {
      return 0;
    }
    if (past >= this.columnsWidth) {
      return last;
    }
    let low = 0;
    let high = last;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.offsets[mid] <= past) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  setRowCount(count: number): void {
    if (count === this.rowCount) {
      return;
    }
    this.rowCount = Math.max(0, Math.floor(count));
    this.invalidate();
  }

  setColumnCount(count: number): void {
    if (count === this.columnCount) {
      return;
    }
    this.columnCount = Math.max(0, Math.floor(count));
    this.invalidate();
  }

  /**
   * The bands, which the spike tunes from the screen.
   *
   * A band is the only defence against the round trip to the
   * application thread: rows inside it already hold their values when
   * the scroll reaches them. Widening it costs nodes on every frame
   * and cells on every publish, so what it should be is a measurement,
   * not a default — hence setters rather than a constant.
   */
  setOverscan(rows: number, columns: number): void {
    const nextRows = Math.max(0, Math.floor(rows));
    const nextColumns = Math.max(0, Math.floor(columns));
    if (nextRows === this.rowOverscan && nextColumns === this.columnOverscan) {
      return;
    }
    this.rowOverscan = nextRows;
    this.columnOverscan = nextColumns;
    this.invalidate();
  }

  /**
   * How many rows and columns stay put while the rest scrolls.
   *
   * Freezing changes which rows are in the scrolled window, so every
   * mounted row is rebuilt — a row that was scrolling is now frozen
   * or the other way about.
   */
  setFrozen(rows: number, columns: number): void {
    const nextRows = Math.max(0, Math.floor(rows));
    const nextColumns = Math.max(0, Math.floor(columns));
    if (nextRows === this.frozenRows && nextColumns === this.frozenColumns) {
      return;
    }
    this.frozenRows = nextRows;
    this.frozenColumns = nextColumns;
    this.invalidate();
  }

  /** Drops every mounted row and rebuilds against the last viewport. */
  invalidate(): void {
    this.mountedRows.clear();
    this.frozenMounted.clear();
    this.mountedHeader = undefined;
    this.range = EMPTY_RANGE;
    this.recompute();
  }

  /**
   * One step, run by the host each frame before layout.
   *
   * Nothing is measured and nothing is anchored: the offsets are exact,
   * so the rows a scroll reveals are placed correctly on the frame
   * that reveals them rather than corrected on the one after.
   */
  update(viewport: SheetViewport): void {
    this.viewport = viewport;
    this.recompute();
  }

  private recompute(): void {
    const next = this.windowFor(this.viewport);
    if (sameRange(next, this.range)) {
      return;
    }
    // A row built for other columns holds the wrong cells, so the cache
    // survives a vertical scroll and nothing else.
    if (next.firstColumn !== this.range.firstColumn || next.lastColumn !== this.range.lastColumn) {
      this.mountedRows.clear();
      this.frozenMounted.clear();
      this.mountedHeader = undefined;
    }
    this.range = next;
    this.children$.next(this.buildChildren());
    this.range$.next(next);
  }

  /**
   * The window, in content coordinates.
   *
   * The header and the gutter are *content*: they occupy the first
   * `headerHeight` pixels and the first `gutterWidth`, and `rowAt` and
   * `columnAt` already subtract them. So the range comes out slightly
   * generous at the near edges — the rows a header is covering are
   * mounted, and the columns behind the gutter are too — which is
   * correct rather than wasteful, since a sticky strip is drawn over
   * cells that are really there.
   */
  private windowFor(viewport: SheetViewport): SheetRange {
    if (this.rowCount === 0 || this.columnCount === 0) {
      return EMPTY_RANGE;
    }
    // The frozen rows and columns are mounted separately, so the
    // scrolled window starts past them — otherwise a sheet scrolled
    // to the top would build each of them twice, once frozen and once
    // in the window, and the keys would collide.
    const firstRow = Math.max(this.frozenRows, this.rowAt(viewport.scrollY) - this.rowOverscan);
    const lastRow = Math.min(
      this.rowCount - 1,
      this.rowAt(viewport.scrollY + Math.max(0, viewport.height)) + this.rowOverscan
    );
    const firstColumn = Math.max(this.frozenColumns, this.columnAt(viewport.scrollX) - this.columnOverscan);
    const lastColumn = Math.min(
      this.columnCount - 1,
      this.columnAt(viewport.scrollX + Math.max(0, viewport.width)) + this.columnOverscan
    );
    const range = { firstRow, lastRow, firstColumn, lastColumn };
    if (this.extendRange === undefined) {
      return range;
    }
    // Clamped to the sheet and never *narrowed*: a caller that
    // returned a smaller range would be deciding what the viewport
    // covers, which is not its question, and a window smaller than
    // the screen is a hole in the middle of the sheet.
    const wanted = this.extendRange(range);
    return {
      firstRow: clamp(Math.min(wanted.firstRow, firstRow), this.frozenRows, firstRow),
      lastRow: clamp(Math.max(wanted.lastRow, lastRow), lastRow, this.rowCount - 1),
      firstColumn: clamp(Math.min(wanted.firstColumn, firstColumn), this.frozenColumns, firstColumn),
      lastColumn: clamp(Math.max(wanted.lastColumn, lastColumn), lastColumn, this.columnCount - 1)
    };
  }

  private buildChildren(): UiElement[] {
    const { firstRow, lastRow, firstColumn, lastColumn } = this.range;
    if (lastRow < firstRow) {
      return [];
    }
    const width = this.contentWidth;
    const lead = this.offsetOf(firstColumn) - this.frozenWidth;
    const children: UiElement[] = [];

    if (this.renderHeader !== undefined) {
      this.mountedHeader ??= this.wrapHeader(this.renderHeader(firstColumn, lastColumn), width, lead);
      children.push(this.mountedHeader);
    }

    // The frozen rows, before the spacer and exactly where the header
    // goes — a frozen pane is the header row with the count turned
    // up. Keeping them visible is the renderer's, with sticky.
    for (let row = 0; row < this.frozenRows && row < this.rowCount; row++) {
      let built = this.frozenMounted.get(row);
      if (built === undefined) {
        built = this.wrap(row, width, lead);
        this.frozenMounted.set(row, built);
      }
      children.push(built);
    }

    children.push(spacer('sheet:top', this.rowOffsetOf(firstRow) - this.rowOffsetOf(this.frozenRows)));
    for (const row of this.mountedRows.keys()) {
      if (row < firstRow || row > lastRow) {
        this.mountedRows.delete(row);
      }
    }
    for (let row = firstRow; row <= lastRow; row++) {
      let built = this.mountedRows.get(row);
      if (built === undefined) {
        built = this.wrap(row, width, lead);
        this.mountedRows.set(row, built);
      }
      children.push(built);
    }
    children.push(spacer('sheet:bottom', this.rowsHeight - this.rowOffsetOf(lastRow + 1)));
    return children;
  }

  /**
   * The header, given the same geometry a row gets.
   *
   * Its own children are laid out exactly like a row's, so that a
   * column header lines up with the column under it without either
   * being told where the other is: the same leading spacer, the same
   * gutter-sized first cell, the same widths.
   */
  private wrapHeader(built: UiChild, width: number, lead: number): UiElement {
    if (!isRowElement(built)) {
      throw new Error("A sheet's header must be a Row element, laid out like the rows it labels.");
    }
    return {
      ...built,
      props: { ...built.props, key: 'sheet:header', width, height: this.headerHeight, flexShrink: 0 },
      children: this.withLead(built.children, lead)
    };
  }

  /**
   * A row's children with the leading spacer in the right place.
   *
   * With a gutter, the renderer's first child *is* the gutter: it sits
   * at content x 0 and the columns begin past it, so the spacer for
   * the columns scrolled out of view goes after it. Without one the
   * spacer goes first. Either way the renderer is handed a range of
   * columns and never has to know where the window is.
   */
  private withLead(children: readonly UiChild[], lead: number): UiChild[] {
    const pad = spacer('sheet:lead', undefined, lead);
    // Everything that stays put comes first: the gutter, then the
    // frozen columns. The spacer for the columns scrolled out of view
    // goes after them, which is what puts `firstColumn` at its own
    // offset without the row holding the columns between.
    const stays = (this.gutterWidth > 0 ? 1 : 0) + this.frozenColumns;
    if (stays === 0) {
      return [pad, ...children];
    }
    return [...children.slice(0, stays), pad, ...children.slice(stays)];
  }

  /**
   * The row the renderer returned, given its place in the sheet.
   *
   * The leading spacer is prepended here rather than asked of the
   * renderer, because it is windowing bookkeeping and not a cell: it is
   * what puts column `firstColumn` at its own offset without the row
   * holding the columns to its left.
   */
  private wrap(row: number, width: number, lead: number): UiElement {
    const built = this.renderRow(row, this.range.firstColumn, this.range.lastColumn);
    if (!isRowElement(built)) {
      throw new Error(
        `A sheet row must be a Row element; row ${row} rendered something else. ` +
          'Its cells are laid out along one axis at widths the window already knows.'
      );
    }
    return {
      ...built,
      props: {
        ...built.props,
        key: `sheet:row:${row}`,
        width,
        height: this.rowHeightOf(row),
        flexShrink: 0
      },
      children: this.withLead(built.children, lead)
    };
  }
}

function spacer(key: string, height?: number, width?: number): UiElement {
  return Box({ key, height, width, flexShrink: 0 });
}

function isRowElement(child: UiChild): child is UiElement {
  return (
    typeof child === 'object' &&
    child !== null &&
    (child as UiElement).type === UiNodeType.Row &&
    Array.isArray((child as UiElement).children)
  );
}

function sameRange(a: SheetRange, b: SheetRange): boolean {
  return (
    a.firstRow === b.firstRow &&
    a.lastRow === b.lastRow &&
    a.firstColumn === b.firstColumn &&
    a.lastColumn === b.lastColumn
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function positive(name: string, value: number): number {
  if (!(value > 0)) {
    throw new Error(`LazySheet ${name} must be positive, got ${String(value)}.`);
  }
  return value;
}

/** What `sheetSource` carries from a LazySheet's props to its window. */
export interface SheetSourceArgs {
  readonly sheet: UiVirtualSheet;
  readonly rowCount: Reactive<number>;
  readonly columnCount: Reactive<number>;
  readonly rowOverscan?: Reactive<number>;
  readonly columnOverscan?: Reactive<number>;
}

/**
 * Feeds a sheet the inputs that may change, with the node's lifetime.
 *
 * The same reasoning as `lazySource`: a modifier is released inside
 * `removeSubtree`, and it attaches after the element's props and
 * before its children, so a count that arrives with the tree is in the
 * window before the first children are read from it.
 */
export const sheetSource = defineModifier<SheetSourceArgs>({
  name: 'sheetSource',
  attach(host, args) {
    follow(host, args.rowCount, value => args.sheet.setRowCount(value));
    follow(host, args.columnCount, value => args.sheet.setColumnCount(value));
    let rows: number | undefined;
    let columns: number | undefined;
    const apply = (): void => {
      if (rows !== undefined || columns !== undefined) {
        args.sheet.setOverscan(rows ?? 3, columns ?? 2);
      }
    };
    if (args.rowOverscan !== undefined) {
      follow(host, args.rowOverscan, value => {
        rows = value;
        apply();
      });
    }
    if (args.columnOverscan !== undefined) {
      follow(host, args.columnOverscan, value => {
        columns = value;
        apply();
      });
    }
  }
});

function follow<T>(host: UiModifierHost, source: Reactive<T>, apply: (value: T) => void): void {
  if (!isObservable(source)) {
    apply(source as T);
    return;
  }
  host.own(
    source.subscribe(value => {
      apply(value);
      host.requestFrame();
    })
  );
}

export type LazySheetProps = ScrollViewProps &
  Omit<UiVirtualSheetOptions, 'initialViewport'> & {
    /** Hands the window to the caller, once, as the element is built. */
    sheetRef?: (sheet: UiVirtualSheet) => void;
    /** The row above the rows, sized by `headerHeight`. */
    header?: SheetHeaderRenderer;
  };

/**
 * A scrolling surface that mounts only the cells in view, on both axes.
 *
 *   LazySheet({ rowCount: 10_000, columnCount: 100, rowHeight: 24, columnWidth: 96 },
 *     (row, first, last) => Row({}, ...cells(row, first, last)))
 *
 * It is a ScrollView whose children are a spacer for the rows above
 * the window, the mounted rows, and a spacer for the rows below; each
 * row carries a spacer for the columns to its left and is as wide as
 * the whole sheet, so the container's content extent — and both
 * scrollbars — are the sheet's real size on the first frame rather
 * than an estimate that settles.
 */
export function LazySheet(props: LazySheetProps, renderRow: SheetRowRenderer): UiElement {
  const {
    rowCount,
    columnCount,
    rowHeight,
    rowHeights,
    columnWidth,
    rowOverscan,
    columnOverscan,
    gutterWidth,
    headerHeight,
    frozenRows,
    frozenColumns,
    header,
    extendRange,
    modifiers,
    sheetRef,
    ...rest
  } = props;
  const sheet = new UiVirtualSheet(
    {
      rowCount,
      columnCount,
      rowHeight,
      rowHeights,
      columnWidth,
      rowOverscan,
      columnOverscan,
      gutterWidth,
      headerHeight,
      frozenRows,
      frozenColumns,
      extendRange
    },
    renderRow,
    header
  );
  sheetRef?.(sheet);
  return createElement(
    UiNodeType.ScrollView,
    {
      ...rest,
      modifiers: [...(modifiers ?? []), sheetSource({ sheet, rowCount, columnCount, rowOverscan, columnOverscan })],
      direction: 'column',
      [VIRTUAL_SHEET_PROP]: sheet
    },
    [sheet.children$]
  );
}
