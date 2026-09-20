import { map, type Observable } from 'rxjs';

import {
  input,
  internalState,
  type ComponentContext,
  type InputCell,
  type Inputs,
  MediaService,
  AnimationService
} from '@gesso/framework';
import {
  steps,
  Box,
  type UiChild,
  type UiElement,
  percent,
  type UiNodeRef,
  type ObjectFit,
  type UiColorValue,
  type UiSemanticState,
  iconSource,
  imageSource,
  videoSource
} from '@gesso/core';
import { layoutOf, type ControlLayoutProps, modifiersOf } from './internals';

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
  const alt = input(inputs.alt, undefined);
  const objectFit = input(inputs.objectFit, 'cover' as ObjectFit);
  const radius = input(inputs.borderRadius, 0);
  const status = internalState<'loading' | 'playing' | 'failed'>('loading');

  // Built once, in the body, for the reason `Image`'s source is: the
  // component's body runs once, and a `Video` whose src changes is a
  // different video — give it a `key`.
  const source = {
    resolver: store.videos,
    source: inputs.src.value,
    loop: inputs.loop.value,
    autoplay: inputs.autoplay.value,
    onState: (next: 'loading' | 'playing' | 'failed') => (status.value = next)
  };

  return Box({
    ...layoutOf(inputs),
    ref: inputs.ref?.value,
    modifiers: modifiersOf(inputs, videoSource(source)),
    objectFit,
    borderRadius: radius,
    // The same tint `Image` draws, from the same prop: a clip waiting
    // on a fetch, a demux and a decoder configuration has nothing to
    // show for longer than a picture does, and a clip that never
    // resolves has this box and nothing else.
    backgroundColor: placeholderTint(inputs.placeholderColor, status, 'playing'),
    role: alt.pipe(map(text => (text === undefined ? undefined : ('image' as const)))),
    label: alt,
    selectable: false
  });
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
    bar
  );
}
