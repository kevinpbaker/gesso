import { describe, expect, it } from 'vitest';

import { Box, Column, ScrollView, type UiNode } from 'gesso-core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';
import { ScrollService } from './ScrollService';

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

/** Where `overflowAnchor: 'none'` goes: the focused field, the column round it, or the scroll container. */
type OptOut = 'field' | 'column' | 'list';

function mount(scrolled = 0, optOut?: OptOut) {
  const summary = internalState(40);
  const offset = internalState(scrolled);
  const none = (on: OptOut) => (optOut === on ? { overflowAnchor: 'none' as const } : {});
  let field: UiNode | null = null;
  let list: UiNode | null = null;
  const mounted = mountRuntime(
    ScrollView(
      { width: 300, height: 200, scrollY: offset, ref: (n: UiNode | null) => (list = n), ...none('list') },
      Column(
        { width: 300, ...none('column') },
        Box({ width: 300, height: summary }),
        Box({ width: 300, height: 120 }),
        Box({ width: 200, height: 30, focusable: true, ref: (n: UiNode | null) => (field = n), ...none('field') }),
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

/**
 * `overflowAnchor: 'none'`, as in CSS.
 *
 * Calcwright's open drawing grows up and left: its box moves up by what
 * it grew, and it draws its content that much lower in the box, so what
 * is drawn stays put. The drawing has the keyboard, so the anchor
 * scrolled the desk by the move and carried the drawing down the screen.
 */
describe('overflowAnchor', () => {
  for (const on of ['field', 'column', 'list'] as const) {
    it(`'none' on the ${on} leaves the scroll as it is when the focused field moves up`, () => {
      const { mounted, summary, field, list } = mount(50, on);
      mounted.runtime.input.focus.focus(field());
      drain(mounted);
      const before = mounted.runtime.debugVisibleBox(field()).y;

      summary.value = 10;
      drain(mounted);
      expect(list().getProperty('scrollY')).toBe(50);
      expect(mounted.runtime.debugVisibleBox(field()).y).toBeCloseTo(before - 30, 5);
    });
  }

  it('without it, the same move still scrolls to hold the field', () => {
    const { mounted, summary, field, list } = mount(50);
    mounted.runtime.input.focus.focus(field());
    drain(mounted);

    summary.value = 10;
    drain(mounted);
    expect(list().getProperty('scrollY')).toBeCloseTo(20, 5);
  });

  it("'auto' holds the field, as no value does", () => {
    const summary = internalState(40);
    let field: UiNode | null = null;
    let list: UiNode | null = null;
    const mounted = mountRuntime(
      ScrollView(
        { width: 300, height: 200, scrollY: 50, overflowAnchor: 'auto', ref: (n: UiNode | null) => (list = n) },
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
    mounted.runtime.input.focus.focus(field!);
    drain(mounted);

    summary.value = 10;
    drain(mounted);
    expect(list!.getProperty('scrollY')).toBeCloseTo(20, 5);
  });

  it('keeps a keepInPlace hold working under it', () => {
    // The opt-out is from the focus anchor only: a node held by name is
    // held, whether it is the focused one or not.
    const { mounted, summary, field, list } = mount(50, 'list');
    mounted.runtime.input.focus.focus(field());
    drain(mounted);
    const before = mounted.runtime.debugVisibleBox(field()).y;

    mounted.runtime.services.get(ScrollService).keepInPlace(field());
    summary.value = 10;
    drain(mounted);
    expect(list().getProperty('scrollY')).toBeCloseTo(20, 5);
    expect(mounted.runtime.debugVisibleBox(field()).y).toBeCloseTo(before, 5);
  });
});
