import { map, type Observable } from 'rxjs';

import {
  createComponent,
  input,
  internalState,
  type ComponentContext,
  type InputCell,
  type Inputs,
  MediaService,
  AnimationService,
  ShellService
} from 'gesso-framework';
import {
  steps,
  Box,
  type UiChild,
  type UiElement,
  type UiNode,
  percent,
  type UiNodeRef,
  type ObjectFit,
  type UiColorValue,
  type UiSemanticState,
  iconSource,
  imageSource,
  videoSource,
  type VideoClock,
  type VideoState,
  type VideoTransport
} from 'gesso-core';
import { layoutOf, type ControlLayoutProps, modifiersOf } from './internals';
import { useOverlay } from './overlay';
import { VideoControls, type VideoControlsOptions } from './VideoControls';

/**
 * The Media tier.
 *
 * All four are the same shape as the rest of the library: semantics
 * from the first line, layout props passed through, and a colour prop
 * only where the colour is the thing being drawn (an icon's glyph, a
 * spinner's blades) or where the theme cannot know what the picture
 * sits on (an image's placeholder). None of them is renderer work.
 * `UiImage` and `objectFit` have
 * been on both backends since the WebGPU parity milestone; what was
 * missing was everything in front of them, which is `ImageResolver`,
 * `IconRasterizer` and the two modifiers that write `image`.
 */

/**
 * How long the pointer must be still before the controls go away.
 *
 * A second. Long enough that crossing the picture towards a control
 * does not take the control away, and short enough that the chrome is
 * not sitting over the clip a beat after you stopped asking for it.
 * Resting on the bar itself suspends it entirely, so the short window
 * costs nothing to somebody actually reaching for a button.
 */
const DEFAULT_HIDE_AFTER_MS = 1000;

/**
 * The colour a media box carries before there is a picture on it.
 *
 * Shared by `Image` and `Video` because to an application they are one
 * rectangle with one question behind it: what shows while there is
 * nothing to show, and what shows when there never will be. Two copies
 * of the prop would be two chances for the default, the type or the
 * moment it is read to drift apart, which is what happened while
 * `Video` had the theme's answer written into it.
 */
export interface MediaPlaceholderProps {
  /**
   * The tint the box carries while it has no picture on it, and after
   * the source fails. A palette name or a colour outright; defaults to
   * `controlBackground`.
   *
   * The default is what keeps a grid of thumbnails from jumping as
   * they arrive, and it is the theme's answer rather than a colour
   * named here. This prop is for the caller who is placing pictures on
   * something the theme's control background does not sit on: a
   * picture over a photograph, or in a panel of its own colour.
   */
  placeholderColor?: UiColorValue;
}

/**
 * The `backgroundColor` a media box carries: the placeholder until
 * `showing` says a picture covers it, and nothing after that.
 *
 * The colour is read once, like `Icon`'s: a placeholder is what stands
 * in before the first frame that has a picture on it, so a colour that
 * arrived later would have nothing left to tint.
 */
function placeholderTint<S extends string>(
  color: InputCell<UiColorValue | undefined>,
  status: Observable<S>,
  showing: S
): Observable<UiColorValue | undefined> {
  const placeholder = color.value ?? 'controlBackground';
  return status.pipe(map(current => (current === showing ? undefined : placeholder)));
}

export interface ImageProps extends ControlLayoutProps, MediaPlaceholderProps {
  ref?: UiNodeRef;
  /**
   * A URL the resolver can fetch, or several for the same picture tried
   * in order until one resolves: mirrors of a file, say. A bound value
   * is followed.
   */
  src: string | readonly string[];
  /**
   * What a screen reader reads instead of the picture.
   *
   * Omitting it makes the image **decorative**: no role and no name,
   * so it is not in the semantics tree at all. That is ARIA's rule and
   * it is the right default for a bullet or a divider glyph — but it
   * is a decision, so a caller that wants the image announced must say
   * what to announce, and there is no way to get a nameless `image`
   * record.
   */
  alt?: string;
  objectFit?: ObjectFit;
  borderRadius?: number;
}

/**
 * A picture, fetched and decoded off the main thread.
 *
 * The bitmap arrives through the `imageSource` modifier rather than a
 * subscription in this body, so it is released inside `removeSubtree`
 * when the node goes — see `media.ts` for why that matters more for an
 * image than for anything else in the library.
 */
export function Image(inputs: Inputs<ImageProps>, ctx: ComponentContext): UiChild {
  const store = ctx.inject(MediaService);
  const alt = input(inputs.alt, undefined);
  const objectFit = input(inputs.objectFit, 'cover' as ObjectFit);
  const radius = input(inputs.borderRadius, 0);
  const status = internalState<'loading' | 'loaded' | 'failed'>('loading');

  // Built once, in the body, so its identity is stable across renders
  // and the modifier is never re-attached. The source is the cell
  // itself, not its value: the modifier follows it, so an `Image` bound
  // to a `src` that changes shows the new picture and releases the old.
  const source = {
    resolver: store.images,
    source: inputs.src,
    onState: (next: 'loading' | 'loaded' | 'failed') => (status.value = next)
  };

  return Box({
    ...layoutOf(inputs),
    ref: inputs.ref?.value,
    modifiers: modifiersOf(inputs, imageSource(source)),
    objectFit,
    borderRadius: radius,
    // A tint of the surface while it decodes and after it fails, so a
    // list of thumbnails does not jump as they arrive. The theme
    // decides what that is unless the caller says otherwise; nothing
    // here names a colour either way.
    backgroundColor: placeholderTint(inputs.placeholderColor, status, 'loaded'),
    // No role at all when there is no name: an unnamed `image` record
    // is worse than none.
    role: alt.pipe(map(text => (text === undefined ? undefined : ('image' as const)))),
    label: alt,
    // A picture is not selectable text and must not swallow a drag
    // meant for the list it sits in.
    selectable: false
  });
}

export interface VideoProps extends ControlLayoutProps, MediaPlaceholderProps {
  ref?: UiNodeRef;
  /** A URL to an MP4 the resolver can fetch; see `Mp4Demuxer` for what it reads. */
  src: string;
  /**
   * What a screen reader reads instead of the picture.
   *
   * The same rule `Image` follows: omitting it makes the video
   * decorative, which is a decision rather than a default, so there is
   * no way to get a nameless `image` record.
   */
  alt?: string;
  objectFit?: ObjectFit;
  borderRadius?: number;
  /** Start again when it ends. Defaults to true. */
  loop?: boolean;
  /** Start playing as soon as it is decoded. Defaults to true. */
  autoplay?: boolean;
  /** How fast to play: 1 is the clip's own rate. Read once, like `src`. */
  rate?: number;
  /** Starting level, 0 to 1, for the control and for `onVolume`. Defaults to 1. */
  volume?: number;
  muted?: boolean;
  /**
   * A still to show until there is a frame to show instead.
   *
   * A clip carries its own poster — the first decoded frame is
   * presented the moment the decoder is configured, playing or not —
   * so this is for the window *before* that: a file being fetched,
   * demuxed and configured has nothing to draw for longer than a
   * picture does, and `placeholderColor` alone is a coloured
   * rectangle. Point it at something small.
   *
   * It stays on the node rather than being cleared, and costs nothing
   * to: a renderer draws the video's frame where there is one and
   * falls back to the image where there is not, so the poster is also
   * what a clip that failed mid-stream comes back to.
   */
  poster?: string;
  /**
   * Stop decoding while the clip is scrolled out of view. Defaults to
   * true, and there is very rarely a reason to say otherwise: a clip
   * nobody can see that keeps decoding costs a frame budget and a
   * battery for nothing. Pass `false` where the clip is being drawn
   * somewhere the layout cannot account for — into a shared element
   * mid-flight, or off screen on purpose so it is warm when it
   * arrives.
   */
  pauseWhenHidden?: boolean;
  /**
   * Where the clip's position comes from, when something other than
   * this clip owns time — sound being played by the shell, most of
   * all. See `VideoClock`.
   */
  clock?: VideoClock;
  /**
   * Draw a transport over the bottom of the picture.
   *
   * `true` takes the lot: play and pause, a scrubber, the elapsed and
   * total time, a mute and level where sound is wired, and a
   * fullscreen button. An object turns individual parts off, or makes
   * the bar permanent rather than revealing it on hover.
   *
   * **The bar is the same components anyone else would use.** It is
   * `Button`, `Slider` and `Icon` driven through the public
   * `VideoTransport`, with no privileged access to the decoder, so an
   * application that wants a different bar builds one the same way and
   * loses nothing. What this prop buys is not capability but the
   * default: a clip that behaves the way people expect a clip to
   * behave, without assembling it.
   *
   * Off by default, because a `Video` is as often a background or a
   * texture as it is something to watch, and chrome over one of those
   * is noise.
   */
  controls?: boolean | VideoControlsOptions;
  /**
   * Handed the transport once the clip has a playback to control.
   *
   * How a `Video` is driven from outside without `controls`: the
   * rectangle stays a rectangle and whatever a reader presses is built
   * beside it.
   */
  onTransport?: (transport: VideoTransport) => void;
  /**
   * Told when the volume or the mute changed.
   *
   * Nothing here plays sound, so this is the wiring an application
   * supplies to make the level mean something. Supplying it is also
   * what makes `controls` draw a volume control at all.
   */
  onVolume?: (volume: number, muted: boolean) => void;
  /**
   * Told when the clip starts loading, gets a picture, or fails.
   *
   * The failure carries what went wrong, which is the only place an
   * application can see it: nothing is drawn for a clip that will not
   * play beyond the placeholder tint, deliberately, because what to
   * say about it belongs to the interface and not to a rectangle.
   */
  onState?: (state: VideoState, error?: unknown) => void;
}

/**
 * A moving picture, decoded off the main thread.
 *
 * Deliberately the same shape as `Image`, because from an application's
 * side that is what it is: a rectangle with a picture in it, fitted and
 * clipped by the same props. What differs is underneath — see
 * `videoSource` for the pacing, and `UiVideo` for why the renderers are
 * handed a surface rather than a frame.
 *
 * Playback is shared by source. Two `Video`s pointed at one file watch
 * one decode, and a `Video` that appears on a new screen while the old
 * one is still leaving picks up the playback already running rather
 * than starting over.
 */
export function Video(inputs: Inputs<VideoProps>, ctx: ComponentContext): UiChild {
  const store = ctx.inject(MediaService);
  const shell = ctx.inject(ShellService);
  const alt = input(inputs.alt, undefined);
  const objectFit = input(inputs.objectFit, 'cover' as ObjectFit);
  const radius = input(inputs.borderRadius, 0);
  const status = internalState<VideoState>('loading');

  // Built once, in the body, for the reason `Image`'s source is: the
  // component's body runs once, and a `Video` whose src changes is a
  // different video — give it a `key`.
  const source = {
    resolver: store.videos,
    source: inputs.src.value,
    loop: inputs.loop.value,
    autoplay: inputs.autoplay.value,
    rate: inputs.rate.value,
    pauseWhenHidden: inputs.pauseWhenHidden.value,
    clock: inputs.clock.value,
    onState: (next: VideoState, error?: unknown) => {
      status.value = next;
      inputs.onState.value?.(next, error);
    },
    volume: inputs.volume.value,
    muted: inputs.muted.value,
    onVolume: (level: number, silent: boolean) => inputs.onVolume.value?.(level, silent),
    onReady: (transport: VideoTransport) => {
      held.value = transport;
      inputs.onTransport.value?.(transport);
    }
  };

  const poster = inputs.poster.value;
  const controls = inputs.controls.value;
  const wanted: VideoControlsOptions | null =
    controls === undefined || controls === false ? null : controls === true ? {} : controls;
  // The transport arrives long after this body has run, so the bar is
  // built against a cell it fills in rather than against a value.
  const held = internalState<VideoTransport | null>(null, 'Video.transport');
  /**
   * Whether the pointer has been doing something here lately.
   *
   * Not "is the pointer inside the box", which is what this used to
   * be and is the wrong question in two directions. A pointer that
   * entered and then stopped is not using the controls, and every
   * player takes the bar away again after a few seconds of that. A
   * pointer that has just left is very often coming straight back,
   * and taking the bar away the instant it crosses the edge makes it
   * flicker on the way to a control.
   *
   * So: any movement here rouses it, and stillness for
   * `hideAfterMs` puts it away again, whether the pointer is still
   * inside or long gone. Resting *on* the bar is the exception, and
   * has to be, because a pointer held steady over a scrubber it is
   * about to press is the stillest the pointer ever is.
   */
  const roused = internalState(false, 'Video.roused');
  /** Whether the pointer is resting on the controls themselves. */
  let onBar = false;
  let idle: ReturnType<typeof setTimeout> | null = null;

  const restIdle = (): void => {
    if (idle !== null) {
      clearTimeout(idle);
      idle = null;
    }
  };

  const rouse = (): void => {
    if (!roused.value) {
      roused.value = true;
    }
    restIdle();
    const after = wanted?.hideAfterMs ?? DEFAULT_HIDE_AFTER_MS;
    if (after <= 0) {
      return;
    }
    idle = setTimeout(() => {
      idle = null;
      // A pointer parked on the bar is using it, however still it is.
      if (!onBar) {
        roused.value = false;
      }
    }, after);
  };

  ctx.onUnmount(restIdle);

  /**
   * Fullscreen is two things, and doing only the first is the bug this
   * exists to fix.
   *
   * The shell can put the **canvas** into fullscreen, because that is
   * the only real element there is: a clip here is pixels on a surface
   * shared with the rest of the application, not an element of its
   * own. So asking the shell and stopping there fills the screen with
   * the *app*, with the clip still its original size somewhere inside
   * it, which is not what anybody means by making a video fullscreen.
   *
   * The second half is this: while the shell reports fullscreen, the
   * clip is also drawn into the overlay layer with all four edges
   * pinned, so it covers the viewport. It is a second `Video` on the
   * same source, which costs nothing and needs no new machinery,
   * because playback is reference counted by source: the copy resolves
   * the playback the inline one is holding and picks it up exactly
   * where it is. That is the same trick that carries a clip through a
   * route change.
   */
  const overlay = useOverlay(ctx, 'video-fullscreen');
  /** Whether *this* clip asked. The shell's flag is the whole application's. */
  let asked = false;
  /**
   * This clip's node, so the copy on the overlay can be given the
   * theme it is standing in.
   *
   * The overlay layer re-provides theme, text style and content colour
   * from whatever node an entry names, and an entry that names none
   * inherits the root's: a dark application's controls came out of the
   * default light theme, which is the sort of thing that only shows up
   * once something is actually drawn over a picture.
   */
  let own: UiNode | null = null;
  const takeRef = (node: UiNode | null): void => {
    own = node;
    inputs.ref?.value?.(node);
  };

  const requestFullscreen = (enter: boolean): void => {
    asked = enter;
    shell.requestFullscreen(enter);
  };

  const barFor = (visible: Observable<boolean> | boolean, active: Observable<boolean>): UiChild =>
    createComponent(VideoControls, {
      transport: held,
      options: wanted ?? {},
      visible,
      onPointerWithin: (within: boolean) => {
        onBar = within;
        if (within) {
          rouse();
        }
      },
      volumeWired: inputs.onVolume.value !== undefined,
      fullscreenActive: active,
      onFullscreen: requestFullscreen
    });

  const bar = wanted === null ? null : barFor(roused, shell.fullscreen);

  if (wanted !== null) {
    const stop = shell.fullscreen.subscribe(active => {
      if (!active) {
        // Cleared whether this clip asked or not: Escape leaves
        // fullscreen without telling anyone, and a copy left on the
        // overlay would then cover an application that is no longer
        // filling the screen.
        asked = false;
        overlay.hide();
        return;
      }
      if (!asked || overlay.isOpen()) {
        return;
      }
      overlay.show(
        Box(
          {
            width: percent(100),
            height: percent(100),
            // The letterbox. A clip fitted to a screen of a different
            // shape has to sit on something, and black is what every
            // player puts there.
            backgroundColor: '#000000',
            y: 'end'
          },
          createComponent(Video, {
            src: inputs.src.value,
            alt: inputs.alt.value,
            // `contain` rather than whatever the inline one was given:
            // a clip filling the screen should be all of the clip.
            objectFit: 'contain',
            // Whatever the inline one is doing right now. It shares the
            // playback, so starting it here would start it there too.
            autoplay: held.value?.paused !== true,
            loop: inputs.loop.value,
            rate: inputs.rate.value,
            controls: wanted,
            onVolume: inputs.onVolume.value,
            width: percent(100),
            height: percent(100)
          })
        ),
        { top: 0, right: 0, bottom: 0, left: 0, environment: own }
      );
    });
    ctx.onUnmount(() => stop.unsubscribe());
  }

  return Box(
    {
      ...layoutOf(inputs),
      ref: takeRef,
      modifiers:
        poster === undefined
          ? modifiersOf(inputs, videoSource(source))
          : modifiersOf(inputs, imageSource({ resolver: store.images, source: poster }), videoSource(source)),
      objectFit,
      borderRadius: radius,
      // The bar is the only child, and it belongs at the bottom.
      ...(bar === null
        ? {}
        : {
            y: 'end' as const,
            overflow: 'hidden' as const,
            // Spread rather than set to undefined: an event prop that
            // is present and not a function is rejected outright, and
            // a `Video` with no controls must not register listeners
            // it has no use for.
            onPointerEnter: rouse,
            onPointerMove: rouse,
            // Leaving does not hide it; it lets the countdown that is
            // already running finish, which is what makes a pointer
            // that leaves and comes straight back not flicker.
            onPointerLeave: rouse
          }),
      // The same tint `Image` draws, from the same prop: a clip waiting
      // on a fetch, a demux and a decoder configuration has nothing to
      // show for longer than a picture does, and a clip that never
      // resolves has this box and nothing else.
      backgroundColor: placeholderTint(inputs.placeholderColor, status, 'playing'),
      // A rectangle showing a picture is an `image`. A rectangle
      // showing a picture *and carrying controls* is not: it is a
      // group of things, one of which is a toolbar, and announcing it
      // as an image would hide them behind a leaf.
      role:
        bar === null
          ? alt.pipe(map(text => (text === undefined ? undefined : ('image' as const))))
          : ('group' as const),
      label: alt,
      selectable: false
    },
    ...(bar === null ? [] : [bar])
  );
}

export interface IconProps extends ControlLayoutProps {
  ref?: UiNodeRef;
  /** SVG path data, in the coordinates of `viewBox`. */
  path: string;
  /** The square the path is authored in. 24 is the usual grid. */
  viewBox?: number;
  /** The side of the box the icon occupies, in logical pixels. */
  size?: number;
  /** A palette name or a literal colour. Defaults to the surrounding text colour. */
  color?: UiColorValue;
  style?: 'fill' | 'stroke';
  /** Line width for a stroked icon, in viewBox units. */
  strokeWidth?: number;
  /** How a filled path decides what is inside it; see `IconSpec.fillRule`. */
  fillRule?: 'nonzero' | 'evenodd';
  /** What a screen reader reads. Omitted makes the icon decorative. */
  label?: string;
}

/**
 * A glyph drawn from a path.
 *
 * The atlas comes later and the first cut
 * rasterises per icon, replaced later without an API change. This is
 * that first cut: the props below are what an atlas-backed version
 * would take too, because what changes is where the pixels live, not
 * what an icon is. `IconRasterizer`'s docblock states what the per-icon
 * version costs, so the atlas has a number to beat.
 */
export function Icon(inputs: Inputs<IconProps>, ctx: ComponentContext): UiChild {
  const store = ctx.inject(MediaService);
  const label = input(inputs.label, undefined);
  const size = input(inputs.size, 16);

  // The cells themselves, not their values: the modifier follows each
  // one, so a glyph whose path or colour is bound to state redraws when
  // that state changes, and a caller never needs to key a new `Icon`
  // to change what it shows.
  const spec = {
    rasterizer: store.icons,
    path: inputs.path,
    viewBox: input(inputs.viewBox, 24),
    size,
    color: input(inputs.color, 'controlForeground' as UiColorValue),
    style: input(inputs.style, 'fill' as const),
    strokeWidth: input(inputs.strokeWidth, 2),
    fillRule: input(inputs.fillRule, 'nonzero' as const)
  };

  return Box({
    ...layoutOf(inputs),
    ref: inputs.ref?.value,
    modifiers: modifiersOf(inputs, iconSource(spec)),
    width: size,
    height: size,
    flexShrink: 0,
    objectFit: 'fill',
    role: label.pipe(map(text => (text === undefined ? undefined : ('image' as const)))),
    label,
    selectable: false,
    hitTestable: false
  });
}

export interface SpinnerProps extends ControlLayoutProps {
  size?: number;
  /** What a screen reader reads while it turns. */
  label?: string;
  color?: UiColorValue;
}

/** Milliseconds between the spinner's eight positions. */
const SPINNER_STEP_MS = 110;
const SPINNER_BLADES = 8;

/**
 * The library's first animation, now driven by F4's `ticks` phase.
 *
 * Eight blades of fixed, decreasing opacity sit in a container, and
 * the **container's rotation** is the only thing that changes — so a
 * turn is one property write eight times a second, not eight writes
 * sixty times a second. The media tier promised that this version would
 * replace the interval with a subscription and change nothing else,
 * and this is that: a repeating tween whose easing has eight steps and
 * whose `stepMs` is one step long, so the runtime wakes eight times a
 * second rather than sixty and writes the same eight values the timer
 * wrote. What it gains over the timer is that it stops when the
 * component leaves, that it is on the frame clock rather than beside
 * it, and that it appears in the profiler as `ticks`.
 *
 * It **keeps turning under reduced motion.** A spinner that stands
 * still is not a calmer spinner: it is one that says work has stopped.
 * WCAG 2.3.3 is about motion triggered by interaction, and a busy
 * indicator is not that; see `UiReducedMotionPolicy`.
 *
 * It is a `status` rather than a `progressbar`: a spinner says work is
 * happening and cannot say how much, and `busy` is the state for that.
 */
export function Spinner(inputs: Inputs<SpinnerProps>, ctx: ComponentContext): UiChild {
  const size = inputs.size.value ?? 20;
  const label = input(inputs.label, 'Loading');
  const color = inputs.color.value ?? 'controlAccent';
  const step = internalState(0);

  const animations = ctx.inject(AnimationService);
  animations.animate(step, SPINNER_BLADES, {
    duration: SPINNER_BLADES * SPINNER_STEP_MS,
    easing: steps(SPINNER_BLADES),
    stepMs: SPINNER_STEP_MS,
    repeat: true,
    reducedMotion: 'keep'
  });
  ctx.onUnmount(() => animations.stop(step));

  const blade = size * 0.22;
  const radius = size / 2 - blade / 2;
  const blades: UiElement[] = [];
  for (let i = 0; i < SPINNER_BLADES; i++) {
    const angle = (i / SPINNER_BLADES) * Math.PI * 2;
    blades.push(
      Box({
        position: 'absolute',
        left: size / 2 - blade / 2 + radius * Math.sin(angle),
        top: size / 2 - blade / 2 - radius * Math.cos(angle),
        width: blade,
        height: blade,
        borderRadius: blade / 2,
        backgroundColor: color,
        // The trail: the blade in front is brightest, and the rest fade
        // behind it. Fixed per blade, so rotating the container is the
        // whole animation.
        opacity: 0.15 + 0.85 * ((SPINNER_BLADES - i) / SPINNER_BLADES)
      })
    );
  }

  return Box(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      width: size,
      height: size,
      flexShrink: 0,
      position: 'relative',
      role: 'status',
      label,
      states: ['busy'] as UiSemanticState[],
      // `x` and `y` are the pivot, not a translation, so half the side
      // each turns the spinner about its middle. Written against the
      // property's old docblock it turned about its top-left corner and
      // swung across the card, which is what the browser showed.
      transform: step.pipe(
        map(current => ({
          x: size / 2,
          y: size / 2,
          rotation: (current / SPINNER_BLADES) * Math.PI * 2
        }))
      )
    },
    ...blades
  );
}

export interface ProgressBarProps extends ControlLayoutProps {
  /** The work done so far. Omitted makes the bar indeterminate. */
  value?: number;
  min?: number;
  max?: number;
  label?: string;
  /** Track thickness. */
  thickness?: number;
}

/** Milliseconds between the indeterminate bar's positions. */
const PROGRESS_STEP_MS = 90;
const PROGRESS_STEPS = 24;

/**
 * How far along something is, or that it is going at all.
 *
 * Determinate and indeterminate are one component because they are one
 * control to a screen reader: the same `progressbar` role, with the
 * value present or absent. ARIA says an indeterminate bar omits
 * `aria-valuenow` rather than reporting zero, and this does the same —
 * reporting zero would tell a reader that no progress has been made,
 * which is a stronger and different claim than "unknown".
 */
export function ProgressBar(inputs: Inputs<ProgressBarProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Progress');
  const min = input(inputs.min, 0);
  const max = input(inputs.max, 1);
  const thickness = inputs.thickness.value ?? 6;
  const indeterminate = inputs.value.value === undefined;
  const step = internalState(0);

  if (indeterminate) {
    // The same shape as `Spinner`: a stepped, repeating tween sampled
    // once per step, so the sweep costs twenty-four writes a sweep and
    // twenty-four wake-ups, not sixty a second. It keeps sweeping
    // under reduced motion for the same reason a spinner keeps
    // turning — a still indeterminate bar states that nothing is
    // happening.
    const animations = ctx.inject(AnimationService);
    animations.animate(step, PROGRESS_STEPS, {
      duration: PROGRESS_STEPS * PROGRESS_STEP_MS,
      easing: steps(PROGRESS_STEPS),
      stepMs: PROGRESS_STEP_MS,
      repeat: true,
      reducedMotion: 'keep'
    });
    ctx.onUnmount(() => animations.stop(step));
  }

  const fraction: Observable<number> = indeterminate
    ? step.pipe(map(() => 0))
    : inputs.value.pipe(
        map(current => {
          const low = min.value;
          const high = max.value;
          const span = high - low;
          return span <= 0 ? 0 : Math.min(1, Math.max(0, ((current as number) - low) / span));
        })
      );

  const bar = indeterminate
    ? // A sliver that sweeps the track. `left` is a percentage of the
      // track, so the sweep is layout rather than a computed offset and
      // it follows the track when the bar is resized.
      Box({
        position: 'absolute',
        top: 0,
        left: step.pipe(map(current => percent((current / PROGRESS_STEPS) * 100))),
        width: percent(100 / 4),
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: 'controlAccent'
      })
    : Box({
        position: 'absolute',
        top: 0,
        left: 0,
        width: fraction.pipe(map(part => percent(part * 100))),
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: 'controlAccent'
      });

  return Box(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      height: thickness,
      borderRadius: thickness / 2,
      backgroundColor: 'controlBackground',
      overflow: 'hidden',
      position: 'relative',
      role: 'progressbar',
      label,
      // Absent while indeterminate, which is what ARIA means by it.
      valueNow: indeterminate ? undefined : inputs.value,
      valueMin: indeterminate ? undefined : min,
      valueMax: indeterminate ? undefined : max,
      states: (indeterminate ? ['busy'] : []) as UiSemanticState[]
    },
    ...(bar === null ? [] : [bar])
  );
}
