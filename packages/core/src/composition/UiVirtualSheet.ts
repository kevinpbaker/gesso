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
  /** Height of every row. */
  readonly rowHeight: number;
  /** Width of every column. */
  readonly columnWidth: number;
  /** Rows mounted beyond each edge of the viewport. Default 3. */
  readonly rowOverscan?: Reactive<number>;
  /** Columns mounted beyond each edge of the viewport. Default 2. */
  readonly columnOverscan?: Reactive<number>;
  /** Viewport assumed before the first layout. */
  readonly initialViewport?: { readonly width: number; readonly height: number };
}

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
  private readonly rowHeight: number;
  private readonly columnWidth: number;
  private readonly renderRow: SheetRowRenderer;

  private range: SheetRange = EMPTY_RANGE;
  private viewport: SheetViewport;
  /** Rows built for the current column range, so a vertical scroll rebuilds one row. */
  private readonly mountedRows = new Map<number, UiElement>();

  constructor(options: UiVirtualSheetOptions, renderRow: SheetRowRenderer) {
    this.rowCount = typeof options.rowCount === 'number' ? options.rowCount : 0;
    this.columnCount = typeof options.columnCount === 'number' ? options.columnCount : 0;
    this.rowHeight = positive('rowHeight', options.rowHeight);
    this.columnWidth = positive('columnWidth', options.columnWidth);
    this.rowOverscan = typeof options.rowOverscan === 'number' ? options.rowOverscan : 3;
    this.columnOverscan = typeof options.columnOverscan === 'number' ? options.columnOverscan : 2;
    this.renderRow = renderRow;
    this.viewport = {
      scrollX: 0,
      scrollY: 0,
      width: options.initialViewport?.width ?? 800,
      height: options.initialViewport?.height ?? 600
    };
    this.recompute();
  }

  get contentWidth(): number {
    return this.columnCount * this.columnWidth;
  }

  get contentHeight(): number {
    return this.rowCount * this.rowHeight;
  }

  /** The row at a content offset, clamped to the sheet. */
  rowAt(offset: number): number {
    return clamp(Math.floor(offset / this.rowHeight), 0, Math.max(0, this.rowCount - 1));
  }

  /** The column at a content offset, clamped to the sheet. */
  columnAt(offset: number): number {
    return clamp(Math.floor(offset / this.columnWidth), 0, Math.max(0, this.columnCount - 1));
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

  /** Drops every mounted row and rebuilds against the last viewport. */
  invalidate(): void {
    this.mountedRows.clear();
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
    }
    this.range = next;
    this.children$.next(this.buildChildren());
    this.range$.next(next);
  }

  private windowFor(viewport: SheetViewport): SheetRange {
    if (this.rowCount === 0 || this.columnCount === 0) {
      return EMPTY_RANGE;
    }
    const firstRow = Math.max(0, this.rowAt(viewport.scrollY) - this.rowOverscan);
    const lastRow = Math.min(
      this.rowCount - 1,
      this.rowAt(viewport.scrollY + Math.max(0, viewport.height)) + this.rowOverscan
    );
    const firstColumn = Math.max(0, this.columnAt(viewport.scrollX) - this.columnOverscan);
    const lastColumn = Math.min(
      this.columnCount - 1,
      this.columnAt(viewport.scrollX + Math.max(0, viewport.width)) + this.columnOverscan
    );
    return { firstRow, lastRow, firstColumn, lastColumn };
  }

  private buildChildren(): UiElement[] {
    const { firstRow, lastRow, firstColumn } = this.range;
    if (lastRow < firstRow) {
      return [];
    }
    const width = this.contentWidth;
    const lead = firstColumn * this.columnWidth;
    const children: UiElement[] = [spacer('sheet:top', firstRow * this.rowHeight)];
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
    children.push(spacer('sheet:bottom', (this.rowCount - lastRow - 1) * this.rowHeight));
    return children;
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
        height: this.rowHeight,
        flexShrink: 0
      },
      children: [spacer('sheet:lead', undefined, lead), ...built.children]
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
  const { rowCount, columnCount, rowHeight, columnWidth, rowOverscan, columnOverscan, modifiers, sheetRef, ...rest } =
    props;
  const sheet = new UiVirtualSheet(
    { rowCount, columnCount, rowHeight, columnWidth, rowOverscan, columnOverscan },
    renderRow
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
