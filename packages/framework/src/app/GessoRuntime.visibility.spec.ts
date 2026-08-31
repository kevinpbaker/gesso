import { describe, expect, it } from 'vitest';

import { Box, Column } from '@gesso/core';
import { internalState } from '../InternalState';
import { mountRuntime } from './RuntimeTestUtils';

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
  it('stops scheduling frames while the document is hidden', () => {
    const size = internalState(10);
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width: size, height: 10 })));
    while (mounted.clock.isPending) {
      mounted.frame();
    }
    const drawn = mounted.frames.length;

    mounted.runtime.setVisible(false);
    // A change that would normally arm a frame arms nothing.
    size.value = 40;
    expect(mounted.clock.isPending).toBe(false);
    expect(mounted.frames.length).toBe(drawn);

    // And the work is not lost: coming back draws it.
    mounted.runtime.setVisible(true);
    expect(mounted.clock.isPending).toBe(true);
    while (mounted.clock.isPending) {
      mounted.frame();
    }
    expect(mounted.frames.length).toBeGreaterThan(drawn);
  });

  it('still draws its first frame when it starts out hidden', async () => {
    // A canvas keeps whatever was last painted on it, so stopping
    // before anything has been is the difference between a tab that is
    // idle and one that shows nothing until a frame lands after it is
    // looked at. A page opened in a background tab is exactly this: it
    // never fires `visibilitychange`, so the shell reports hidden at
    // attach and the runtime is told before it has drawn.
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width: 10, height: 10 })), {
      start: false
    });
    mounted.runtime.setVisible(false);
    mounted.runtime.start();
    while (mounted.clock.isPending) {
      mounted.frame();
    }
    expect(mounted.frames.length).toBe(1);

    // And then it stops, rather than going on drawing for nobody.
    await Promise.resolve();
    expect(mounted.clock.isPending).toBe(false);
  });

  it('draws when nothing ever told it, which is every spec and headless graph', () => {
    const mounted = mountRuntime(Column({ width: 200, height: 200 }, Box({ width: 10, height: 10 })));
    while (mounted.clock.isPending) {
      mounted.frame();
    }
    expect(mounted.frames.length).toBeGreaterThan(0);
  });
});
