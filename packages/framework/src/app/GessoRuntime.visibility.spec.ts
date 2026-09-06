import { describe, expect, it } from 'vitest';

import { Box, Column } from '@gesso/core';
import { internalState } from '../InternalState';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';
import { AnimationService } from './AnimationService';

function drain(mounted: MountedRuntime, limit = 400): void {
  for (let i = 0; i < limit && mounted.clock.isPending; i++) {
    mounted.frame();
  }
}

/** A cell over a piece of state, which is what an animation drives. */
function cellOver(state: ReturnType<typeof internalState<number>>) {
  return {
    get value(): number {
      return state.value;
    },
    set value(next: number) {
      state.value = next;
    }
  };
}

/**
 * A hidden document is not animated.
 *
 * A browser stops `requestAnimationFrame` for one, and the render
 * worker cannot see that for itself: its clock is handed refreshes by
 * the shell, and a shell that has stopped forwarding them looks exactly
 * like one that never forwarded any — which must fall back to a timer
 * rather than freeze. So the shell says so, and the runtime acts on it.
 */
describe('visibility', () => {
  it('lands a movement nobody can see rather than freezing it half-way', () => {
    // The waste this exists to stop is animation: a video pacing a
    // hidden tab at sixty, drawing for nobody. Suppressing the ticks is
    // narrower than stopping the scheduler and is the whole of it.
    //
    // But a hidden page still paints, so an animation left frozen is
    // painted frozen, and for an entrance that means an element drawn
    // at the `opacity: 0` it was about to rise from. So a movement that
    // would have been snapped by a reduced-motion preference is snapped
    // by a hidden document too: it costs the same nothing, and the page
    // holds the picture it was going to hold rather than a hole where
    // an element belongs.
    const target = internalState(0);
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width: 10, height: 10 })));
    drain(mounted);

    const animations = mounted.runtime.services.get(AnimationService);
    const cell = cellOver(target);
    animations.spring(cell, 100, { spring: 'snappy' });
    mounted.runtime.setVisible(false);
    drain(mounted);

    expect(target.value).toBe(100);
    // Landed, not left running: a hidden page that had to be woken to
    // finish a movement would be paying frames for it after all.
    expect(animations.animationFor(cell)).toBeUndefined();
  });

  it('freezes a movement that is the information, and resumes it after', () => {
    // `keep` is how an animation says its movement is what it is for. A
    // spinner that stops turning is not a calmer spinner, it is a
    // spinner saying work has stopped, so this one is neither run nor
    // landed while hidden: it waits where it stood.
    const target = internalState(0);
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width: 10, height: 10 })));
    drain(mounted);

    const animations = mounted.runtime.services.get(AnimationService);
    animations.spring(cellOver(target), 100, { spring: 'snappy', reducedMotion: 'keep' });
    mounted.runtime.setVisible(false);
    drain(mounted);
    expect(target.value).toBeLessThan(100);

    mounted.runtime.setVisible(true);
    drain(mounted);
    expect(target.value).toBeCloseTo(100, 0);
  });

  it('still paints a change that genuinely happened while hidden', () => {
    // The first frame is not the first *useful* paint: an image
    // finishing its decode, or a patch arriving from the application
    // thread, lands after it. A route loaded hidden and stopped after
    // one frame held a picture with every photograph missing.
    const width = internalState(10);
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width, height: 10 })));
    drain(mounted);
    const drawn = mounted.frames.length;

    mounted.runtime.setVisible(false);
    width.value = 60;
    drain(mounted);
    expect(mounted.frames.length).toBeGreaterThan(drawn);
  });

  it('draws when nothing ever told it, which is every spec and headless graph', () => {
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width: 10, height: 10 })));
    while (mounted.clock.isPending) {
      mounted.frame();
    }
    expect(mounted.frames.length).toBeGreaterThan(0);
  });
});
