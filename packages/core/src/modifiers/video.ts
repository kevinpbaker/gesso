import { linear } from '../animation/UiEasing';
import type { AnimatedCell } from '../animation/UiAnimation';
import type { VideoPlayback, VideoResolver } from '../media/VideoResolver';
import { defineModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

export interface VideoSourceArgs {
  readonly resolver: VideoResolver;
  readonly source: string;
  /** Start from the beginning again when it ends. Defaults to true. */
  readonly loop?: boolean;
  /** Start playing as soon as it is ready. Defaults to true. */
  readonly autoplay?: boolean;
  /** Told when the video loads, starts or fails. */
  readonly onState?: (state: 'loading' | 'playing' | 'failed', error?: unknown) => void;
}

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
 * driven by a repeating linear tween over the video's duration — an
 * ordinary animation on an ordinary cell. So a video is scheduled by
 * the same `ticks` phase as everything else, keeps its own frames
 * coming through the same `nextTickAt`, drops frames rather than
 * falling behind under load, and stops dead when the runtime does.
 * Nothing new had to be added to the runtime to play a video.
 *
 * **It keeps moving under reduced motion**, and that is deliberate.
 * The rule this framework applies (`UiReducedMotionPolicy`) is to stop
 * only when standing still would not state something false, and a
 * video that has frozen on its first frame is a video that has
 * finished loading badly. The media tier makes the same call for the
 * `Spinner`. An app that wants a still under reduced motion passes
 * `autoplay: false` and decides for itself.
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
 * So the position this node presents is its own tween plus whatever
 * the playback had already reached when it resolved. Both holders then
 * agree to within a frame, no seek fires, and the continuity this
 * comment claims is actually true.
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
  let positionMs = 0;
  /**
   * Where the playback already was when this element joined it, so the
   * tween's zero means "here" rather than "the start of the file".
   */
  let offsetMs = 0;
  /** The clip's length, known only once it has been read. */
  let durationMs = 0;
  args.onState?.('loading');
  host.clear('video');

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
      // Wrapped rather than clamped: the tween runs 0 → duration and
      // repeats, and the offset slides where in the clip that lands.
      const at = durationMs > 0 ? (next + offsetMs) % durationMs : next;
      if (playback.present(at)) {
        host.requestFrame();
      }
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
      // joining part-way through a transition.
      offsetMs = resolved.positionMs;
      host.set('video', resolved.surface);
      stopErrors = resolved.onError(error => args.onState?.('failed', error));
      args.onState?.('playing');
      if (args.autoplay === false) {
        // Not playing, but the first frame is worth having: a paused
        // video showing nothing looks like one that failed. Its own
        // position rather than zero, so a still that joins a playing
        // holder does not seek it back to the start.
        resolved.present(offsetMs);
        host.requestFrame();
        return;
      }
      host.animate(position, durationMs, {
        duration: durationMs,
        easing: linear,
        repeat: args.loop !== false,
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
        // Passed through rather than floored: a playback that reports
        // no interval is saying it does not know its own rate, and
        // zero already means "every frame" to the driver. The MP4 path
        // never reports zero — an unreadable sample table falls back to
        // sixty — so the floor only ever hid what a custom playback
        // meant.
        stepMs: resolved.frameDurationMs
      });
    })
    .catch((error: unknown) => {
      if (live) {
        args.onState?.('failed', error);
      }
    });

  host.own(() => {
    live = false;
    host.stopAnimation(position);
    stopErrors?.();
    args.resolver.release(args.source);
  });
}
