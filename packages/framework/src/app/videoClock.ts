import type { VideoClock } from 'gesso-core';

import type { AudioService } from './AudioService';
import { epochNow } from './worker/RenderWorkerProtocol';

/**
 * How far past the last position it saw the clock may run on its own.
 *
 * `AudioService` writes its position ten times a second, and a picture
 * that read only that would move in tenths. So the clock runs on from
 * each new value at the playing rate, up to a little more than one of
 * those steps, and no further: a position that has stopped arriving
 * means the sound has stopped, whatever the status still says.
 */
const RUN_ON_LIMIT_S = 0.15;

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
 *
 * **The clip's own controls drive the sound.** `play`, `pause` and
 * `seek` go to `AudioService`, so the play button and the scrubber on
 * a `Video` move the sound and the picture follows it. They are kept
 * to this source: `pause` and `seek` leave another source's playback
 * alone, and `play` on a clip whose sound was replaced loads it again
 * from where the picture was held.
 *
 * **So do its settings.** The clip's rate, loop and volume go to
 * `AudioService` while this source is loaded. A `load` puts the rate
 * and the loop back to their defaults, so they are given again each
 * time this source is loaded, by this clock or by the application.
 * The volume is given again only once the clip has set one.
 *
 * **The position is smooth.** `AudioService` moves its position in
 * steps of a tenth of a second, and this clock runs on between them at
 * the playing rate, so a picture that checks itself against it every
 * frame sees a position that is never more than about a frame behind.
 */
export function audioClock(audio: AudioService, source: string): VideoClock {
  let held = 0;
  let listeners = new Set<() => void>();
  let wasRunning = false;
  let wasLoading = false;
  let subscription: { unsubscribe(): void } | null = null;
  let loop = false;
  let rate = 1;
  let level: { readonly volume: number; readonly muted: boolean } | null = null;
  /** The last position `AudioService` wrote, and when this clock first saw it. */
  let seen = Number.NaN;
  let seenAt = 0;

  const mine = (): boolean => audio.state.value.src === source;

  const running = (): boolean => mine() && audio.state.value.status === 'playing';

  const applyVolume = (): void => {
    if (level !== null) {
      audio.setVolume(level.muted ? 0 : level.volume);
    }
  };

  const apply = (): void => {
    audio.setLoop(loop);
    audio.setRate(rate);
    applyVolume();
  };

  /**
   * Gives the settings again when this source has just been loaded.
   *
   * Every start of a load counts, not only the first time the source
   * becomes this one's, because the application may load the same
   * source again and a load resets the rate and the loop. A wait for
   * data mid-track also reads as `loading` and is answered the same
   * way, which is harmless: each request sets a value, so giving it
   * twice changes nothing.
   */
  const reapply = (): void => {
    const loading = mine() && audio.state.value.status === 'loading';
    if (loading && !wasLoading) {
      apply();
    }
    wasLoading = loading;
  };

  const announce = (): void => {
    reapply();
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
      const state = audio.state.value;
      const now = epochNow();
      if (state.position !== seen) {
        seen = state.position;
        seenAt = now;
      }
      const runOn = state.status === 'playing' ? Math.min(RUN_ON_LIMIT_S, ((now - seenAt) / 1000) * state.rate) : 0;
      const at = seen + runOn;
      held = Number.isFinite(state.duration) ? Math.min(at, state.duration) : at;
      return held;
    },
    get running(): boolean {
      return running();
    },
    play(): void {
      if (mine()) {
        audio.play();
        return;
      }
      // Something else took the one playback, so pressing play on this
      // clip takes it back, from where the picture was held.
      audio.load(source, { autoplay: true });
      // A subscriber has usually given the settings already; this is
      // for a clock nobody is listening to, and does nothing otherwise.
      reapply();
      if (held > 0) {
        audio.seek(held);
      }
    },
    pause(): void {
      // Only this clip's sound. Pausing a podcast because a clip that
      // is not playing was told to pause would be a surprise.
      if (mine()) {
        audio.pause();
      }
    },
    seek(seconds: number): void {
      held = seconds;
      if (mine()) {
        audio.seek(seconds);
      }
    },
    setRate(next: number): void {
      rate = next;
      if (mine()) {
        audio.setRate(rate);
      }
    },
    setLoop(next: boolean): void {
      loop = next;
      if (mine()) {
        audio.setLoop(loop);
      }
    },
    setVolume(volume: number, muted: boolean): void {
      level = { volume, muted };
      if (mine()) {
        applyVolume();
      }
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
