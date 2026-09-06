import { combineLatest, map, type Observable, Subject } from 'rxjs';

import { linear } from '@gesso/core';

import { internalState } from '../InternalState';
import type { AnimationService } from './AnimationService';
import { epochNow } from './worker/RenderWorkerProtocol';

/**
 * Where a playback stands, as the shell last reported it.
 *
 * A *sample*, not a stream: the shell sends one whenever the element
 * changes state and otherwise about once a second, and `AudioService`
 * moves `position` forward between samples on the animation driver.
 * That keeps the message rate at one a second while a seek bar moves
 * every frame, the same arrangement `decisions/0038` uses for video
 * time.
 */
export interface AudioSample {
  readonly status: AudioStatus;
  /** Seconds into the track, as of `at`. */
  readonly position: number;
  /** Seconds, or `NaN` until the element knows. */
  readonly duration: number;
  /** Seconds: the end of the buffered range that holds `position`. */
  readonly buffered: number;
  /** When the shell took the sample, on the epoch clock both threads share (`epochNow`). */
  readonly at: number;
  /** What went wrong, for `error`, or why a play was refused, for `paused`. */
  readonly error?: string;
}

/**
 *   - `idle`: nothing loaded.
 *   - `loading`: a source is set and the element is fetching or
 *     stalled; the position does not advance.
 *   - `playing`, `paused`, `ended`: what they say.
 *   - `error`: the element gave up on this source.
 */
export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

/** What the render thread asks the shell's audio element to do. */
export type AudioRequest =
  | { readonly type: 'load'; readonly src: string; readonly autoplay: boolean }
  /**
   * Start buffering the source that will play next, on a second
   * element, so the change when it arrives is gapless.
   *
   * A hint and not a command: nothing plays, nothing is reported, and a
   * `load` of some other source ignores it. A `load` of exactly this
   * source is what redeems it. An empty string clears it.
   */
  | { readonly type: 'preload'; readonly src: string }
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'seek'; readonly seconds: number }
  | { readonly type: 'volume'; readonly level: number }
  | { readonly type: 'metadata'; readonly metadata: AudioMetadata | null };

/**
 * What the platform's own controls asked for: the keyboard's media
 * keys, the lock screen, the OS media overlay. Play and pause are
 * carried out by the shell on the element itself and reported back as
 * a sample; `next` and `previous` mean nothing to an element, so they
 * come here for the application to answer.
 */
export type AudioAction = 'play' | 'pause' | 'next' | 'previous';

/** What the OS shows for the playing track, through the Media Session API. */
export interface AudioMetadata {
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
  /** A square picture's url. */
  readonly artwork?: string;
}

/** The sample, with the position moved to now and the source it is for. */
export interface AudioState {
  readonly status: AudioStatus;
  readonly position: number;
  readonly duration: number;
  readonly buffered: number;
  readonly src: string | null;
  readonly error?: string;
}

const IDLE: AudioSample = { status: 'idle', position: 0, duration: NaN, buffered: 0, at: 0 };

/** How often the extrapolated position is written between samples. Ten a second is smooth on a seek bar and cheap. */
const POSITION_STEP_MS = 100;
/** How far to extrapolate a playback whose duration the element has not reported yet. */
const UNKNOWN_DURATION_HORIZON_S = 24 * 60 * 60;

/**
 * Sound, as a component reaches it.
 *
 * No worker can make a sound: `HTMLAudioElement` and `AudioContext`
 * exist only on a thread with a window. So the element lives on the
 * shell, as a *sink* behind a handful of messages, in the way the shell
 * already answers `clipboard` and `openUrl`, and this store is its
 * client on the render thread. Every runtime registers one, like
 * `ShellService`; being a store keeps the rule that components reach
 * the outside world through actions only, and gives a desktop shell one
 * place to bind a native player.
 *
 * Time is the interesting part. The shell samples the element on state
 * changes and once a second; between samples `position` is driven by a
 * linear tween on the animation driver, so the seek bar moves at the
 * frame rate while the barrier carries one small message a second. A
 * sample stops the tween and restarts it from the truth, which is also
 * what corrects any drift. Nothing here decides what to play next: the
 * application does, from `state` and `actions`.
 */
export class AudioService {
  private handler: ((request: AudioRequest) => void) | null = null;
  private animations: AnimationService | null = null;
  private readonly sample = internalState<AudioSample>(IDLE);
  private readonly source = internalState<string | null>(null);
  private readonly position = internalState(0);
  private readonly actionSubject = new Subject<AudioAction>();

  /** The playback, with the position moved to now. */
  readonly state: Observable<AudioState> = combineLatest([this.sample, this.source, this.position]).pipe(
    map(([sample, src, position]) => ({
      status: sample.status,
      position,
      duration: sample.duration,
      buffered: sample.buffered,
      src,
      ...(sample.error === undefined ? {} : { error: sample.error })
    }))
  );

  /** What the platform's media controls asked for. */
  readonly actions: Observable<AudioAction> = this.actionSubject.asObservable();

  /** The current state, for code that needs it without subscribing. */
  get current(): AudioState {
    const sample = this.sample.value;
    return {
      status: sample.status,
      position: this.position.value,
      duration: sample.duration,
      buffered: sample.buffered,
      src: this.source.value,
      ...(sample.error === undefined ? {} : { error: sample.error })
    };
  }

  /** Installed by the runtime; a request with no handler is dropped. */
  setHandler(handler: ((request: AudioRequest) => void) | null): void {
    this.handler = handler;
  }

  /** Installed by the runtime: the driver `position` moves on between samples. */
  setAnimations(animations: AnimationService | null): void {
    this.animations = animations;
  }

  /**
   * Called by the runtime when the shell reports the element.
   *
   * Not for applications: the shell is the only thing that knows the
   * answer, and `state` is how an application hears about it.
   */
  applySample(sample: AudioSample): void {
    this.sample.value = sample;
    const elapsed = sample.status === 'playing' ? Math.max(0, (epochNow() - sample.at) / 1000) : 0;
    const known = Number.isFinite(sample.duration);
    const now = known ? Math.min(sample.position + elapsed, sample.duration) : sample.position + elapsed;
    this.animations?.stop(this.position);
    this.position.value = now;
    if (sample.status !== 'playing' || this.animations === null) {
      return;
    }
    const target = known ? sample.duration : now + UNKNOWN_DURATION_HORIZON_S;
    if (target <= now) {
      return;
    }
    // A readout, not motion: it keeps moving under reduced motion, as
    // the spinner does, because a seek bar that stood still would say
    // the music had stopped.
    this.animations.animate(this.position, target, {
      duration: (target - now) * 1000,
      easing: linear,
      stepMs: POSITION_STEP_MS,
      reducedMotion: 'keep'
    });
  }

  /** Called by the runtime when the platform's controls act. Not for applications. */
  applyAction(action: AudioAction): void {
    this.actionSubject.next(action);
  }

  /**
   * Loads a source and, by default, starts it.
   *
   * Reported as `loading` at once rather than waiting for the shell,
   * so a screen that pressed play shows something before the round
   * trip comes back.
   */
  load(src: string, options: { readonly autoplay?: boolean } = {}): void {
    this.animations?.stop(this.position);
    this.source.value = src;
    this.position.value = 0;
    this.sample.value = { status: 'loading', position: 0, duration: NaN, buffered: 0, at: epochNow() };
    this.handler?.({ type: 'load', src, autoplay: options.autoplay ?? true });
  }

  /**
   * Says what will play next, so the shell can have it buffered before
   * it is asked for.
   *
   * Nothing about the current playback changes, and nothing is
   * reported: this only speaks to a second element the shell keeps. A
   * later `load` of the same source is answered from what was
   * buffered, and a `load` of anything else discards it. Pass an empty
   * string when nothing follows.
   */
  preload(src: string): void {
    this.handler?.({ type: 'preload', src });
  }

  play(): void {
    this.handler?.({ type: 'play' });
  }

  pause(): void {
    this.handler?.({ type: 'pause' });
  }

  /**
   * Moves to a position. Written locally at once, so a dragged seek bar
   * follows the finger rather than the round trip; the element's own
   * `seeked` sample confirms it.
   */
  seek(seconds: number): void {
    this.animations?.stop(this.position);
    this.position.value = Math.max(0, seconds);
    this.handler?.({ type: 'seek', seconds: Math.max(0, seconds) });
  }

  /** 0 to 1. */
  setVolume(level: number): void {
    this.handler?.({ type: 'volume', level: Math.min(1, Math.max(0, level)) });
  }

  /** What the OS shows for the track; null clears it. */
  setMetadata(metadata: AudioMetadata | null): void {
    this.handler?.({ type: 'metadata', metadata });
  }
}
