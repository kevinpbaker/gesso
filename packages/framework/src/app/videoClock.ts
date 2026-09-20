import type { VideoClock } from 'gesso-core';

import type { AudioService } from './AudioService';

/**
 * A clip's position, taken from the sound playing beside it.
 *
 * **This is the clock inversion, and it is worth being explicit about
 * why it exists.** Everywhere else in this framework the animation
 * driver owns time: a video is a pure function of a position and the
 * position comes from a tween, which is what lets a clip be scheduled,
 * paced and stopped by exactly the machinery every other animated
 * thing uses. That arrangement is correct right up until the clip has
 * sound, and then it is exactly backwards.
 *
 * The asymmetry is in what the two media can survive. Video drops
 * frames: an application that stalled for 50ms shows the picture it
 * should be showing now and throws away the ones it missed, and nobody
 * can tell. Audio cannot do either — a gap is audible, and resampling
 * to catch up changes the pitch — so the sound plays at its own rate
 * whatever else is happening, and anything that must agree with it has
 * to follow. Which means the picture follows the sound, and a tween
 * driving the picture independently would drift against it within
 * seconds. There is no arrangement in which both lead.
 *
 * **And the sound cannot be played here.** `AudioContext` does not
 * exist on a worker, which is where this framework decodes and draws.
 * So the sound is the shell's to play — `AudioService` already does
 * exactly that, reporting where it has got to about once a second and
 * extrapolating in between on the animation driver — and what crosses
 * the thread boundary is one number. That is the whole of this file:
 * `AudioService` is already the right shape, and this is the adapter
 * that lets `videoSource` read it.
 *
 * ```ts
 * // The same file, played twice: the shell for its sound, the worker
 * // for its pictures. A `<video>` element does this internally and
 * // calls it one thing.
 * audio.load('clip.mp4', { autoplay: false });
 * Video({ src: 'clip.mp4', clock: audioClock(audio, 'clip.mp4') });
 * ```
 *
 * `source` is checked on every read, and that check is not
 * decoration: `AudioService` is one playback for the whole
 * application, so a screen that starts a podcast while this clip is
 * still mounted would otherwise drive the picture from the podcast's
 * position. A clock whose source is no longer loaded reports that it
 * is not running and holds the position it last had, which shows a
 * still frame rather than a clip that has jumped somewhere absurd.
 */
export function audioClock(audio: AudioService, source: string): VideoClock {
  let held = 0;
  let listeners = new Set<() => void>();
  let wasRunning = false;
  let subscription: { unsubscribe(): void } | null = null;

  const mine = (): boolean => audio.state.value.src === source;

  const running = (): boolean => mine() && audio.state.value.status === 'playing';

  const announce = (): void => {
    const now = running();
    if (now === wasRunning) {
      // The position moves constantly and is read rather than pushed;
      // what a listener is waiting for is the clip starting or
      // stopping, which is rare.
      return;
    }
    wasRunning = now;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    positionSeconds(): number {
      if (!mine()) {
        return held;
      }
      held = audio.state.value.position;
      return held;
    },
    get running(): boolean {
      return running();
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener);
      // Subscribed on the first listener rather than eagerly, because
      // `AudioService.state` is a `ComputedCell` and a computed with
      // no subscriber holds nothing and runs nothing.
      subscription ??= audio.state.subscribe(() => announce());
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) {
          return;
        }
        subscription?.unsubscribe();
        subscription = null;
        listeners = new Set();
      };
    }
  };
}
