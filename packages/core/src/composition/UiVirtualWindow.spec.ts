import { afterEach, describe, expect, it, vi } from 'vitest';

import { Text } from './UiComponents';
import type { UiElement } from './UiElement';
import { UiVirtualWindow, VIRTUAL_INDEX_PROP } from './UiVirtualWindow';

/** Indices of the mounted item wrappers in the current children. */
function mounted(window: UiVirtualWindow): number[] {
  return window.children$.value
    .map(child => (child as UiElement).props[VIRTUAL_INDEX_PROP])
    .filter((index): index is number => typeof index === 'number');
}

function spacers(window: UiVirtualWindow): { lead: number; trail: number } {
  const children = window.children$.value as UiElement[];
  const lead = children[0].props.height as number;
  const trail = children[children.length - 1].props.height as number;
  return { lead, trail };
}

describe('UiVirtualWindow', () => {
  const renderItem = (index: number) => Text({ text: `row ${index}` });

  it('mounts the viewport plus overscan from the estimate before any layout', () => {
    const window = new UiVirtualWindow(
      'column',
      { count: 1000, estimatedExtent: 20, overscan: 2, initialViewportExtent: 100 },
      renderItem
    );
    // 100 / 20 = rows 0..5 visible (5 spans the bottom edge), plus 2 overscan.
    expect(mounted(window)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(spacers(window)).toEqual({ lead: 0, trail: 1000 * 20 - 8 * 20 });
  });

  it('moves the window with the scroll offset and keeps keys stable', () => {
    const window = new UiVirtualWindow('column', { count: 1000, estimatedExtent: 20, overscan: 1 }, renderItem);
    window.update({ scroll: 400, extent: 100 }, []);
    // 400 / 20 = 20 first visible; 500 / 20 = 25 last; overscan 1.
    expect(mounted(window)).toEqual([19, 20, 21, 22, 23, 24, 25, 26]);
    expect(spacers(window).lead).toBe(19 * 20);
    const keys = window.children$.value.map(child => (child as UiElement).props.key);
    expect(keys[1]).toBe('lazy:19');
    expect(keys[keys.length - 1]).toBe('lazy:trail');
  });

  it('does not emit when nothing changed', () => {
    const window = new UiVirtualWindow('column', { count: 100, estimatedExtent: 20 }, renderItem);
    let emissions = 0;
    window.children$.subscribe(() => emissions++);
    window.update({ scroll: 0, extent: 600 }, []);
    window.update({ scroll: 0, extent: 600 }, []);
    expect(emissions).toBe(1);
  });

  it('corrects offsets with measured extents, sparsely', () => {
    const window = new UiVirtualWindow('column', { count: 1000, estimatedExtent: 20, overscan: 0 }, renderItem);
    window.update({ scroll: 0, extent: 100 }, [
      { index: 0, extent: 50 },
      { index: 2, extent: 20 }
    ]);
    expect(window.offsetOf(1)).toBe(50);
    expect(window.offsetOf(3)).toBe(50 + 20 + 20);
    expect(window.totalExtent()).toBe(1000 * 20 + 30);
    expect(window.extentOf(0)).toBe(50);
    expect(window.extentOf(1)).toBe(20);
  });

  it('finds the item at an offset after corrections', () => {
    const window = new UiVirtualWindow('column', { count: 10, estimatedExtent: 10 }, renderItem);
    window.update({ scroll: 0, extent: 50 }, [{ index: 1, extent: 40 }]);
    // 0: 0..10, 1: 10..50, 2: 50..60
    expect(window.indexAt(5)).toBe(0);
    expect(window.indexAt(49)).toBe(1);
    expect(window.indexAt(50)).toBe(2);
    expect(window.indexAt(10000)).toBe(9);
  });

  it('asks the host to keep the first mounted item anchored when content above it changes size', () => {
    const window = new UiVirtualWindow('column', { count: 100, estimatedExtent: 20, overscan: 0 }, renderItem);
    window.update({ scroll: 200, extent: 100 }, []);
    expect(window.range.first).toBe(10);
    // Items 0..9 were estimated at 20; three of them are really 40.
    const result = window.update({ scroll: 200, extent: 100 }, [
      { index: 1, extent: 40 },
      { index: 2, extent: 40 },
      { index: 3, extent: 40 }
    ]);
    expect(result.scrollAdjust).toBe(60);
    // With the adjusted scroll (260) the same first item is in view.
    expect(window.range.first).toBe(10);
  });

  it('handles an empty list and the end of the list', () => {
    const empty = new UiVirtualWindow('column', { count: 0, estimatedExtent: 20 }, renderItem);
    expect(mounted(empty)).toEqual([]);
    expect(spacers(empty)).toEqual({ lead: 0, trail: 0 });

    const window = new UiVirtualWindow('column', { count: 10, estimatedExtent: 20, overscan: 5 }, renderItem);
    window.update({ scroll: 5000, extent: 100 }, []);
    expect(window.range).toEqual({ first: 0, last: 9 });
    expect(spacers(window).trail).toBe(0);
  });

  it("uses the caller's keys and lays a row out along the x axis", () => {
    const window = new UiVirtualWindow(
      'row',
      { count: 50, estimatedExtent: 30, overscan: 0, key: index => `id-${index}` },
      renderItem
    );
    window.update({ scroll: 0, extent: 90 }, []);
    const children = window.children$.value as UiElement[];
    expect(children[0].props.width).toBe(0);
    expect(children[1].props.key).toBe('lazy:id-0');
    expect(children[children.length - 1].props.width).toBe(50 * 30 - 4 * 30);
  });

  it('rejects impossible options', () => {
    expect(() => new UiVirtualWindow('column', { count: -1, estimatedExtent: 20 }, renderItem)).toThrow(/count/);
    expect(() => new UiVirtualWindow('column', { count: 1, estimatedExtent: 0 }, renderItem)).toThrow(
      /estimatedExtent/
    );
  });
  describe('a viewport that is the content', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('warns once when the viewport keeps landing on the content extent, and not for a bounded list', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const window = new UiVirtualWindow(
        'column',
        { count: 10, estimatedExtent: 20, overscan: 1, initialViewportExtent: 500 },
        renderItem
      );
      // Bounded: the content grows past the viewport and the viewport stays put.
      window.setCount(20);
      window.update({ scroll: 0, extent: 500 }, []);
      window.setCount(30);
      window.update({ scroll: 0, extent: 500 }, []);
      expect(warn).not.toHaveBeenCalled();

      // Unbounded: the host lays the list out at its rows' height and reports
      // that back as the viewport, one frame behind the count.
      window.setCount(40);
      window.update({ scroll: 0, extent: 30 * 20 }, []);
      expect(warn).not.toHaveBeenCalled();
      window.setCount(50);
      window.update({ scroll: 0, extent: 40 * 20 }, []);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('LazyColumn of 50 items');
      expect(warn.mock.calls[0][0]).toContain('minHeight: 0');

      window.setCount(60);
      window.update({ scroll: 0, extent: 50 * 20 }, []);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not warn for a viewport that changes once, even onto a content extent', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const window = new UiVirtualWindow(
        'row',
        { count: 10, estimatedExtent: 20, overscan: 1, initialViewportExtent: 500 },
        renderItem
      );
      window.setCount(30);
      // A resize that happens to land on the previous content extent.
      window.update({ scroll: 0, extent: 200 }, []);
      window.setCount(40);
      window.update({ scroll: 0, extent: 200 }, []);
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not count an empty list laid out at no size, as one not shown yet is', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const window = new UiVirtualWindow(
        'column',
        { count: 0, estimatedExtent: 20, overscan: 1, initialViewportExtent: 500 },
        renderItem
      );
      // Nothing in it and nowhere to show it: zero is both extents, and says nothing.
      window.update({ scroll: 0, extent: 0 }, []);
      window.setCount(10);
      window.update({ scroll: 0, extent: 500 }, []);
      window.setCount(30);
      // Shown, bounded, then a resize that happens to land on a content extent.
      window.update({ scroll: 0, extent: 200 }, []);
      window.setCount(40);
      window.update({ scroll: 0, extent: 200 }, []);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe('UiVirtualWindow recycling', () => {
  const render = (index: number): UiElement => Text({ text: `row ${index}` });
  const keys = (window: UiVirtualWindow): string[] =>
    (window.children$.value as UiElement[])
      .filter(child => typeof child.props[VIRTUAL_INDEX_PROP] === 'number')
      .map(child => String(child.props.key));

  it('hands the slot of an item scrolling out to the one scrolling in', () => {
    const window = new UiVirtualWindow(
      'column',
      { count: 1000, estimatedExtent: 20, overscan: 2, recycle: true, initialViewportExtent: 100 },
      render
    );
    window.update({ scroll: 200, extent: 100 }, []);
    const before = new Set(keys(window));
    // One row on: one row leaves the top and one comes in at the bottom.
    window.update({ scroll: 220, extent: 100 }, []);
    const after = keys(window);
    expect(new Set(after)).toEqual(before);
    expect(mounted(window)[0]).toBe(9);
  });

  it('keys an item that stays by the same slot', () => {
    const window = new UiVirtualWindow(
      'column',
      { count: 1000, estimatedExtent: 20, overscan: 2, recycle: true, initialViewportExtent: 100 },
      render
    );
    window.update({ scroll: 200, extent: 100 }, []);
    const slotOf12 = keys(window)[mounted(window).indexOf(12)];
    window.update({ scroll: 220, extent: 100 }, []);
    expect(keys(window)[mounted(window).indexOf(12)]).toBe(slotOf12);
  });
});

/**
 * The window's offsets against the plainest model of them: a sum, from
 * the start, of every item's measured extent or the estimate. The
 * window keeps its corrections in a tree, which is only right if every
 * path that changes them — a measurement, a count that grows past the
 * tree or shrinks under it, an invalidation — leaves the same sums.
 */
describe('UiVirtualWindow offsets against a reference', () => {
  /** Mulberry32: the sequence is the same on every run, so a failure can be replayed. */
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Reference {
    readonly measured = new Map<number, number>();
    constructor(
      public count: number,
      readonly estimate: number
    ) {}

    record(index: number, extent: number): void {
      if (index >= 0 && index < this.count && extent >= 0) {
        this.measured.set(index, extent);
      }
    }

    setCount(count: number): void {
      this.count = count;
      for (const index of this.measured.keys()) {
        if (index >= count) {
          this.measured.delete(index);
        }
      }
    }

    offsetOf(index: number): number {
      let offset = 0;
      for (let item = 0; item < index; item++) {
        offset += item < this.count ? (this.measured.get(item) ?? this.estimate) : this.estimate;
      }
      return offset;
    }

    indexAt(offset: number): number {
      let found = 0;
      let edge = 0;
      for (let index = 0; index < this.count; index++) {
        if (edge <= offset) {
          found = index;
        }
        edge += this.measured.get(index) ?? this.estimate;
      }
      return found;
    }
  }

  it('agrees on every offset and every index through measurements, count changes and invalidations', () => {
    const next = random(7);
    const pick = (below: number): number => Math.floor(next() * below);
    const estimate = 20;
    const window = new UiVirtualWindow('column', { count: 50, estimatedExtent: estimate, overscan: 2 }, () =>
      Text({ text: 'row' })
    );
    const reference = new Reference(50, estimate);

    for (let step = 0; step < 400; step++) {
      const roll = next();
      if (roll < 0.1) {
        // Grows past the tree as often as it stays inside it, and shrinks to nothing now and then.
        const count = next() < 0.15 ? 0 : pick(300);
        window.setCount(count);
        reference.setCount(count);
      } else if (roll < 0.13) {
        window.invalidate();
        reference.measured.clear();
      } else {
        // Whole and half pixels, zero among them so offsets tie, and a
        // few the window must ignore: past the end, before the start, negative.
        const measures = Array.from({ length: 1 + pick(40) }, () => ({
          index: pick(reference.count + 5) - 2,
          extent: next() < 0.05 ? -1 : next() < 0.1 ? 0 : pick(120) / 2
        }));
        window.update({ scroll: pick(reference.offsetOf(reference.count) + 1), extent: 200 }, measures);
        for (const measure of measures) {
          reference.record(measure.index, measure.extent);
        }
      }

      const total = reference.offsetOf(reference.count);
      expect(window.totalExtent()).toBe(total);
      let edge = 0;
      for (let index = 0; index <= reference.count; index++) {
        expect(window.offsetOf(index)).toBe(edge);
        edge += reference.measured.get(index) ?? estimate;
      }
      for (let probe = 0; probe < 20; probe++) {
        const offset = next() * (total + 100) - 50;
        expect(window.indexAt(offset)).toBe(reference.indexAt(offset));
      }
      // Exactly on an item's edge, where the search has to pick the last of any that tie.
      const onEdge = reference.offsetOf(pick(reference.count + 1));
      expect(window.indexAt(onEdge)).toBe(reference.indexAt(onEdge));
    }
  });

  it('forgets what was measured past a shorter count when the list grows back', () => {
    const window = new UiVirtualWindow('column', { count: 100, estimatedExtent: 20, overscan: 0 }, () =>
      Text({ text: 'row' })
    );
    window.update(
      { scroll: 0, extent: 100 },
      Array.from({ length: 10 }, (_, item) => ({ index: 90 + item, extent: 50 }))
    );
    expect(window.totalExtent()).toBe(100 * 20 + 10 * 30);
    window.setCount(60);
    window.setCount(100);
    expect(window.totalExtent()).toBe(100 * 20);
    expect(window.offsetOf(95)).toBe(95 * 20);
  });

  it('counts the corrections below an index outside the list or between two', () => {
    const window = new UiVirtualWindow('column', { count: 4, estimatedExtent: 20, overscan: 0 }, () =>
      Text({ text: 'row' })
    );
    window.update({ scroll: 0, extent: 100 }, [
      { index: 0, extent: 50 },
      { index: 3, extent: 10 }
    ]);
    expect(window.offsetOf(-2)).toBe(-40);
    expect(window.offsetOf(0.5)).toBe(10 + 30);
    expect(window.offsetOf(4)).toBe(50 + 20 + 20 + 10);
    expect(window.offsetOf(6)).toBe(6 * 20 + 30 - 10);
  });
});
