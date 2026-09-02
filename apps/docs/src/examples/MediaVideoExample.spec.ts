import { describe, expect, it, vi } from 'vitest';

import type { UiNode, UiVideoSurface } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { FRAME_MS, GeneratedVideoResolver, MediaVideo } from './MediaVideoExample';

/**
 * What the video page claims, measured.
 *
 * Node has no `VideoDecoder` and no `OffscreenCanvas`, so what is
 * exercised here is everything above the decoder: the resolver's
 * sharing, the surface reaching both nodes, the position the animation
 * driver writes, and the release when a node leaves. The pictures
 * themselves are a browser's job, and the page says so.
 */

/** Promises only, because the playback here reaches the modifier through microtasks. */
async function flush(): Promise<void> {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
  }
}

function videoNodes(nodes: readonly UiNode[]): UiNode[] {
  return nodes.filter(node => node.properties.get('video') !== undefined);
}

describe('the docs video example', () => {
  it('gives two views one playback, and one surface between them', async () => {
    const resolver = new GeneratedVideoResolver();
    const ui = renderTest(createComponent(MediaVideo, { resolver }), { width: 560, height: 300 });
    await flush();
    ui.frame(0);

    // Two elements asked; the resolver handed both the playback it
    // already had, which is what makes a video survive a route change.
    expect(resolver.resolves).toBe(2);
    const showing = videoNodes(ui.allNodes());
    expect(showing).toHaveLength(2);
    expect(showing[0]!.properties.get('video')).toBe(showing[1]!.properties.get('video'));
  });

  it('advances the picture from the animation driver, a frame at a time', async () => {
    vi.useFakeTimers();
    try {
      const resolver = new GeneratedVideoResolver();
      const ui = renderTest(createComponent(MediaVideo, { resolver }), { width: 560, height: 300 });
      await flush();
      ui.frame(0);
      const surface = videoNodes(ui.allNodes())[0]!.properties.get('video') as UiVideoSurface;
      const first = surface.version;

      // Four of the clip's own frame intervals. Nothing in the playback
      // runs on a clock: the position is written by a tween, and the
      // frame due at it is the one presented.
      for (let step = 1; step <= 4; step++) {
        vi.advanceTimersByTime(FRAME_MS);
        ui.frame(step * FRAME_MS);
      }

      // The tween is paced by the rate the playback reports, so four
      // intervals of the clock are four intervals of the clip: not
      // one frame per rendered frame, and not one per millisecond.
      expect(resolver.playback!.positionMs).toBeCloseTo(4 * FRAME_MS, 5);
      expect(surface.version).toBe(first + 4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the playback when a view leaves, and the other one keeps playing', async () => {
    vi.useFakeTimers();
    try {
      const resolver = new GeneratedVideoResolver();
      const ui = renderTest(createComponent(MediaVideo, { resolver }), { width: 560, height: 300 });
      await flush();
      ui.frame(0);
      expect(resolver.releases).toBe(0);

      ui.fireEvent.click(ui.getByRole('button'));
      ui.frame(FRAME_MS);

      // `host.own` runs the release inside `removeSubtree`, so the hold
      // goes with the node rather than outliving it.
      expect(resolver.releases).toBe(1);
      const left = videoNodes(ui.allNodes());
      expect(left).toHaveLength(1);

      const surface = left[0]!.properties.get('video') as UiVideoSurface;
      const before = surface.version;
      for (let step = 2; step <= 5; step++) {
        vi.advanceTimersByTime(FRAME_MS);
        ui.frame(step * FRAME_MS);
      }
      expect(surface.version).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
