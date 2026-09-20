import { BehaviorSubject, type Observable } from 'rxjs';

import {
  type UiVirtualWindow,
  type UiNodeRef,
  type UiNode,
  type LayoutBox,
  measure,
  type UiModifier
} from 'gesso-core';

/**
 * What the three virtualized components share: the ability to put a row
 * that is not mounted on screen.
 *
 * A keyboard moves through the whole list, not through the fifteen rows
 * that happen to exist, so "scroll the active row into view" is asked
 * about an index with no node — and the engine's own reveal takes a
 * node. The window knows where any index sits (`offsetOf`), the
 * `measure` modifier reports how tall the viewport is, and the scroll
 * offset is written as a bound property so the write goes through the
 * graph with the right dirty flags rather than around it.
 */
export interface VirtualList {
  /** `windowRef` of the LazyColumn or LazyGrid. */
  readonly windowRef: (window: UiVirtualWindow) => void;
  /** `ref` of the same element, so the current scroll offset is readable. */
  readonly ref: UiNodeRef;
  /** Put in the element's `modifiers`: it measures the viewport. */
  readonly viewport: UiModifier;
  /** Bind to the element's `scrollY`. */
  readonly scrollY: Observable<number>;
  /**
   * Extent of a sticky header above the rows, which the reveal has to
   * keep a row clear of. Written from the header's own `measure`.
   */
  setLead(extent: number): void;
  /** Scrolls until the row at `index` is inside the viewport. */
  reveal(index: number): void;
}

export function virtualList(): VirtualList {
  const box = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const scroll = new BehaviorSubject(0);
  let window: UiVirtualWindow | null = null;
  let node: UiNode | null = null;
  let lead = 0;

  /**
   * Where the list is scrolled to now. The property rather than a
   * remembered value: a wheel writes the offset straight onto the node,
   * so the last value this wrote is stale the moment the user scrolls.
   */
  const current = (): number => {
    const value = node?.properties.get('scrollY');
    return typeof value === 'number' ? value : 0;
  };

  return {
    windowRef: value => {
      window = value;
    },
    ref: value => {
      node = value;
    },
    viewport: measure(box),
    scrollY: scroll,
    setLead: extent => {
      lead = extent;
    },
    reveal: index => {
      const height = box.value.height;
      if (window === null || height <= 0) {
        return;
      }
      const top = lead + window.offsetOf(index);
      const bottom = top + window.extentOf(index);
      const now = current();
      // The sticky header covers the top of the viewport, so the row is
      // only visible once it is `lead` below the scroll offset.
      if (top < now + lead) {
        scroll.next(Math.max(0, top - lead));
      } else if (bottom > now + height) {
        scroll.next(Math.max(0, bottom - height));
      }
    }
  };
}

/**
 * Moves an index by a step and clamps it to the list.
 *
 * Shared because every one of the three has the same arrow keys over a
 * count it does not hold, and because "clamped, never wrapped" is a
 * decision: a list of a hundred thousand rows that jumped from the end
 * to the start on one keypress would lose the reader's place.
 */
export function stepIndex(current: number, by: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  return Math.min(count - 1, Math.max(0, current + by));
}
