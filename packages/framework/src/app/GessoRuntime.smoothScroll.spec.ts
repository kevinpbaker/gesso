import { describe, expect, it } from 'vitest';

import {
  Box,
  Column,
  DirtyFlags,
  UiManualFrameClock,
  UiWheelDeltaMode,
  noKeyModifiers,
  scrollbarThumb
} from '@gesso/core';
import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';

/**
 * Smooth scrolling, asserted on the container's offset over successive
 * frames.
 *
 * A wheel notch is one large step with nothing in between, and that is
 * the whole of what this animates. Everything else that moves a scroll
 * container — a scrollbar thumb drag, a focus reveal, a caret reveal,
 * a lazy list's anchor correction, a bound `scrollY` — still lands at
 * once, and most of what follows is about that boundary rather than
 * about the animation.
 */
describe('GessoRuntime smooth scrolling', () => {
  /** 200x100 over 1000 of content: the range is [0, 900]. */
  function mount(scrollBehavior?: 'instant' | 'smooth') {
    let clock!: UiManualFrameClock;
    const rows = Array.from({ length: 50 }, () => Box({ height: 20, flexShrink: 0 }));
    const runtime = new GessoRuntime({
      root: Column({ width: 200, height: 100, overflow: 'scroll', scrollBehavior }, ...rows),
      canvas: mockCanvas(300, 300),
      width: 300,
      height: 300,
      clock: callback => (clock = new UiManualFrameClock(callback))
    });
    runtime.start();
    // Time has to advance: a spring integrates against it, and a clock
    // that ticks at zero forever never moves.
    let now = 0;
    const frame = (): void => {
      if (clock.isPending) {
        clock.tick((now += 16));
      }
    };
    const drain = (limit = 400): void => {
      for (let i = 0; i < limit && clock.isPending; i++) {
        clock.tick((now += 16));
      }
    };
    frame();
    const list = runtime.debugRoot();
    const offset = (): number => runtime['engine'].recordFor(list)!.scrollY;
    /** Chrome reports `wheelDeltaY` in multiples of 120 for a detent. */
    const notch = (dy: number): void =>
      void runtime.input.wheel.wheel(50, 50, 0, dy, noKeyModifiers(), UiWheelDeltaMode.Pixel, -120);
    /** A precision device: a delta that is not a whole detent. */
    const precise = (dy: number): void =>
      void runtime.input.wheel.wheel(50, 50, 0, dy, noKeyModifiers(), UiWheelDeltaMode.Pixel, -7);
    return { runtime, list, frame, drain, offset, notch, precise };
  }

  it('animates a notched wheel instead of jumping', () => {
    const { frame, drain, offset, notch } = mount();
    notch(100);

    // The first frame a spring runs on writes where it starts, so what
    // says "not a jump" is that the notch has not arrived yet.
    frame();
    expect(offset()).toBeLessThan(100);
    frame();
    frame();
    const partway = offset();
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(100);

    drain();
    expect(offset()).toBeCloseTo(100, 0);
  });

  it('leaves a precision device alone, because it is already smooth', () => {
    // A trackpad delivers an inertial stream from the OS already;
    // animating it would lay an inertia curve over one.
    const { frame, offset, precise } = mount();
    precise(40);
    frame();
    expect(offset()).toBe(40);
  });

  it('leaves a raw dispatch alone, which is what keeps the older specs true', () => {
    // Thirteen existing tests wheel and then assert an offset with no
    // frame, or one frame, in between. They keep passing because a
    // dispatch that names no `wheelDeltaY` is not evidence of a detent
    // — which is a property worth pinning rather than relying on.
    const { runtime, frame, offset } = mount();
    runtime.input.wheel.wheel(50, 50, 0, 100);
    frame();
    expect(offset()).toBe(100);
  });

  it('adds a notch to where the scroll is going, not to where it is', () => {
    // The accumulator has to be the pending destination. Adding to the
    // moving position instead makes every notch after the first travel
    // less than a notch, which is the classic under-shoot.
    const { frame, drain, offset, notch } = mount();
    notch(100);
    frame();
    notch(100);
    notch(100);

    drain();
    expect(offset()).toBeCloseTo(300, 0);
  });

  it('clamps the destination to the content', () => {
    const { drain, offset, notch } = mount();
    for (let i = 0; i < 20; i++) {
      notch(100);
    }
    drain();
    expect(offset()).toBeCloseTo(900, 0);
  });

  it('opts out for a container that asked to be instant', () => {
    const { frame, offset, notch } = mount('instant');
    notch(100);
    frame();
    expect(offset()).toBe(100);
  });

  it('stands down when something else moves the container', () => {
    // A bound `scrollY` emitting, or a component revealing a row. The
    // programmatic write wins rather than being dragged back to a
    // destination chosen before it.
    const { runtime, list, frame, drain, offset, notch } = mount();
    notch(800);
    frame();
    frame();
    expect(offset()).toBeGreaterThan(0);

    // The path a bound `scrollY` takes, which marks the node dirty —
    // a bare `setProperty` would not arm the frame that reveals it.
    runtime['graph'].updateNodeProperty(list, 'scrollY', 20, DirtyFlags.Transform);
    drain();
    expect(offset()).toBe(20);
  });

  it('leaves a scrollbar thumb drag instant, because it reads the offset back', () => {
    // A drag recomputes an absolute target from pointer travel on every
    // move and expresses it as a delta from the current offset. With an
    // animation in flight that current value is a position the
    // container is only passing through, so the drag would chase
    // itself — this one has to land at once, and not merely for feel.
    const { runtime, frame, offset, list } = mount();
    const bar = scrollbarThumb(runtime['engine'].recordFor(list)!, 'y')!;
    runtime.input.pointer.pointerDown(bar.thumb.x + 2, bar.thumb.y + 2, 1, noKeyModifiers());
    runtime.input.pointer.pointerMove(bar.thumb.x + 2, bar.thumb.y + 12, 1, noKeyModifiers());
    frame();
    const dragged = offset();
    expect(dragged).toBeGreaterThan(0);
    // Already there: no frames were needed to arrive.
    runtime.input.pointer.pointerUp(bar.thumb.x + 2, bar.thumb.y + 12, 0, noKeyModifiers());
    expect(offset()).toBe(dragged);
  });

  it('arms no frames under reduced motion, and lands at once', () => {
    // The spring's default policy is `snap`, so the driver takes the
    // target in the caller's turn and never enters its running set.
    const { runtime, frame, offset, notch } = mount();
    runtime.setReducedMotion(true);
    frame();
    notch(100);
    frame();
    expect(offset()).toBe(100);
  });
});
