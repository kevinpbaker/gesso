import { describe, expect, it } from 'vitest';

import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';
import { Box, Column, UiManualFrameClock, type UiElement } from 'gesso-core';

/**
 * Wheel containment, through a real runtime.
 *
 * `UiWheelController`'s specs build the tree they ask about, so their
 * root is the app's root. A mounted app's is not: the runtime wraps it
 * in a stack beside the overlay layer, and `overscrollBehavior="contain"`
 * on the app's own top element — where its documentation says to put it
 * — was read from the wrapper and never took effect. Only a mounted
 * runtime can say whether the shell is told to keep a wheel.
 */
describe('GessoRuntime wheel containment', () => {
  function mount(root: UiElement) {
    let clock!: UiManualFrameClock;
    const runtime = new GessoRuntime({
      root,
      canvas: mockCanvas(300, 300),
      width: 300,
      height: 300,
      clock: callback => (clock = new UiManualFrameClock(callback))
    });
    runtime.start();
    let now = 0;
    const frame = () => {
      if (clock.isPending) {
        clock.tick((now += 16));
      }
    };
    frame();
    return { runtime, frame };
  }

  const EVERYTHING = { up: true, down: true, left: true, right: true };
  const NOTHING = { up: false, down: false, left: false, right: false };

  it('keeps every wheel for an app whose root contains overscroll', () => {
    // A canvas the app pans and zooms itself: nothing in it scrolls.
    const { runtime } = mount(
      Box(
        { width: 300, height: 300, overscrollBehavior: 'contain' },
        Box({ width: 300, height: 300, onWheel: () => {} })
      )
    );

    // Reported before anything is hovered, which is what the shell
    // decides the first wheel of a burst from.
    expect(runtime.scrollability).toEqual(EVERYTHING);
    // And the wheel itself, which is what the main-thread shell reads.
    expect(runtime.input.wheel.wheel(50, 50, 0, -100).consumed).toBe(true);
    runtime.dispose();
  });

  it('lets every wheel out for an app that does not', () => {
    const { runtime } = mount(Box({ width: 300, height: 300 }, Box({ width: 300, height: 300, onWheel: () => {} })));

    expect(runtime.scrollability).toEqual(NOTHING);
    expect(runtime.input.wheel.wheel(50, 50, 0, -100).consumed).toBe(false);
    runtime.dispose();
  });

  it('keeps the wheel over a contained canvas and lets it out beside it', () => {
    // A canvas embedded in a larger app, which pans on the wheel itself,
    // above a strip that should let a wheel reach the page.
    const { runtime, frame } = mount(
      Column(
        { width: 300, height: 300 },
        Box({ width: 300, height: 200, overscrollBehavior: 'contain', onWheel: () => {} }),
        Box({ width: 300, height: 100 })
      )
    );

    runtime.input.pointer.pointerMove(50, 50, 0);
    frame();
    expect(runtime.scrollability).toEqual(EVERYTHING);
    expect(runtime.input.wheel.wheel(50, 50, 0, -100).consumed).toBe(true);

    runtime.input.pointer.pointerMove(50, 250, 0);
    frame();
    expect(runtime.scrollability).toEqual(NOTHING);
    expect(runtime.input.wheel.wheel(50, 250, 0, -100).consumed).toBe(false);
    runtime.dispose();
  });
});
