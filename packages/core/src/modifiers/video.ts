import { linear } from '../animation/UiEasing';
import type { AnimatedCell } from '../animation/UiAnimation';
import type { VideoPlayback, VideoResolver } from '../media/VideoResolver';
import { defineModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

/**
 * Where a clip stands: loading it, showing it, or having failed.
 *
 * `playing` is about the *picture*, not about motion — it is the
 * moment a surface reaches the node, and it arrives for a clip built
 * with `autoplay: false` exactly as it does for one that runs. Whether
 * time is moving is `VideoTransport.paused`, which is a different
 * question and was never what this answered.
 */
export type VideoState = 'loading' | 'playing' | 'failed';

/**
 * The clock a video's position comes from, when it is not the video's
 * own.
 *
 * The default is a tween on the animation driver, which is right for
 * a clip with no sound: nothing else in the application has an opinion
 * about where the clip should be, so the frame clock may as well
 * decide.
 *
 * It stops being right the moment there is audio. Audio cannot drop
 * samples the way video drops frames — a gap is audible and a
 * resample is worse — so where the two must agree, the audio is the
 * clock and the picture follows it. That inversion is the whole reason
 * this seam exists, and it is a *seam* rather than an implementation
 * because `AudioContext` does not exist on a worker: the sound is
 * played by the shell, and what crosses the thread boundary is this
 * one number. See `AudioService`, which already reports it.
 *
 * `positionSeconds` is called once per presentation and must be cheap.
 * Returning a position that goes backwards is a seek, exactly as it is
 * for the tween.
 */
export interface VideoClock {
  /** Where the clip should be now, in seconds. */
  positionSeconds(): number;
  /** Whether the clock is running. A paused clock presents no new frames. */
  readonly running: boolean;
  /** Told when `running` changes, so the modifier can stop asking for frames. */
  onChange(listener: () => void): () => void;
}

/**
 * The handle on a running clip: where it is, and the four things that
 * can be done to it.
 *
 * Handed out through `VideoSourceArgs.onReady` rather than returned,
 * because a playback does not exist until a file has been fetched and
 * a decoder configured, and a modifier attaches long before either.
 *
 * Nothing here is reactive. Core has no cells — `AnimatedCell` is an
 * interface it asks others to satisfy, not a thing it implements — so
 * this reports through `onChange` and the framework's tier wraps it in
 * whatever its own state primitive is. `Video` does exactly that.
 */
export interface VideoTransport {
  /** The clip's length in seconds. Zero until the container has been read. */
  readonly duration: number;
  /** Where the picture is now, in seconds. */
  readonly position: number;
  /** Whether time has stopped. A seek while paused still moves the picture. */
  readonly paused: boolean;
  /** How fast time runs. 1 is the clip's own rate; 0.5 is half speed. */
  readonly rate: number;
  /**
   * How loud, from 0 to 1, and whether it is silenced outright.
   *
   * **Nothing in this framework plays a clip's sound**, because
   * `AudioContext` does not exist on the thread that decodes. So this
   * is state rather than an effect: it is carried here, reported
   * through `onVolume`, and it does something only where an
   * application has wired that to whatever is actually making the
   * noise — `AudioService`, on the shell. A control over it is honest
   * for a clip whose sound is wired and a lie for one whose is not,
   * which is why `Video` decides whether to draw one rather than
   * always drawing it.
   *
   * `muted` is kept separate from a volume of zero, as every player
   * keeps it: unmuting has to return to the level it was at, and a
   * mute that wrote zero would have thrown that away.
   */
  readonly volume: number;
  readonly muted: boolean;
  /** Whether the decoder is still working towards the last position asked for. */
  readonly seeking: boolean;
  readonly state: VideoState;
  play(): void;
  pause(): void;
  /** Moves to a position in seconds, clamped to the clip, playing or not. */
  seek(seconds: number): void;
  /** Positive, and clamped to something a decoder can keep up with. */
  setRate(rate: number): void;
  /** Clamped to 0..1. Setting it above zero also unmutes, as a slider dragged up should. */
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /**
   * Fetches, demuxes and configures again, for a clip that failed.
   *
   * The resolver caches by source, so a clip that failed *inside* the
   * decoder is still held as a failed playback and this would resolve
   * straight back to it. Releasing first is what makes the retry a
   * real one.
   */
  retry(): void;
  /**
   * Told whenever any of the above changed, at most once a frame.
   *
   * Position is deliberately not part of that: it changes on every
   * frame of every clip, and a listener woken sixty times a second to
   * move a scrubber by a pixel is how a video costs an application its
   * frame budget. Read `position` on the frames you are already
   * drawing; this fires for the things that happen *to* a clip — it
   * started, it stopped, it arrived somewhere, it broke.
   */
  onChange(listener: () => void): () => void;
}

export interface VideoSourceArgs {
  readonly resolver: VideoResolver;
  readonly source: string;
  /** Start from the beginning again when it ends. Defaults to true. */
  readonly loop?: boolean;
  /** Start playing as soon as it is ready. Defaults to true. */
  readonly autoplay?: boolean;
  /** How fast to play. Defaults to 1. */
  readonly rate?: number;
  /**
   * Stop decoding while the node is off screen. Defaults to true.
   *
   * See `pauseWhenHidden` in this file for what "off screen" means and
   * why the default is what it is.
   */
  readonly pauseWhenHidden?: boolean;
  /** Where the position comes from, when it is not this clip's own tween. */
  readonly clock?: VideoClock;
  /** Starting volume, 0 to 1. Defaults to 1. */
  readonly volume?: number;
  readonly muted?: boolean;
  /**
   * Told when the volume or the mute changed, so an application can
   * pass it to whatever is playing the sound. See `VideoTransport.volume`
   * for why this is a report rather than an effect.
   */
  readonly onVolume?: (volume: number, muted: boolean) => void;
  /** Told when the video loads, starts or fails. */
  readonly onState?: (state: VideoState, error?: unknown) => void;
  /**
   * Handed the transport once there is a playback to control.
   *
   * Called again after a successful `retry`, with a transport for the
   * new playback; the old one is inert from the moment it was retried.
   */
  readonly onReady?: (transport: VideoTransport) => void;
}

/**
 * The slowest and fastest a clip may be asked to run.
 *
 * Not a decoder limit — a decoder will run as fast as it is fed — but
 * a *sanity* one. Zero would be a pause spelled as a rate and would
 * divide by itself below; a negative rate is a request to run the
 * decoder backwards, which is not a thing it does; and past about four
 * the frame queue cannot stay ahead and the clip judders instead of
 * speeding up. Clamped rather than rejected, because a rate is the
 * kind of thing an application binds to a slider.
 */
const MIN_RATE = 0.0625;
const MAX_RATE = 4;

/**
 * How close to the end counts as having reached it.
 *
 * A tween's last sample lands on its target exactly, but a clip whose
 * tween was cancelled a frame early — by a pause, by a seek — must not
 * be mistaken for one that finished and be looped back to the start.
 */
const END_TOLERANCE_MS = 1;

/**
 * Plays a video onto the node's `video` property.
 *
 * A modifier rather than a subscription in a component body for the
 * reason `imageSource` is one, only more so: what it holds is a
 * decoder and a queue of decoded frames, which is the most expensive
 * thing in this framework to leak. `host.own` releases it inside
 * `removeSubtree`, so a node that leaves stops decoding on the frame
 * it goes.
 *
 * **Time comes from the animation driver, not from a timer.** The
 * playback is a pure function of a position, and the position is
 * driven by a linear tween over the video's duration — an ordinary
 * animation on an ordinary cell. So a video is scheduled by the same
 * `ticks` phase as everything else, keeps its own frames coming
 * through the same `nextTickAt`, drops frames rather than falling
 * behind under load, and stops dead when the runtime does. Nothing new
 * had to be added to the runtime to play a video.
 *
 * **Unless something else owns time.** A `clock` in the arguments
 * replaces the tween, and is how a clip keeps step with sound that is
 * being played somewhere this thread cannot reach. The rest of this
 * file does not care which of the two it is driven by: both end at the
 * same cell.
 *
 * **It keeps moving under reduced motion**, and that is deliberate for
 * a clip with no transport. The rule this framework applies
 * (`UiReducedMotionPolicy`) is to stop only when standing still would
 * not state something false, and a video that has frozen on its first
 * frame is a video that has finished loading badly. The media tier
 * makes the same call for the `Spinner`. A clip the reader can *drive*
 * is the other case — there the stillness is not a failure, it is a
 * clip waiting to be played — so `Video` declines to autoplay under
 * reduced motion when it has been given controls, and this modifier
 * is told so through `autoplay`.
 *
 * **Playback is shared by source, not by node.** The resolver
 * reference-counts, so two nodes pointed at one file watch one
 * playback — which is how a video survives a route change: the
 * arriving node resolves the source the departing node still holds and
 * picks it up mid-stream. The reference DOM implementation of this
 * effect has to physically move its `<video>` element into the new
 * document to get the same result.
 *
 * **Picking it up mid-stream needs the offset, and that took a bug to
 * learn.** The decoder is shared, but the tween that drives it belongs
 * to the node, and a node that has just been built starts its tween at
 * zero. During a route transition both screens are mounted at once, so
 * for the length of the exit two tweens drove one playback: one at
 * wherever the clip had got to, one at nearly zero. Each disagreement
 * larger than the seek tolerance is a seek backwards, which drops the
 * frame queue and reconfigures the decoder — about fourteen times
 * across a 240ms transition, on the same thread as layout and paint.
 * The video appeared to freeze, the morph juddered, and when the old
 * screen finally left, the clip carried on from the beginning.
 *
 * So a node starts its tween at whatever the playback had already
 * reached, and the cell holds an absolute position in the clip rather
 * than a distance from where this node joined. Both holders then agree
 * to within a frame, no seek fires, and the continuity this comment
 * claims is actually true. The earlier version of this kept a separate
 * offset and wrapped the sum; holding the position outright is the
 * same arithmetic with one fewer thing to get wrong, and it is what
 * makes `seek` a single assignment.
 */
export const videoSource = defineModifier<VideoSourceArgs>({
  name: 'videoSource',
  attach(host, args) {
    load(host, args);
  },
  update(host, args, previous) {
    if (args.resolver === previous.resolver && args.source === previous.source) {
      return;
    }
    previous.resolver.release(previous.source);
    load(host, args);
  }
});

function load(host: UiModifierHost, args: VideoSourceArgs): void {
  let live = true;
  let playback: VideoPlayback | null = null;
  let stopErrors: (() => void) | null = null;
  let stopFrames: (() => void) | null = null;
  let stopClock: (() => void) | null = null;
  let positionMs = 0;
  /** The clip's length, known only once it has been read. */
  let durationMs = 0;
  let paused = args.autoplay === false;
  let rate = clampRate(args.rate ?? 1);
  let volume = clampVolume(args.volume ?? 1);
  let muted = args.muted === true;
  let state: VideoState = 'loading';
  /**
   * Whether the node is somewhere a reader could see it. Assumed true
   * until layout says otherwise, so a clip is never held back waiting
   * for a measurement that a headless graph will never take.
   */
  let onScreen = true;
  const changeListeners = new Set<() => void>();

  args.onState?.('loading');
  host.clear('video');

  const announce = (next: VideoState, error?: unknown): void => {
    state = next;
    args.onState?.(next, error);
    changed();
  };

  const changed = (): void => {
    for (const listener of changeListeners) {
      listener();
    }
  };

  // The cell the driver writes: setting it presents whichever frame is
  // due at that position, and asks for a paint only when that actually
  // changed the picture. A video at 30 Hz inside an app at 60 therefore
  // paints thirty times a second, not sixty.
  const position: AnimatedCell<number> = {
    get value(): number {
      return positionMs;
    },
    set value(next: number) {
      positionMs = next;
      if (playback === null) {
        return;
      }
      if (playback.present(next)) {
        host.requestFrame();
      }
    }
  };

  /**
   * Runs the clip from where it stands to its end.
   *
   * A fresh tween each time rather than one repeating tween for the
   * life of the clip, which is what this used to be. A repeating tween
   * always starts from the value the cell held when it was built and
   * always runs the whole duration, so there is no way to begin one
   * part-way through — which is to say no way to seek, no way to
   * resume after a pause, and no way to change rate without the clip
   * jumping. Taking the loop apart into "play to the end, then decide"
   * costs one subscription per lap and buys all three.
   */
  const run = (): void => {
    if (playback === null || durationMs <= 0) {
      return;
    }
    const remaining = durationMs - positionMs;
    if (remaining <= END_TOLERANCE_MS) {
      finish();
      return;
    }
    host
      .animate(position, durationMs, {
        duration: remaining / rate,
        easing: linear,
        reducedMotion: 'keep',
        // The video's own rate, which is what keeps a playing video
        // from pinning the whole application to the frame clock. A
        // tween with no `stepMs` asks to be sampled every frame; that
        // was survivable while frames were a fixed sixty and is not
        // once they follow the display, where a 30fps clip would wake
        // a 165Hz app 165 times a second to present the same picture
        // five times running. Declaring the rate instead lets
        // `AnimationDriver.nextTickAt` do what it is for: the earliest
        // moment *anybody* wants a frame, so an animation starting
        // beside this video raises the rate for as long as it runs and
        // the page falls back to the video's cadence when it settles.
        // Divided by the rate, because a clip at half speed changes
        // its picture half as often and should wake the app half as
        // often to say so.
        stepMs: playback.frameDurationMs / rate
      })
      .subscribe({
        complete: () => {
          // A tween completes when it arrives *and* when it is
          // cancelled — by a pause, a seek, or the node leaving — and
          // the observable cannot tell those apart. The cell can: only
          // a tween that arrived left the position at the end.
          if (live && !paused && durationMs - positionMs <= END_TOLERANCE_MS) {
            finish();
          }
        }
      });
  };

  /** The clip reached its end: back to the start, or stop on the last frame. */
  const finish = (): void => {
    if (args.loop === false) {
      paused = true;
      changed();
      return;
    }
    position.value = 0;
    run();
    // A lap of a loop is something that happened to the clip, and
    // anything extrapolating the position — a scrubber, a caption
    // track — has just been left a whole duration ahead of reality.
    changed();
  };

  /** Whether time should be moving, given everything that can stop it. */
  const shouldRun = (): boolean => live && !paused && onScreen && playback !== null;

  /**
   * Brings the driver in line with `shouldRun`.
   *
   * Every one of pause, play, seek, rate and visibility ends here
   * rather than each starting and stopping the tween itself, because
   * the question they all really ask is the same one and the answer
   * has to survive them happening together: a clip scrolled off screen
   * while paused must not start playing when it comes back into view.
   */
  const sync = (): void => {
    host.stopAnimation(position);
    if (shouldRun()) {
      run();
    }
  };

  const transport: VideoTransport = {
    get duration(): number {
      return durationMs / 1000;
    },
    get position(): number {
      return positionMs / 1000;
    },
    get paused(): boolean {
      return paused;
    },
    get rate(): number {
      return rate;
    },
    get volume(): number {
      return volume;
    },
    get muted(): boolean {
      return muted;
    },
    get seeking(): boolean {
      return playback?.seeking ?? false;
    },
    get state(): VideoState {
      return state;
    },
    play(): void {
      if (!paused) {
        return;
      }
      paused = false;
      // A clip that ran to its end and stopped there is asked to play
      // again from the beginning, which is what every player does and
      // what the alternative — presenting the last frame forever —
      // would make look broken.
      if (durationMs > 0 && durationMs - positionMs <= END_TOLERANCE_MS) {
        position.value = 0;
      }
      sync();
      changed();
    },
    pause(): void {
      if (paused) {
        return;
      }
      paused = true;
      sync();
      changed();
    },
    seek(seconds: number): void {
      const wanted = Math.min(Math.max(0, seconds * 1000), durationMs);
      // Written before the driver is restarted, so the picture moves on
      // this frame rather than on the next one the tween samples: a
      // scrubber dragged while paused is the whole reason to care.
      position.value = wanted;
      sync();
      changed();
    },
    setRate(next: number): void {
      const clamped = clampRate(next);
      if (clamped === rate) {
        return;
      }
      rate = clamped;
      // The tween's duration is baked in at construction, so a rate
      // change is a new tween from wherever the old one had got to.
      sync();
      changed();
    },
    setVolume(next: number): void {
      const clamped = clampVolume(next);
      // Dragging a slider up from zero is a request to hear it, and a
      // player that stayed silent because it was also muted would look
      // broken. Dragging to zero does not mute: that is what the
      // button is for, and conflating them loses the level.
      const unmuted = clamped > 0 ? false : muted;
      if (clamped === volume && unmuted === muted) {
        return;
      }
      volume = clamped;
      muted = unmuted;
      args.onVolume?.(volume, muted);
      changed();
    },
    setMuted(next: boolean): void {
      if (next === muted) {
        return;
      }
      muted = next;
      args.onVolume?.(volume, muted);
      changed();
    },
    retry(): void {
      if (!live) {
        return;
      }
      // Tearing down this load rather than reaching into it: `load`
      // registers its own teardown with the host, and running it here
      // would leave that registration holding a released source. So the
      // release happens here and the dead load is fenced off with
      // `live`, exactly as the detach path does it.
      live = false;
      host.stopAnimation(position);
      stopErrors?.();
      stopFrames?.();
      stopClock?.();
      args.resolver.release(args.source);
      host.clear('video');
      load(host, args);
    },
    onChange(listener: () => void): () => void {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    }
  };

  args.resolver
    .resolve(args.source)
    .then(resolved => {
      if (!live) {
        return;
      }
      playback = resolved;
      durationMs = Math.max(1, resolved.duration * 1000);
      // Whatever it had already reached, which is zero for a playback
      // nobody was holding and mid-clip for one this element is
      // joining part-way through a transition. An absolute position in
      // the clip, which is what every other line here means by one.
      positionMs = Math.min(resolved.positionMs, durationMs);
      host.set('video', resolved.surface);
      stopErrors = resolved.onError(error => announce('failed', error));
      // A seek answers late — the frame for the position asked for has
      // to be decoded first — and a paused clip has no next frame to
      // answer on. Without this a scrub while paused moves the
      // scrubber and leaves the picture where it was.
      stopFrames = resolved.onFrame?.(() => host.requestFrame()) ?? null;
      announce('playing');
      // The first frame is worth having whether or not time is about to
      // move: a paused video showing nothing looks like one that
      // failed. Its own position rather than zero, so a still that
      // joins a playing holder does not seek it back to the start.
      resolved.present(positionMs);
      host.requestFrame();
      attachClock();
      sync();
      args.onReady?.(transport);
    })
    .catch((error: unknown) => {
      if (live) {
        announce('failed', error);
      }
    });

  /**
   * Follows an external clock, when there is one.
   *
   * The tween is never built in this case: `sync` still decides
   * whether time should be moving, but what moves it is the clock's
   * own progress, sampled once per frame through the same cell the
   * tween would have written.
   */
  function attachClock(): void {
    const clock = args.clock;
    if (clock === undefined) {
      return;
    }
    const followClock = (): void => {
      position.value = Math.min(Math.max(0, clock.positionSeconds() * 1000), durationMs);
    };
    stopClock = clock.onChange(() => {
      paused = !clock.running;
      followClock();
      changed();
    });
    paused = !clock.running;
    followClock();
  }

  host.own(() => {
    live = false;
    host.stopAnimation(position);
    stopErrors?.();
    stopFrames?.();
    stopClock?.();
    changeListeners.clear();
    args.resolver.release(args.source);
  });

  /**
   * Whether the node is somewhere worth decoding for.
   *
   * A clip scrolled out of the viewport still fetches, decodes,
   * converts to a bitmap and uploads a texture sixty times a second
   * for nobody, and the only thing that stops it today is the tab
   * being hidden — which the runtime already handles, at the driver.
   * Within a visible page nothing did, so a page of clips cost the sum
   * of all of them however few were on screen.
   *
   * The test is the node's box against the root's, with no margin: a
   * clip is either somewhere a reader could see it or it is not, and a
   * clip that starts a frame late coming into view is a far smaller
   * fault than one that never stops. What it must not do is *seek* —
   * the position is left exactly where it stopped, so coming back into
   * view resumes rather than reloads, and the decoder is not reset.
   */
  function watchVisibility(): void {
    if (args.pauseWhenHidden === false) {
      return;
    }
    const check = (): void => {
      const box = host.layoutBox();
      const viewport = host.viewportBox();
      if (box === null || viewport === null) {
        return;
      }
      if (box.width <= 0 || box.height <= 0) {
        // Laid out to nothing, which is what a clip sized by its
        // container looks like before the container has been sized.
        // Not a statement that it is off screen, and treating it as
        // one stops every video whose height comes from its content
        // from ever starting.
        return;
      }
      const visible =
        box.x < viewport.x + viewport.width &&
        box.x + box.width > viewport.x &&
        box.y < viewport.y + viewport.height &&
        box.y + box.height > viewport.y;
      if (visible === onScreen) {
        return;
      }
      onScreen = visible;
      sync();
      changed();
    };
    host.onLayout(check);
    check();
  }

  watchVisibility();
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, volume));
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return 1;
  }
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}
