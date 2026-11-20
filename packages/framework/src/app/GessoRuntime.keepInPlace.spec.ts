import { describe, expect, it } from 'vitest';

import { Box, Column, Row, ScrollView, type UiNode } from 'gesso-core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';
import { ScrollService } from './ScrollService';

/**
 * Holding a node where it is on screen through a layout change.
 *
 * Calcwright opens a drawing on a click: the palette beside the page
 * folds away and the page re-centres, and the shape that was clicked
 * moved 340 px out from under the pointer. `keepInPlace` scrolls the
 * containers above the clicked node by however far the layout moved
 * it, on both axes, so it stays where it was as far as there is room.
 */
function drain(mounted: MountedRuntime, limit = 200): void {
  for (let frames = 0; mounted.clock.isPending && frames < limit; frames++) {
    mounted.frame();
  }
}

function mount(options: { scrollX?: number; scrollY?: number } = {}) {
  const panel = internalState(200);
  const above = internalState(100);
  let target: UiNode | null = null;
  let view: UiNode | null = null;
  const mounted = mountRuntime(
    ScrollView(
      {
        width: 400,
        height: 300,
        scrollX: options.scrollX ?? 300,
        scrollY: options.scrollY ?? 50,
        ref: (n: UiNode | null) => (view = n)
      },
      Column(
        { width: 1600 },
        Box({ width: 1600, height: above }),
        Row(
          { width: 1600, height: 100 },
          Box({ width: panel, height: 100 }),
          Box({ width: 120, height: 80, ref: (n: UiNode | null) => (target = n) }),
          Box({ width: 1200, height: 100 })
        ),
        Box({ width: 1600, height: 900 })
      )
    )
  );
  drain(mounted);
  const scroll = mounted.runtime.services.get(ScrollService);
  return { mounted, panel, above, scroll, target: () => target!, view: () => view! };
}

describe('keepInPlace', () => {
  it('holds a node through a layout that moves it, on both axes', () => {
    const { mounted, panel, above, scroll, target, view } = mount();
    const before = mounted.runtime.debugVisibleBox(target());

    scroll.keepInPlace(target());
    panel.value = 0;
    above.value = 60;
    drain(mounted);

    const after = mounted.runtime.debugVisibleBox(target());
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(view().getProperty('scrollX')).toBeCloseTo(100, 5);
    expect(view().getProperty('scrollY')).toBeCloseTo(10, 5);
  });

  it('moves by what scrolling cannot make up', () => {
    // At 50 down, a block above that shrinks by 80 can be made up by 50.
    const { mounted, above, scroll, target, view } = mount();
    const before = mounted.runtime.debugVisibleBox(target());

    scroll.keepInPlace(target());
    above.value = 20;
    drain(mounted);

    expect(view().getProperty('scrollY')).toBe(0);
    expect(mounted.runtime.debugVisibleBox(target()).y).toBeCloseTo(before.y - 30, 5);
  });

  it('holds a point in the node, where a canvas was clicked', () => {
    const { mounted, panel, scroll, target } = mount();
    const at = { x: 90, y: 60 };
    const box = mounted.runtime.debugVisibleBox(target());
    const before = { x: box.x + at.x, y: box.y + at.y };

    scroll.keepInPlace(target(), { at });
    panel.value = 60;
    drain(mounted);

    const after = mounted.runtime.debugVisibleBox(target());
    expect(after.x + at.x).toBeCloseTo(before.x, 5);
    expect(after.y + at.y).toBeCloseTo(before.y, 5);
  });

  it('holds for one laid-out frame unless told to hold longer', () => {
    const { mounted, panel, scroll, target } = mount();
    scroll.keepInPlace(target());
    panel.value = 150;
    drain(mounted);
    const held = mounted.runtime.debugVisibleBox(target()).x;

    panel.value = 100;
    drain(mounted);
    expect(mounted.runtime.debugVisibleBox(target()).x).toBeCloseTo(held - 50, 5);
  });

  it('keeps holding for its time, across a change spread over frames', () => {
    const { mounted, panel, scroll, target } = mount();
    const before = mounted.runtime.debugVisibleBox(target()).x;
    const release = scroll.keepInPlace(target(), { for: 60_000 });
    for (const width of [160, 120, 80, 40, 0]) {
      panel.value = width;
      drain(mounted);
      expect(mounted.runtime.debugVisibleBox(target()).x).toBeCloseTo(before, 5);
    }

    release();
    panel.value = 100;
    drain(mounted);
    expect(mounted.runtime.debugVisibleBox(target()).x).toBeCloseTo(before + 100, 5);
  });

  it('leaves the person’s own scroll alone while it holds', () => {
    const { mounted, scroll, target, view } = mount();
    scroll.keepInPlace(target(), { for: 60_000 });
    view().setProperty('scrollX', 250);
    drain(mounted);
    expect(view().getProperty('scrollX')).toBe(250);
  });
});
