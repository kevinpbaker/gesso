import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';
import { SCROLLBAR_INSET, scrollbarThumb } from './Scrollbars';

/**
 * Scrolling under `textDirection: 'rtl'`.
 *
 * The model is CSS's. A right-to-left scroller starts at its right
 * edge, so its content overflows to the left, and its horizontal offset
 * runs from minus the overflow up to 0: 0 shows the start edge, which is
 * what an offset nobody has written means, and a negative offset shows
 * content further toward the end. The engine used to clamp every offset
 * to [0, overflow], which left the overflow on the left out of reach.
 */
describe('LayoutEngine scrolling, right to left', () => {
  /** A 200×100 scroller holding three 100-wide boxes in a row: 100 of overflow. */
  function rowScroller() {
    const harness = new LayoutHarness();
    const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('direction', 'row');
    scroll.setProperty('textDirection', 'rtl');
    for (const c of ['a', 'b', 'c']) {
      const node = harness.createNode(c, UiNodeType.Box);
      node.setProperty('width', 100);
      node.setProperty('height', 50);
      node.setProperty('flexShrink', 0);
      harness.append(scroll, node);
    }
    harness.layout(scroll, Constraints.tight(200, 100));
    return { harness, scroll };
  }

  /** A 200×100 vertical scroller holding one 500-wide box: 300 of overflow, across. */
  function columnScroller() {
    const harness = new LayoutHarness();
    const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    scroll.setProperty('textDirection', 'rtl');
    const wide = harness.createNode('wide', UiNodeType.Box);
    wide.setProperty('width', 500);
    wide.setProperty('height', 50);
    harness.append(scroll, wide);
    harness.layout(scroll, Constraints.tight(200, 100));
    return { harness, scroll };
  }

  it('lays a row out from the right edge, overflowing to the left', () => {
    const { harness } = rowScroller();
    expect(harness.box(harness.graph.requireNode('a')).x).toBe(100);
    expect(harness.box(harness.graph.requireNode('b')).x).toBe(0);
    expect(harness.box(harness.graph.requireNode('c')).x).toBe(-100);
  });

  it('opens on its start edge, with an offset of 0', () => {
    const { harness, scroll } = rowScroller();
    expect(harness.layout(scroll, Constraints.tight(200, 100)).scrollX).toBe(0);
  });

  it('scrolls toward the end with a negative offset, as far as the overflow and no further', () => {
    const { harness, scroll } = rowScroller();
    scroll.setProperty('scrollX', -60);
    expect(harness.layout(scroll, Constraints.tight(200, 100)).scrollX).toBe(-60);

    scroll.setProperty('scrollX', -500);
    expect(harness.layout(scroll, Constraints.tight(200, 100)).scrollX).toBe(-100);
  });

  it('clamps a positive offset to the start edge, where there is nothing to its right', () => {
    const { harness, scroll } = rowScroller();
    scroll.setProperty('scrollX', 80);
    expect(harness.layout(scroll, Constraints.tight(200, 100)).scrollX).toBe(0);
  });

  it('reaches content wider than a vertical scroller, across', () => {
    const { harness, scroll } = columnScroller();
    // The box is placed at its start, the right edge, so 300 of it is
    // past the left.
    expect(harness.box(harness.graph.requireNode('wide')).x).toBe(-300);
    scroll.setProperty('scrollX', -300);
    expect(harness.layout(scroll, Constraints.tight(200, 100)).scrollX).toBe(-300);
    scroll.setProperty('scrollX', -1000);
    expect(harness.layout(scroll, Constraints.tight(200, 100)).scrollX).toBe(-300);
  });

  it('leaves the vertical axis as it is', () => {
    const { harness, scroll } = rowScroller();
    scroll.setProperty('scrollY', -20);
    expect(harness.layout(scroll, Constraints.tight(200, 100)).scrollY).toBe(0);
  });

  it('shows what is scrolled into view where the offset says', () => {
    const { harness, scroll } = rowScroller();
    const c = harness.graph.requireNode('c');
    // c is laid out past the left edge, at -100. Scrolled all the way
    // toward the end, it is the leftmost thing in view.
    scroll.setProperty('scrollX', -100);
    harness.layout(scroll, Constraints.tight(200, 100));
    expect(harness.visibleBox(c).x).toBe(0);
    expect(harness.visibleBox(harness.graph.requireNode('a')).x).toBe(200);
  });

  it('reveals content past the left edge with a negative offset', () => {
    const { harness } = rowScroller();
    const c = harness.graph.requireNode('c');
    // Revealing used to clamp to [0, overflow], so what was past the
    // start side's opposite edge could never be scrolled to.
    expect(harness.engine.revealAdjustments(c)).toEqual([
      { container: harness.graph.requireNode('scroll'), scrollX: -100, scrollY: 0 }
    ]);
  });

  it('puts the horizontal thumb at the right while it shows the start, and moves it left', () => {
    const { harness, scroll } = rowScroller();
    const record = harness.record(scroll);
    const atStart = scrollbarThumb(record, 'x')!;
    scroll.setProperty('scrollX', -100);
    harness.layout(scroll, Constraints.tight(200, 100));
    const atEnd = scrollbarThumb(harness.record(scroll), 'x')!;
    // At the start the thumb is at the far right of its travel, and at
    // the end at the far left: it moves the way the content does.
    expect(atStart.thumb.x).toBe(record.x + SCROLLBAR_INSET + atStart.travel);
    expect(atEnd.thumb.x).toBe(record.x + SCROLLBAR_INSET);
  });

  it('holds a sticky start column at the right edge while the rest scrolls under it', () => {
    const { harness, scroll } = rowScroller();
    const a = harness.graph.requireNode('a');
    a.setProperty('position', 'sticky');
    a.setProperty('right', 0);
    scroll.setProperty('scrollX', -100);
    harness.layout(scroll, Constraints.tight(200, 100));
    // Scrolled to the end, a would have gone off the right; it is held
    // at the right edge instead, as a frozen first column is.
    expect(harness.visibleBox(a).x).toBe(100);
    expect(harness.visibleBox(harness.graph.requireNode('c')).x).toBe(0);
  });
});
