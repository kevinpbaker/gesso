import { combineLatest, map, type Observable } from 'rxjs';

import {
  Box,
  Column,
  linear,
  percent,
  Row,
  Text,
  type UiChild,
  type UiColorValue,
  type UiNode,
  type VideoTransport
} from 'gesso-core';
import {
  AnimationService,
  createComponent,
  FocusService,
  input,
  internalState,
  type ComponentContext,
  type Inputs,
  type InternalState
} from 'gesso-framework';

import { Button } from './Button';
import { Icon } from './Media';
import { Slider } from './Slider';

/**
 * The glyphs, as path data in a 24 unit box.
 *
 * Written out rather than pulled from an icon set, for the reason the
 * rest of this library draws its own: a component that needed a
 * dependency to show a play triangle would make the dependency part of
 * the component's contract. These six are the whole of what a
 * transport needs.
 */
const GLYPH = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  volume:
    'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  muted:
    'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  enterFullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  exitFullscreen: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z'
} as const;

/**
 * How often the readout is written while a clip plays.
 *
 * Ten a second, which is `AudioService`'s number and for the same
 * reason: smooth under a thumb and nothing. The clip's own pictures
 * arrive at whatever rate it was encoded at and are nothing to do with
 * this; a scrubber that moved once per frame of a 60fps clip would
 * dirty a node sixty times a second to move a thumb by less than a
 * pixel.
 */
const READOUT_STEP_MS = 100;

/** Which parts of the bar to draw. Everything is on unless said otherwise. */
export interface VideoControlsOptions {
  playPause?: boolean;
  scrubber?: boolean;
  /** The elapsed and total time, as `0:12 / 6:00`. */
  time?: boolean;
  /**
   * A mute button and a level slider.
   *
   * **Nothing in this framework plays a clip's sound.** `AudioContext`
   * does not exist on the thread that decodes, so the level is state
   * that is reported through `Video`'s `onVolume` and does something
   * only where an application has wired that to whatever is making the
   * noise. Left unset, the control is drawn only when such a wiring
   * exists, because a volume slider over silence is a lie. Set it
   * `true` to draw one anyway.
   */
  volume?: boolean;
  fullscreen?: boolean;
  /**
   * Draw a handle at the filled end of the scrubber and the level.
   *
   * On, because these are sliders a person aims at and drags rather
   * than reads, and a handle is the affordance that says so. The rest
   * of the library's sliders default the other way.
   */
  thumb?: boolean;
  /**
   * How long the pointer must be still before the bar goes away, in
   * milliseconds. Zero keeps it up until the pointer leaves.
   *
   * A second by default. Long enough that crossing the picture towards
   * a control does not take the control away, and short enough that
   * the chrome is not sitting over the clip a beat after you stopped
   * asking for it. Resting on the bar suspends it entirely.
   */
  hideAfterMs?: number;
  /**
   * Keep the bar up instead of revealing it on hover.
   *
   * The default is the behaviour every player has: the bar is out of
   * the way until the pointer arrives over the clip, and goes when it
   * leaves. It is also up while a control inside it has keyboard
   * focus, which is the one thing the hover rule alone gets wrong.
   */
  alwaysVisible?: boolean;
}

/** The live readout a bar draws from, and the transport it drives. */
export interface VideoReadout {
  readonly position: InternalState<number>;
  readonly duration: InternalState<number>;
  readonly paused: InternalState<boolean>;
  readonly volume: InternalState<number>;
  readonly muted: InternalState<boolean>;
}

/**
 * Follows a transport, writing what a bar needs to draw.
 *
 * **The position is extrapolated rather than read from the picture.**
 * A clip's frames arrive at whatever rate it was encoded at, which may
 * be sixty a second, and a scrubber wants to hear about none of them.
 * So this runs a linear tween on the animation driver at ten a second
 * and re-synchronises whenever the transport reports that something
 * happened to the clip: a play, a pause, a seek, a rate change, a lap
 * of a loop. It is exactly what `AudioService` does for a seek bar
 * over a track.
 */
export function followTransport(ctx: ComponentContext, transport: Observable<VideoTransport | null>): VideoReadout {
  const animations = ctx.inject(AnimationService);
  const readout: VideoReadout = {
    position: internalState(0, 'video.position'),
    duration: internalState(0, 'video.duration'),
    paused: internalState(true, 'video.paused'),
    volume: internalState(1, 'video.volume'),
    muted: internalState(false, 'video.muted')
  };
  let current: VideoTransport | null = null;

  const resync = (): void => {
    const live = current;
    if (live === null) {
      return;
    }
    animations.stop(readout.position);
    readout.position.value = live.position;
    readout.duration.value = live.duration;
    readout.paused.value = live.paused;
    readout.volume.value = live.volume;
    readout.muted.value = live.muted;
    const remaining = live.duration - live.position;
    if (live.paused || remaining <= 0) {
      return;
    }
    animations.animate(readout.position, live.duration, {
      duration: (remaining / live.rate) * 1000,
      easing: linear,
      stepMs: READOUT_STEP_MS,
      // A readout, not motion: it keeps moving under reduced motion
      // because a seek bar that stood still would say the clip had.
      reducedMotion: 'keep'
    });
  };

  transport.subscribe(next => {
    current = next;
    if (next === null) {
      return;
    }
    next.onChange(resync);
    resync();
  });

  return readout;
}

export interface VideoControlsProps {
  /** The clip to drive. Null until there is a playback behind it. */
  transport: VideoTransport | null;
  options?: VideoControlsOptions;
  /** Whether the bar should be on screen; see `alwaysVisible`. */
  visible?: boolean;
  /**
   * Told when the pointer comes to rest on the bar and when it leaves.
   *
   * What keeps a bar from disappearing under a hand that is holding
   * still over a scrubber it is about to press, which is the stillest
   * the pointer ever is and exactly when an idle timer would fire.
   */
  onPointerWithin?: (within: boolean) => void;
  /**
   * Whether the application wired the level to anything that makes a
   * noise. See `VideoControlsOptions.volume` for why the control is
   * drawn only when it is, unless asked for outright.
   */
  volumeWired?: boolean;
  /** Whether a fullscreen control can do anything, and what it should say. */
  fullscreenActive?: boolean;
  onFullscreen?: (enter: boolean) => void;
  /** Drawn over the picture, so it carries its own plate rather than the theme's. */
  background?: UiColorValue;
  color?: UiColorValue;
}

/**
 * The bar across the bottom of a clip.
 *
 * Built out of `Button`, `Slider` and `Icon` against the public
 * `VideoTransport`, which is the point: it has no privileged access to
 * the decoder, and an application that wants a different bar writes
 * one the same way. `Video` draws this when it is given `controls`,
 * and that is the only thing `Video` does differently.
 *
 * It is a `toolbar` rather than a set of loose controls, so an
 * assistive technology announces it as one thing with a name, and the
 * controls inside it keep their own roles.
 */
export function VideoControls(inputs: Inputs<VideoControlsProps>, ctx: ComponentContext): UiChild {
  const options = inputs.options.value ?? {};
  const readout = followTransport(ctx, inputs.transport);
  const act = (run: (transport: VideoTransport) => void): (() => void) => {
    return () => {
      const live = inputs.transport.value;
      if (live !== null) {
        run(live);
      }
    };
  };

  /** The band across the top of the bar, and the row of controls under it. */
  const scrubber: UiChild[] = [];
  const parts: UiChild[] = [];

  /**
   * What the bar draws itself in.
   *
   * Named once and given to every glyph, because `Icon` defaults to
   * `controlForeground` and a **theme token is the wrong source for
   * anything in here**: the bar sits on a plate over a picture, and
   * the theme cannot know what is behind it. The time text already
   * worked this way; the glyphs did not, so they took the theme's
   * control ink and vanished wherever that happened to be dark. In
   * fullscreen they vanished outright, because the overlay layer
   * inherited no theme at all and fell back to the light one.
   */
  const ink = input(inputs.color, '#ffffff' as UiColorValue);
  const focus = ctx.inject(FocusService);
  /** The bar's own node, so `focusWithin` has something to test against. */
  let plate: UiNode | null = null;

  if (options.playPause !== false) {
    parts.push(
      createComponent(
        Button,
        {
          // The label is the *action*, which is what a screen reader
          // should hear and what the glyph would say if it could.
          label: readout.paused.pipe(map(paused => (paused ? 'Play' : 'Pause'))),
          variant: 'plain',
          size: 'small',
          // One `Icon` with a bound path, not a new `Icon` per state.
          // `Button` reads `children` once, by value, so an observable
          // of elements is sampled when the button is built and never
          // again: the label changed and the glyph did not. `Icon`
          // follows its `path` cell for exactly this.
          children: createComponent(Icon, {
            path: readout.paused.pipe(map(paused => (paused ? GLYPH.play : GLYPH.pause))),
            size: 16,
            color: ink
          }),
          onClick: act(transport => (transport.paused ? transport.play() : transport.pause()))
        },
        'play'
      )
    );
  }

  if (options.scrubber !== false) {
    scrubber.push(
      createComponent(
        Slider,
        {
          label: 'Seek',
          labelHidden: true,
          // The full width of the bar rather than a share of the row.
          // A seek bar is the control people aim at, and aiming is
          // easier the longer it is; it is also the one control whose
          // length carries meaning, because its length *is* the clip.
          // Keeping it out of the row is what stops a narrow clip
          // squeezing it to nothing between the buttons.
          width: percent(100),
          // Flush with the top of the plate rather than centred in
          // its own hit area: the line wants to be the boundary
          // between picture and controls, and the rest of the strip
          // is the part you are allowed to be imprecise about.
          trackAlign: 'start',
          thumb: options.thumb !== false,
          min: 0,
          // A clip whose length is not known yet would otherwise be a
          // slider from zero to zero, which reads as broken.
          max: readout.duration.pipe(map(seconds => Math.max(seconds, 0.001))),
          step: 0.01,
          value: readout.position,
          format: (seconds: number) => clockTime(seconds),
          onChange: (seconds: number) => inputs.transport.value?.seek(seconds)
        },
        'seek'
      )
    );
  }

  if (options.time !== false) {
    parts.push(
      Text({
        key: 'time',
        text: combineLatest([readout.position, readout.duration]).pipe(
          map(([at, total]) => `${clockTime(at)} / ${clockTime(total)}`)
        ),
        color: ink,
        textStyle: 'bodySmall',
        textWrap: 'none',
        selectable: false
      })
    );
  }

  if (options.volume === true || (options.volume !== false && inputs.volumeWired.value === true)) {
    parts.push(
      createComponent(
        Button,
        {
          label: readout.muted.pipe(map(muted => (muted ? 'Unmute' : 'Mute'))),
          variant: 'plain',
          size: 'small',
          children: createComponent(Icon, {
            path: readout.muted.pipe(map(muted => (muted ? GLYPH.muted : GLYPH.volume))),
            size: 16,
            color: ink
          }),
          onClick: act(transport => transport.setMuted(!transport.muted))
        },
        'mute'
      ),
      createComponent(
        Slider,
        {
          label: 'Volume',
          labelHidden: true,
          thumb: options.thumb !== false,
          width: 64,
          min: 0,
          max: 1,
          step: 0.01,
          // A muted clip reads as zero however loud it was, which is
          // what the slider should show; unmuting puts it back, because
          // the level was never overwritten.
          value: combineLatest([readout.volume, readout.muted]).pipe(map(([level, muted]) => (muted ? 0 : level))),
          format: (level: number) => `${Math.round(level * 100)}%`,
          onChange: (level: number) => inputs.transport.value?.setVolume(level)
        },
        'volume'
      )
    );
  }

  if (options.fullscreen !== false && inputs.onFullscreen.value !== undefined) {
    // Everything before this is left-aligned and fullscreen is not,
    // which is where every player puts it.
    parts.push(Box({ flex: 1 }));
    parts.push(
      createComponent(
        Button,
        {
          label: inputs.fullscreenActive.pipe(map(active => (active === true ? 'Leave fullscreen' : 'Fullscreen'))),
          variant: 'plain',
          size: 'small',
          children: createComponent(Icon, {
            path: inputs.fullscreenActive.pipe(
              map(active => (active === true ? GLYPH.exitFullscreen : GLYPH.enterFullscreen))
            ),
            size: 16,
            color: ink
          }),
          onClick: () => inputs.onFullscreen.value?.(inputs.fullscreenActive.value !== true)
        },
        'fullscreen'
      )
    );
  }

  /**
   * Whether the bar is on screen.
   *
   * The pointer being over the clip, and nothing else. An earlier
   * version also kept it up whenever the clip was paused, on the
   * grounds that a paused clip with no visible way to restart it is
   * unhelpful; in practice that meant every clip that had not been
   * started yet wore its chrome permanently, which is not what a bar
   * that hides itself is for.
   *
   * **Except for the keyboard.** A control that has focus must be
   * visible, or tabbing into the bar moves focus somewhere nobody can
   * see; `focusWithin` is what keeps that from being the price of
   * hiding on hover.
   */
  const focusWithin = focus.focused.pipe(map(node => contains(plate, node)));
  const shown =
    options.alwaysVisible === true
      ? undefined
      : combineLatest([inputs.visible, focusWithin]).pipe(
          map(([visible, focused]) => (visible === true || focused ? 1 : 0))
        );

  return Box(
    {
      ref: (node: UiNode | null) => (plate = node),
      width: percent(100),
      onPointerEnter: () => inputs.onPointerWithin.value?.(true),
      onPointerLeave: () => inputs.onPointerWithin.value?.(false),
      // Painted rather than themed: this sits over a picture whose
      // colours the theme cannot know, so it brings its own plate.
      // **No padding of its own**: the scrubber is flush to this
      // plate's top edge and runs the whole width of it, so the
      // insetting belongs to the row underneath, which is the only
      // part that wants any.
      backgroundColor: input(inputs.background, 'rgba(0, 0, 0, 0.55)' as UiColorValue),
      opacity: shown,
      transition: shown === undefined ? undefined : { opacity: 160 },
      role: 'toolbar',
      label: 'Video controls'
    },
    Column(
      { width: percent(100) },
      ...scrubber,
      Row({ gap: 8, y: 'center', width: percent(100), paddingX: 8, paddingBottom: 4 }, ...parts)
    )
  );
}

/** Whether `node` is `root` or sits somewhere beneath it. */
function contains(root: UiNode | null, node: UiNode | null): boolean {
  if (root === null || node === null) {
    return false;
  }
  for (let at: UiNode | null = node; at !== null; at = at.parent) {
    if (at === root) {
      return true;
    }
  }
  return false;
}

/**
 * Seconds as `m:ss`, or `h:mm:ss` once there is an hour of it.
 *
 * Floored rather than rounded, which is what every player does and is
 * the only choice that does not show a clip's own length one second
 * before it ends.
 */
export function clockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const padded = `${minutes < 10 && hours > 0 ? '0' : ''}${minutes}:${rest < 10 ? '0' : ''}${rest}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
}
