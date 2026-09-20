import { describe, expect, it } from 'vitest';

import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';
import { Box, Column, noKeyModifiers, UiManualFrameClock, type UiPointerDevice } from 'gesso-core';

const FINGER: UiPointerDevice = { id: 5, kind: 'touch' };

/**
 * Touch scrolling, through a real runtime.
 *
 * The unit specs drive `UiTouchScroller` against a harness sink; this
 * one is here because the wiring is the part that can silently not
 * exist. The scroller listens at the root, and the root is built by the
 * runtime — so nothing but a mounted runtime can say whether a finger
 * on a real scroll container moves anything.
 */
describe('GessoRuntime touch scrolling', () => {
  function mount() {
    let clock!: UiManualFrameClock;
    const pressed: number[] = [];
    const clicked: number[] = [];
    const rows = Array.from({ length: 50 }, (_, i) =>
      Box({ height: 20, flexShrink: 0, onPointerDown: () => pressed.push(i), onClick: () => clicked.push(i) })
    );
    const runtime = new GessoRuntime({
      // 200 wide, 100 tall, 1000 of content: maxScroll 900.
      root: Column({ width: 200, height: 100, overflow: 'scroll' }, ...rows),
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
    const settle = (limit = 400) => {
      for (let i = 0; i < limit && clock.isPending; i++) {
        clock.tick((now += 16));
      }
    };
    frame();
    return { runtime, frame, settle, list: runtime.debugRoot(), pressed, clicked };
  }

  it('drags the content of a real scroll container', () => {
    const { runtime, frame, list } = mount();

    runtime.input.pointer.pointerDown(50, 80, 1, noKeyModifiers(), FINGER);
    runtime.input.pointer.pointerMove(50, 40, 1, noKeyModifiers(), FINGER);
    frame();

    expect(list.getProperty('scrollY')).toBe(40);
    runtime.dispose();
  });

  it('leaves the same drag from a mouse alone', () => {
    const { runtime, frame, list } = mount();

    runtime.input.pointer.pointerDown(50, 80, 1, noKeyModifiers());
    runtime.input.pointer.pointerMove(50, 40, 1, noKeyModifiers());
    frame();

    expect(list.getProperty('scrollY') ?? 0).toBe(0);
    runtime.dispose();
  });

  it('does not click the row the finger scrolled off', () => {
    const { runtime, frame, pressed, clicked } = mount();
    // A press still reaches the row — that is how a tap works — but the
    // pan claims the gesture, so no Click follows it.
    runtime.input.pointer.pointerDown(50, 30, 1, noKeyModifiers(), FINGER);
    runtime.input.pointer.pointerMove(50, 0, 1, noKeyModifiers(), FINGER);
    runtime.input.pointer.pointerUp(50, 0, 0, noKeyModifiers(), FINGER);
    frame();

    expect(pressed.length).toBe(1);
    expect(clicked).toEqual([]);
    runtime.dispose();
  });

  it('still taps the row a finger pressed and released without moving', () => {
    const { runtime, frame, clicked } = mount();

    runtime.input.pointer.pointerDown(50, 30, 1, noKeyModifiers(), FINGER);
    // A tap wanders; 6px is inside the touch slop and outside the mouse one.
    runtime.input.pointer.pointerMove(53, 36, 1, noKeyModifiers(), FINGER);
    runtime.input.pointer.pointerUp(53, 36, 0, noKeyModifiers(), FINGER);
    frame();

    expect(clicked).toEqual([1]);
    runtime.dispose();
  });

  it('stops listening once the runtime is disposed', () => {
    const { runtime, frame, list } = mount();
    runtime.dispose();

    runtime.input.pointer.pointerDown(50, 80, 1, noKeyModifiers(), FINGER);
    runtime.input.pointer.pointerMove(50, 40, 1, noKeyModifiers(), FINGER);
    frame();

    expect(list.getProperty('scrollY') ?? 0).toBe(0);
  });
});
