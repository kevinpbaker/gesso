import { BehaviorSubject, isObservable } from 'rxjs';

import { UiNodeType } from '../graph/UiNodeType';
import { percent, type UiTrackSize } from '../layout/UiLength';
import { defineModifier } from '../modifiers/UiModifier';
import type { UiModifierHost } from '../modifiers/UiModifierHost';
import { Box, Column, Grid, Row } from './UiComponents';
import { isUiElement, type UiChild, type UiElement } from './UiElement';
import type { Reactive } from './UiElementProps';

export type LazyAxis = 'column' | 'row';

export interface LazyListOptions {
  /**
   * Number of items now. A list whose data changes takes an
   * Observable: `LazyColumn` binds it through the `lazySource`
   * modifier, so the window learns the new count with the same
   * lifetime as the node and without the caller holding the window.
   */
  readonly count: Reactive<number>;
  /**
   * Expected extent of an item along the scroll axis, used for items
   * that have not been measured yet. The closer it is, the less the
   * scrollbar and offsets adjust as items come into view.
   */
  readonly estimatedExtent: number;
  /** Items mounted beyond each edge of the viewport. Default 3. */
  readonly overscan?: number;
  /** Identity of an item, for reconciliation. Default: its index. */
  readonly key?: (index: number) => string | number;
  /**
   * Viewport extent assumed before the first layout, so the first
   * frame mounts a sensible number of items. Default 600.
   */
  readonly initialViewportExtent?: number;
  /**
   * Any value that changes when what an index *means* changes — a
   * sort, a filter, a page of data arriving. The mounted items are
   * re-rendered and their measurements dropped; the indices and their
   * keys do not move, so the rows are reconciled in place rather than
   * rebuilt.
   */
  readonly revision?: Reactive<unknown>;
  /**
   * Makes the list a **lazy grid**: every mounted row and the header
   * share one set of column tracks. Without it the list is a plain
   * column of wrapped items.
   */
  readonly grid?: LazyGridOptions;
}

/**
 * The tracks a lazy grid's rows share, and the header that shares them.
 *
 * `decisions/0010-grid.md` left this here: a table whose virtualized
 * rows line up with its header needs the rows to be items of one grid,
 * because tracks cannot be sized across grids that cannot see each
 * other. So the scroll container holds a single Grid, and every row is
 * a `subgrid: 'columns'` item in it.
 */
export interface LazyGridOptions {
  /** The shared column tracks. */
  readonly columns: readonly UiTrackSize[];
  /** Space between the columns, in the header and in every row. */
  readonly columnGap?: number;
  /**
   * Drawn above the rows in the same tracks. Like a row it must be a
   * `Grid` with `subgrid: 'columns'`; unlike a row it is rendered once,
   * and `position: 'sticky'` on it holds it at the top while the rows
   * scroll under it.
   */
  readonly header?: UiChild;
}

export type LazyItemRenderer = (index: number) => UiChild;

/** What the host reports about the scroll container each frame. */
export interface VirtualViewport {
  /** Scroll offset along the list axis. */
  scroll: number;
  /** Visible extent along the list axis. */
  extent: number;
  /**
   * Content before the first item — a lazy grid's header. The window's
   * offsets are measured from the first item, so this is what makes
   * "which row is at the top of the viewport" the same question with a
   * header as without one. Zero by default.
   */
  lead?: number;
}

export interface VirtualItemMeasure {
  index: number;
  /** Outer extent of the mounted item along the axis. */
  extent: number;
}

export interface VirtualUpdate {
  /**
   * How far the scroll offset must move so that the first mounted item
   * stays where the user sees it, after measurements changed the size
   * of the content above it. Zero almost always.
   */
  scrollAdjust: number;
}

/** Marks an item wrapper with its index so the host can measure it. */
export const VIRTUAL_INDEX_PROP = 'virtualIndex';
/**
 * Marks a lazy grid's header, whose extent sits between the top of the
 * scrolled content and the first item — so the host can tell the window
 * how far the items start down the page.
 */
export const VIRTUAL_LEAD_PROP = 'virtualLead';
/** The window sits on the scroll container under this property. */
export const VIRTUAL_WINDOW_PROP = 'virtualWindow';

/**
 * The windowing behind LazyColumn / LazyRow.
 *
 * Only the items in the viewport plus an overscan band are mounted. The
 * rest is two spacer boxes whose extents come from an estimate per item,
 * corrected by the real extent of every item that has been measured, so
 * the total extent (and the scrollbar) settle toward the truth as the
 * user scrolls. Corrections are sparse — one entry per measured item
 * whose extent differs from the estimate — so a 100k-row list costs
 * memory proportional to what was seen, and offsets are estimate ×
 * index plus the corrections before that index.
 *
 * Children are emitted through a BehaviorSubject and reconciled by the
 * graph builder like any observable child: item identity is the key,
 * and an item that stays in the window keeps its node.
 */
export class UiVirtualWindow {
  readonly axis: LazyAxis;
  readonly children$: BehaviorSubject<UiElement[]>;

  private count: number;
  private readonly estimate: number;
  private readonly overscan: number;
  private readonly keyOf: (index: number) => string | number;
  private readonly renderItem: LazyItemRenderer;
  private readonly grid: LazyGridOptions | undefined;

  private first = 0;
  private last = -1;
  private leadExtent = -1;
  private trailExtent = -1;
  private readonly measured = new Map<number, number>();
  /** Sorted by index: measured extent minus the estimate. */
  private corrections: Array<{ index: number; delta: number }> = [];
  /** Wrappers of the items currently mounted, so a row that stays is not re-rendered. */
  private readonly mountedItems = new Map<number, UiElement>();
  /**
   * The last viewport the host reported, so a count or a revision
   * arriving between frames recomputes the window against where the
   * list actually is rather than against the top of it.
   */
  private viewport: VirtualViewport;

  constructor(axis: LazyAxis, options: LazyListOptions, renderItem: LazyItemRenderer) {
    const count = typeof options.count === 'number' ? options.count : 0;
    assertCount(count);
    if (!(options.estimatedExtent > 0)) {
      throw new Error(`LazyList estimatedExtent must be positive, got ${String(options.estimatedExtent)}.`);
    }
    this.axis = axis;
    this.count = count;
    this.estimate = options.estimatedExtent;
    this.overscan = options.overscan ?? 3;
    this.keyOf = options.key ?? (index => index);
    this.renderItem = renderItem;
    this.grid = options.grid;
    this.children$ = new BehaviorSubject<UiElement[]>([]);
    this.viewport = { scroll: 0, extent: options.initialViewportExtent ?? 600 };
    this.update(this.viewport, []);
  }

  /** How many items the list has, mounted or not. */
  get length(): number {
    return this.count;
  }

  /**
   * A new item count.
   *
   * L5 shipped `count` as a plain number and left an observable one to
   * this tier, because a table whose rows change cannot invalidate its
   * window without it. Measurements past the new end are dropped — a
   * shorter list must not keep corrections for items it no longer has,
   * or its scrollbar would claim space that is not there.
   *
   * The mounted items are re-rendered as well. A different count is a
   * different list, so an item cached against index 1 may be a
   * different item now; keeping it would show stale content, and with a
   * key derived from the data it would collide with the row that took
   * its place.
   */
  setCount(count: number): void {
    assertCount(count);
    if (count === this.count) {
      return;
    }
    this.count = count;
    for (const index of this.measured.keys()) {
      if (index >= count) {
        this.measured.delete(index);
      }
    }
    this.corrections = this.corrections.filter(correction => correction.index < count);
    this.mountedItems.clear();
    this.refresh();
  }

  /**
   * Re-renders the mounted items and forgets what they measured.
   *
   * For when the data behind the indices moved — a sort, a filter — so
   * the row at index 5 is a different row. Keys do not change, so the
   * rows are reconciled in place: the text of a cell is written, not a
   * node rebuilt.
   */
  invalidate(): void {
    this.measured.clear();
    this.corrections = [];
    this.mountedItems.clear();
    this.refresh();
  }

  /** Indices currently mounted, inclusive; `last < first` when none. */
  get range(): { first: number; last: number } {
    return { first: this.first, last: this.last };
  }

  /** Offset of an item's leading edge from the start of the content. */
  offsetOf(index: number): number {
    let offset = index * this.estimate;
    for (const correction of this.corrections) {
      if (correction.index >= index) {
        break;
      }
      offset += correction.delta;
    }
    return offset;
  }

  totalExtent(): number {
    return this.offsetOf(this.count);
  }

  extentOf(index: number): number {
    return this.measured.get(index) ?? this.estimate;
  }

  /** The item whose span contains `offset`; clamped to the list. */
  indexAt(offset: number): number {
    if (this.count === 0) {
      return 0;
    }
    let low = 0;
    let high = this.count - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.offsetOf(mid) <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  /**
   * One step, run by the host each frame before layout: take the
   * measurements of mounted items, keep the first mounted item anchored,
   * recompute the window for the viewport, and emit children when the
   * window or the spacers changed.
   */
  update(viewport: VirtualViewport, measures: Iterable<VirtualItemMeasure>): VirtualUpdate {
    this.viewport = viewport;
    const anchorBefore = this.last >= this.first ? this.offsetOf(this.first) : 0;
    for (const measure of measures) {
      this.record(measure.index, measure.extent);
    }
    const anchorAfter = this.last >= this.first ? this.offsetOf(this.first) : 0;
    const scrollAdjust = anchorAfter - anchorBefore;

    const total = this.totalExtent();
    const header = viewport.lead ?? 0;
    const scrolled = clamp(viewport.scroll + scrollAdjust, 0, Math.max(0, total + header - viewport.extent));
    // Offsets are measured from the first item, so a header above them
    // shifts what the viewport is looking at by its own extent.
    const scroll = Math.max(0, scrolled - header);
    let first = 0;
    let last = -1;
    if (this.count > 0) {
      first = Math.max(0, this.indexAt(scroll) - this.overscan);
      last = Math.min(this.count - 1, this.indexAt(scroll + Math.max(0, viewport.extent)) + this.overscan);
    }
    const lead = first <= last ? this.offsetOf(first) : 0;
    const trail = first <= last ? total - this.offsetOf(last + 1) : total;
    if (first !== this.first || last !== this.last || lead !== this.leadExtent || trail !== this.trailExtent) {
      this.first = first;
      this.last = last;
      this.leadExtent = lead;
      this.trailExtent = trail;
      this.children$.next(this.buildChildren());
    }
    return { scrollAdjust };
  }

  /**
   * Recomputes the window against the last viewport and emits, whatever
   * the arithmetic says. The sentinels force the emission: the window
   * may land on exactly the same range while the items in it mean
   * something different.
   */
  private refresh(): void {
    this.first = 0;
    this.last = -1;
    this.leadExtent = -1;
    this.trailExtent = -1;
    this.update(this.viewport, []);
  }

  private record(index: number, extent: number): void {
    if (index < 0 || index >= this.count || !(extent >= 0)) {
      return;
    }
    if (this.measured.get(index) === extent) {
      return;
    }
    this.measured.set(index, extent);
    const delta = extent - this.estimate;
    let position = 0;
    while (position < this.corrections.length && this.corrections[position].index < index) {
      position++;
    }
    const existing = this.corrections[position];
    if (existing !== undefined && existing.index === index) {
      if (delta === 0) {
        this.corrections.splice(position, 1);
      } else {
        existing.delta = delta;
      }
    } else if (delta !== 0) {
      this.corrections.splice(position, 0, { index, delta });
    }
  }

  private buildChildren(): UiElement[] {
    const children: UiElement[] = [];
    if (this.grid?.header !== undefined) {
      children.push(markRow(this.grid.header, { key: 'lazy:header', [VIRTUAL_LEAD_PROP]: true }, 'The header of'));
    }
    children.push(this.spacer('lazy:lead', this.leadExtent));
    for (const index of this.mountedItems.keys()) {
      if (index < this.first || index > this.last) {
        this.mountedItems.delete(index);
      }
    }
    for (let index = this.first; index <= this.last; index++) {
      let wrapper = this.mountedItems.get(index);
      if (wrapper === undefined) {
        wrapper = this.wrap(index, this.renderItem(index));
        this.mountedItems.set(index, wrapper);
      }
      children.push(wrapper);
    }
    children.push(this.spacer('lazy:trail', this.trailExtent));
    if (this.grid === undefined) {
      return children;
    }
    // One Grid holds the header, the spacers and every mounted row, so
    // the tracks are sized across all of them at once. The scroll
    // container's only child; its rows are contiguous, which is why the
    // grid takes no row gap — the window's offsets assume it.
    return [
      Grid(
        {
          key: 'lazy:grid',
          columns: this.grid.columns,
          columnGap: this.grid.columnGap,
          rowGap: 0,
          autoFlow: 'row',
          width: percent(100)
        },
        ...children
      )
    ];
  }

  private spacer(key: string, extent: number): UiElement {
    if (this.grid !== undefined) {
      // A spacer in a lazy grid is a grid item across every column, so
      // it occupies a whole row of its own rather than one cell.
      return Box({ key, height: extent, columnSpan: this.grid.columns.length });
    }
    return this.axis === 'column'
      ? Box({ key, height: extent, flexShrink: 0 })
      : Box({ key, width: extent, flexShrink: 0 });
  }

  /**
   * Marks an item so the host can find its index and measure it.
   *
   * A plain lazy list wraps the item in a flex container, so it
   * stretches across the list like a row in any column and its own
   * props are untouched. A lazy grid cannot: a row's cells have to be
   * items of the shared grid, so the row the renderer returns *is* the
   * wrapper, and the index is written onto it.
   */
  private wrap(index: number, item: UiChild): UiElement {
    const key = `lazy:${String(this.keyOf(index))}`;
    const props = { key, [VIRTUAL_INDEX_PROP]: index };
    if (this.grid !== undefined) {
      return markRow(item, props, `Row ${index} of`);
    }
    return this.axis === 'column' ? Column({ ...props, flexShrink: 0 }, item) : Row({ ...props, flexShrink: 0 }, item);
  }
}

/**
 * Copies the window's own props onto a row of a lazy grid.
 *
 * The row must be a `Grid` with `subgrid: 'columns'`, because that is
 * the only thing whose cells land in the tracks the header sized. The
 * check is here rather than in a comment: a row that is an ordinary
 * Row would line up by accident on the first frame and drift from the
 * header on the second.
 */
function markRow(row: UiChild, props: Record<string, unknown>, subject: string): UiElement {
  if (!isUiElement(row) || row.type !== UiNodeType.Grid || row.props.subgrid !== 'columns') {
    throw new Error(`${subject} a lazy grid must be a Grid with subgrid: 'columns', so its cells share the tracks.`);
  }
  return { ...row, props: { ...row.props, ...props } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertCount(count: number): void {
  if (!(count >= 0) || !Number.isInteger(count)) {
    throw new Error(`LazyList count must be a non-negative integer, got ${String(count)}.`);
  }
}

/** What `lazySource` carries from a LazyColumn's props to its window. */
export interface LazySourceArgs {
  readonly window: UiVirtualWindow;
  readonly count: Reactive<number>;
  readonly revision?: Reactive<unknown>;
  /**
   * Makes the list a **lazy grid**: every mounted row and the header
   * share one set of column tracks. Without it the list is a plain
   * column of wrapped items.
   */
  readonly grid?: LazyGridOptions;
}

/**
 * The tracks a lazy grid's rows share, and the header that shares them.
 *
 * `decisions/0010-grid.md` left this here: a table whose virtualized
 * rows line up with its header needs the rows to be items of one grid,
 * because tracks cannot be sized across grids that cannot see each
 * other. So the scroll container holds a single Grid, and every row is
 * a `subgrid: 'columns'` item in it.
 */
export interface LazyGridOptions {
  /** The shared column tracks. */
  readonly columns: readonly UiTrackSize[];
  /** Space between the columns, in the header and in every row. */
  readonly columnGap?: number;
  /**
   * Drawn above the rows in the same tracks. Like a row it must be a
   * `Grid` with `subgrid: 'columns'`; unlike a row it is rendered once,
   * and `position: 'sticky'` on it holds it at the top while the rows
   * scroll under it.
   */
  readonly header?: UiChild;
}

/**
 * Feeds a window the inputs that may change: the item count and the
 * revision of the data behind the indices.
 *
 * A modifier rather than a subscription taken in `LazyColumn`, because
 * a modifier's lifetime is exactly its node's — `own` releases the
 * subscription inside `removeSubtree`, before the node is gone — and
 * because attachment runs after the element's props and *before* its
 * children are reconciled, so a count that arrives with the tree is
 * already in the window when the first children are read from it.
 */
export const lazySource = defineModifier<LazySourceArgs>({
  name: 'lazySource',
  attach(host, args) {
    follow(host, args.count, value => args.window.setCount(value));
    if (args.revision !== undefined) {
      let first = true;
      follow(host, args.revision, () => {
        // The value the list was built with is not a change.
        if (first) {
          first = false;
          return;
        }
        args.window.invalidate();
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
