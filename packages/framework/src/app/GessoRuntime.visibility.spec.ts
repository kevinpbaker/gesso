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

/**
 * A hidden document is not drawn.
 *
 * A browser stops `requestAnimationFrame` for one, and the render
 * worker cannot see that for itself: its clock is handed refreshes by
 * the shell, and a shell that has stopped forwarding them looks exactly
 * like one that never forwarded any — which must fall back to a timer
 * rather than freeze. So the shell says so, and the runtime acts on it.
 */
describe('visibility', () => {
  it('runs no animation while the document is hidden, and resumes after', () => {
    // The waste this exists to stop is animation: a video pacing a
    // hidden tab at sixty, drawing for nobody. Suppressing the ticks is
    // narrower than stopping the scheduler and is the whole of it.
    const target = internalState(0);
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width: 10, height: 10 })));
    drain(mounted);

    mounted.runtime.services.get(AnimationService).spring(
      {
        get value() {
          return target.value;
        },
        set value(next: number) {
          target.value = next;
        }
      },
      100,
      { spring: 'snappy' }
    );
    mounted.runtime.setVisible(false);
    drain(mounted);
    // Frozen where it stood rather than running on.
    const frozen = target.value;
    expect(frozen).toBeLessThan(100);

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
