import { describe, expect, it } from 'vitest';

import { Box, Column, ScrollView, type UiNode } from 'gesso-core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * Holding the focused node in place in its scroll container.
 *
 * An inspector's column scrolls as one, with a summary near its top (a
 * list of problems) that grows and shrinks as the fields below it are
 * edited. Each change moved every field below it, so the field being
 * typed in slid away from the caret, and the next click landed on
 * whatever had slid under the pointer: a section header, a Delete. The
 * container now scrolls by however far a layout moved the focused node,
 * as CSS's `overflow-anchor` does, and the field stays where it was.
 */
function drain(mounted: MountedRuntime, limit = 200): void {
  for (let frames = 0; mounted.clock.isPending && frames < limit; frames++) {
    mounted.frame();
  }
}

function mount(scrolled = 0) {
  const summary = internalState(40);
  const offset = internalState(scrolled);
  let field: UiNode | null = null;
  let list: UiNode | null = null;
  const mounted = mountRuntime(
    ScrollView(
      { width: 300, height: 200, scrollY: offset, ref: (n: UiNode | null) => (list = n) },
      Column(
        { width: 300 },
        Box({ width: 300, height: summary }),
        Box({ width: 300, height: 120 }),
        Box({ width: 200, height: 30, focusable: true, ref: (n: UiNode | null) => (field = n) }),
        Box({ width: 300, height: 800 })
      )
    )
  );
  drain(mounted);
  return { mounted, summary, offset, field: () => field!, list: () => list! };
}

describe('scroll anchoring', () => {
  it('keeps the focused field where it is on screen when what is above it grows or shrinks', () => {
    const { mounted, summary, field, list } = mount(50);
    mounted.runtime.input.focus.focus(field());
    drain(mounted);
    const before = mounted.runtime.debugVisibleBox(field()).y;

    summary.value = 130;
    drain(mounted);
    expect(mounted.runtime.debugVisibleBox(field()).y).toBeCloseTo(before, 5);
    expect(list().getProperty('scrollY')).toBeCloseTo(140, 5);

    summary.value = 20;
    drain(mounted);
    expect(mounted.runtime.debugVisibleBox(field()).y).toBeCloseTo(before, 5);
    expect(list().getProperty('scrollY')).toBeCloseTo(30, 5);
  });

  it('scrolls only as far as there is to scroll', () => {
    // Already at the top: a summary that shrinks by 40 can only be made up by 0.
    const { mounted, summary, field, list } = mount(0);
    mounted.runtime.input.focus.focus(field());
    drain(mounted);

    summary.value = 0;
    drain(mounted);
    expect(list().getProperty('scrollY') ?? 0).toBe(0);
  });

  it('leaves the scroll alone with nothing focused', () => {
    const { mounted, summary, list } = mount(50);
    summary.value = 130;
    drain(mounted);
    expect(list().getProperty('scrollY')).toBe(50);
  });

  it('leaves the scroll alone when the focused field is scrolled out of sight', () => {
    // The field is at 160 to 190; scrolled to 400, the person is reading
    // something else, and that is what stays put.
    const { mounted, summary, offset, field, list } = mount(0);
    mounted.runtime.input.focus.focus(field());
    drain(mounted);
    offset.value = 400;
    drain(mounted);

    summary.value = 130;
    drain(mounted);
    expect(list().getProperty('scrollY')).toBe(400);
  });

  it('holds a field drawn zoomed by as far as it moved where it is drawn', () => {
    // The column is laid out at full size and drawn at 2x, as a page of
    // paper zoomed in. The field is laid out at 160 and drawn at 320;
    // scrolled to 250 it is in sight, though its record is above the view.
    const summary = internalState(40);
    const offset = internalState(250);
    let field: UiNode | null = null;
    let list: UiNode | null = null;
    const mounted = mountRuntime(
      ScrollView(
        { width: 300, height: 200, scrollY: offset, ref: (n: UiNode | null) => (list = n) },
        Box(
          { position: 'relative', width: 600, height: 2400 },
          Column(
            { position: 'absolute', top: 0, left: 0, width: 300, transform: { scaleX: 2, scaleY: 2 } },
            Box({ width: 300, height: summary }),
            Box({ width: 300, height: 120 }),
            Box({ width: 200, height: 30, focusable: true, ref: (n: UiNode | null) => (field = n) }),
            Box({ width: 300, height: 800 })
          )
        )
      )
    );
    drain(mounted);
    mounted.runtime.input.focus.focus(field!);
    drain(mounted);
    expect(list!.getProperty('scrollY')).toBe(250);

    // 30 more above it, which is 60 where it is drawn.
    summary.value = 70;
    drain(mounted);
    expect(list!.getProperty('scrollY')).toBeCloseTo(310, 5);
  });
});
