import { BehaviorSubject } from 'rxjs';

import { Box, Column, Row } from './UiComponents';
import type { UiChild, UiElement } from './UiElement';

export type LazyAxis = 'column' | 'row';

export interface LazyListOptions {
  /** Number of items. */
  readonly count: number;
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
}

export type LazyItemRenderer = (index: number) => UiChild;

/** What the host reports about the scroll container each frame. */
export interface VirtualViewport {
  /** Scroll offset along the list axis. */
  scroll: number;
  /** Visible extent along the list axis. */
  extent: number;
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

  private readonly count: number;
  private readonly estimate: number;
  private readonly overscan: number;
  private readonly keyOf: (index: number) => string | number;
  private readonly renderItem: LazyItemRenderer;

  private first = 0;
  private last = -1;
  private leadExtent = -1;
  private trailExtent = -1;
  private readonly measured = new Map<number, number>();
  /** Sorted by index: measured extent minus the estimate. */
  private corrections: Array<{ index: number; delta: number }> = [];
  /** Wrappers of the items currently mounted, so a row that stays is not re-rendered. */
  private readonly mountedItems = new Map<number, UiElement>();

  constructor(axis: LazyAxis, options: LazyListOptions, renderItem: LazyItemRenderer) {
    if (!(options.count >= 0) || !Number.isInteger(options.count)) {
      throw new Error(`LazyList count must be a non-negative integer, got ${String(options.count)}.`);
    }
    if (!(options.estimatedExtent > 0)) {
      throw new Error(`LazyList estimatedExtent must be positive, got ${String(options.estimatedExtent)}.`);
    }
    this.axis = axis;
    this.count = options.count;
    this.estimate = options.estimatedExtent;
    this.overscan = options.overscan ?? 3;
    this.keyOf = options.key ?? (index => index);
    this.renderItem = renderItem;
    this.children$ = new BehaviorSubject<UiElement[]>([]);
    this.update({ scroll: 0, extent: options.initialViewportExtent ?? 600 }, []);
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
    const anchorBefore = this.last >= this.first ? this.offsetOf(this.first) : 0;
    for (const measure of measures) {
      this.record(measure.index, measure.extent);
    }
    const anchorAfter = this.last >= this.first ? this.offsetOf(this.first) : 0;
    const scrollAdjust = anchorAfter - anchorBefore;

    const total = this.totalExtent();
    const scroll = clamp(viewport.scroll + scrollAdjust, 0, Math.max(0, total - viewport.extent));
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
    const children: UiElement[] = [this.spacer('lazy:lead', this.leadExtent)];
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
    return children;
  }

  private spacer(key: string, extent: number): UiElement {
    return this.axis === 'column'
      ? Box({ key, height: extent, flexShrink: 0 })
      : Box({ key, width: extent, flexShrink: 0 });
  }

  /**
   * Wraps an item so the host can find its index and measure it. The
   * wrapper is a flex container, so the item stretches across the list
   * like a row in any column.
   */
  private wrap(index: number, item: UiChild): UiElement {
    const key = `lazy:${String(this.keyOf(index))}`;
    const props = { key, [VIRTUAL_INDEX_PROP]: index, flexShrink: 0 };
    return this.axis === 'column' ? Column(props, item) : Row(props, item);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
