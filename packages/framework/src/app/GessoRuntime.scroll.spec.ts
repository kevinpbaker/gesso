import { describe, expect, it } from 'vitest';

import { Box, Button, Column, ScrollView, noKeyModifiers, scrollPosition, type ScrollOffset } from '@gesso/core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * Reporting a scroll container's offset.
 *
 * The interesting claim is not the arithmetic — the engine's own specs
 * cover clamping — but that an application is told at all. A scroll
 * moves everything *inside* a container and leaves the container's own
 * box exactly where it was, so watching the box alone hears nothing;
 * that is why `LayoutNotifier` compares the offset too.
 */
function drain(mounted: MountedRuntime, limit = 200): void {
  let frames = 0;
  while (mounted.clock.isPending && frames < limit) {
    frames++;
    mounted.frame();
  }
}

describe('scrollPosition', () => {
  it('reports a container that scrolled, whose own box never moved', () => {
    const offset = internalState(0);
    const seen: ScrollOffset[] = [];
    const mounted = mountRuntime(
      ScrollView(
        {
          width: 200,
          height: 100,
          scrollY: offset,
          modifiers: [scrollPosition({ onChange: at => seen.push(at) })]
        },
        Column({ width: 200 }, Box({ width: 200, height: 600 }))
      )
    );
    drain(mounted);
    seen.length = 0;

    offset.value = 120;
    drain(mounted);
    expect(seen.map(at => at.y)).toEqual([120]);

    offset.value = 260;
    drain(mounted);
    expect(seen.map(at => at.y)).toEqual([120, 260]);
  });

  it('reports the offset the engine settled on, not the one that was asked for', () => {
    // 600 of content in a 100-tall viewport clamps at 500. A wheel
    // writes the property unclamped, so the property and the truth
    // disagree; what is reported is the truth.
    const offset = internalState(0);
    const seen: ScrollOffset[] = [];
    const mounted = mountRuntime(
      ScrollView(
        {
          width: 200,
          height: 100,
          scrollY: offset,
          modifiers: [scrollPosition({ onChange: at => seen.push(at) })]
        },
        Column({ width: 200 }, Box({ width: 200, height: 600 }))
      )
    );
    drain(mounted);
    seen.length = 0;

    offset.value = 9000;
    drain(mounted);
    expect(seen.map(at => at.y)).toEqual([500]);
  });

  it('does not scroll a control into view because it was clicked', () => {
    // Focus reveals its target, which keyboard navigation needs. A
    // press does not: the person can see what they pressed — it is
    // under their cursor — and revealing it scrolls the page out from
    // under a pointer that is still resting there. A tall control
    // that is only partly visible moves most of the screen, which
    // looks like the thing they clicked jumping away from them.
    const seen: ScrollOffset[] = [];
    const mounted = mountRuntime(
      ScrollView(
        {
          width: 200,
          height: 100,
          modifiers: [scrollPosition({ onChange: at => seen.push(at) })]
        },
        Column(
          { width: 200 },
          Box({ width: 200, height: 90 }),
          // Taller than the viewport and mostly below it, so a reveal
          // would be a large scroll rather than a nudge.
          Button({ label: 'open', width: 200, height: 200 })
        )
      )
    );
    drain(mounted);
    seen.length = 0;

    mounted.runtime.input.pointer.pointerDown(100, 95, 1, noKeyModifiers());
    mounted.runtime.input.pointer.pointerUp(100, 95, 0, noKeyModifiers());
    drain(mounted);
    expect(seen).toEqual([]);

    // The keyboard still reveals, which is the case the behaviour
    // exists for.
    mounted.runtime.input.focus.blur();
    mounted.runtime.input.focus.focusNext();
    drain(mounted);
    expect(seen.map(at => at.y)).toEqual([190]);
  });

  it('reports the end of a scroll once, however many frames it took', () => {
    // What persisting a position wants. A smoothed wheel changes the
    // offset on every frame it animates, so a route remembering where
    // its list was would otherwise write that value ten or twenty
    // times per notch to answer one question nobody reads until later.
    const offset = internalState(0);
    const changes: number[] = [];
    const settled: number[] = [];
    const mounted = mountRuntime(
      ScrollView(
        {
          width: 200,
          height: 100,
          scrollY: offset,
          modifiers: [
            scrollPosition({
              onChange: at => changes.push(at.y),
              onSettled: at => settled.push(at.y)
            })
          ]
        },
        Column({ width: 200 }, Box({ width: 200, height: 600 }))
      )
    );
    drain(mounted);
    changes.length = 0;
    settled.length = 0;

    offset.value = 120;
    drain(mounted);
    offset.value = 260;
    drain(mounted);

    expect(changes).toEqual([120, 260]);
    // Once per stretch of movement, not once per change.
    expect(settled).toEqual([120, 260]);
  });

  it('says nothing on a frame that only moved the container', () => {
    const height = internalState(300);
    const offset = internalState(40);
    const seen: ScrollOffset[] = [];
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 800 },
        Box({ width: 200, height }),
        ScrollView(
          {
            width: 200,
            height: 100,
            scrollY: offset,
            modifiers: [scrollPosition({ onChange: at => seen.push(at) })]
          },
          Column({ width: 200 }, Box({ width: 200, height: 600 }))
        )
      )
    );
    drain(mounted);
    seen.length = 0;

    // The spacer above grows, so the scroller's own box moves down the
    // screen — but it has not scrolled, and a listener that confused
    // the two would report a scroll for every layout that pushed it.
    for (const next of [340, 380, 420]) {
      height.value = next;
      drain(mounted);
    }
    expect(seen).toEqual([]);
  });
});
