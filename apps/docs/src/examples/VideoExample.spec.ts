import { describe, expect, it, vi } from 'vitest';

import { createComponent } from 'gesso-framework';
import { isVideoSurface, type UiNode, type UiVideoSurface } from 'gesso-core';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { ClipResolver, Player } from './VideoExample';

const PLAYING = 'A generated clip, playing';
const STILL = 'A generated clip, held on one frame';
const FAILED = 'A clip that failed';

// The decoder goes in through the `media` option, exactly as the
// page's worker entry declares it with `useMedia`: a `Video` asks for
// its playback the moment it is built.
const mount = () =>
  renderTest(createComponent(Player, {}), { width: 520, height: 260, media: { videoResolver: new ClipResolver() } });

/** The surface a node is carrying, or a failure that says so. */
function surfaceOf(node: UiNode): UiVideoSurface {
  const value = node.properties.get('video');
  if (!isVideoSurface(value)) {
    throw new Error('The node is not carrying a video surface.');
  }
  return value;
}

/**
 * The page claims three things about `Video`: that the playback
 * reaches the node as one surface whose identity does not change, that
 * frames are moved on by the animation driver at the clip's own rate
 * rather than the application's, and that `autoplay={false}` shows one
 * frame and then stops. The frames themselves are pixels and only a
 * browser can say they arrived; what a spec can measure is that the
 * picture was asked to change, which is `version` on the surface.
 */
describe('the docs video example', () => {
  it('names each video by its alt text', async () => {
    const ui = mount();
    await ui.settle();

    expect(ui.getByRole('image', { name: PLAYING })).toHaveSemantics({ role: 'image', name: PLAYING });
    expect(ui.getAllByRole('image')).toHaveLength(3);
  });

  it('keeps the placeholder tint on a source the resolver refuses', async () => {
    const ui = mount();
    const failed = ui.getByRole('image', { name: FAILED });
    const playing = ui.getByRole('image', { name: PLAYING });

    // Every box is tinted before anything resolves, each in its own
    // colour: the theme's for the two that will play, the caller's for
    // the one that will not.
    expect(playing.properties.get('backgroundColor')).toBe('controlBackground');
    expect(failed.properties.get('backgroundColor')).toBe('danger');

    await ui.settle();

    // Playing: the tint goes, so no colour sits behind the frames.
    expect(playing.properties.get('backgroundColor')).toBeUndefined();
    // Refused: no surface ever arrives, and the tinted box is the whole
    // of what the reader is shown.
    expect(failed.properties.get('video')).toBeUndefined();
    expect(failed.properties.get('backgroundColor')).toBe('danger');
  });

  it('puts one surface on the node and keeps it there', async () => {
    const ui = mount();
    const playing = ui.getByRole('image', { name: PLAYING });

    // Resolving is a promise, so nothing is on the node yet.
    expect(playing.properties.get('video')).toBeUndefined();
    await ui.settle();

    const surface = surfaceOf(playing);
    expect(surface.width).toBe(240);
    expect(surface.height).toBe(135);
    // The identity is the point: a texture cache keys on this object
    // and re-uploads into the texture it already has.
    expect(surfaceOf(playing)).toBe(surface);
  });

  it("moves the playing clip on from the frame clock, at the clip's own rate", async () => {
    // The clip's frames are due 100 ms apart, and the runtime waits
    // that out with a timer rather than taking frames it would draw
    // nothing on. So the timers have to be fake from the start: a
    // timer armed under the real ones never fires here.
    vi.useFakeTimers();
    try {
      const ui = mount();
      await vi.advanceTimersByTimeAsync(0);

      const playing = surfaceOf(ui.getByRole('image', { name: PLAYING }));
      const still = surfaceOf(ui.getByRole('image', { name: STILL }));

      // Both presented as they resolved, playing or not: a video
      // showing nothing looks like one that failed, and the first
      // frame is there to be shown the moment the decoder is ready.
      // That is the whole of what a poster is for a clip that has one
      // of its own.
      expect(still.version).toBe(1);
      expect(playing.version).toBe(1);

      for (let time = 100; time <= 500; time += 100) {
        await vi.advanceTimersByTimeAsync(100);
        ui.frame(time);
      }

      // One new picture per clip frame over half a second, and the
      // still one has not moved. Five rather than six, because the
      // first of those frames is the one the tween *begins* on: it
      // starts at zero, which is the picture already on the surface,
      // so the clip shows its first frame once rather than twice.
      expect(playing.version).toBe(5);
      expect(still.version).toBe(1);

      // Nothing is due for another 100 ms: the video declares its own
      // rate, so it does not ask the application for a frame it would
      // present the same picture on.
      expect(ui.clock.isPending).toBe(false);
      await vi.advanceTimersByTimeAsync(50);
      expect(ui.clock.isPending).toBe(false);
      await vi.advanceTimersByTimeAsync(50);
      expect(ui.clock.isPending).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
