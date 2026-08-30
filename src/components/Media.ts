import { map, type Observable } from 'rxjs';

import { input } from '../framework/Input';
import { state } from '../framework/State';
import type { ComponentContext, Inputs } from '../framework/FunctionComponent';
import { MediaStore } from '../framework/app/MediaStore';
import { AnimationStore } from '../framework/app/AnimationStore';
import { steps } from '../ui/animation';
import { Box } from '../ui/composition/UiComponents';
import type { UiChild, UiElement } from '../ui/composition/UiElement';
import { percent } from '../ui/layout/UiLength';
import type { UiNodeRef } from '../ui/composition/UiElementProps';
import type { ObjectFit } from '../ui/rendering/PaintState';
import type { UiColorValue } from '../ui/properties/UiPropertyValues';
import type { UiSemanticState } from '../ui/properties/UiSemantics';
import { iconSource, imageSource } from '../ui/modifiers';
import { layoutOf, type ControlLayoutProps } from './internals';

/**
 * The Media tier (`COMPONENTS_ROADMAP.md` C7).
 *
 * All four are the same shape as the rest of the library — no colour
 * props, semantics from the first line, layout props passed through —
 * and none of them is renderer work. `UiImage` and `objectFit` have
 * been on both backends since the WebGPU parity milestone; what was
 * missing was everything in front of them, which is `ImageResolver`,
 * `IconRasterizer` and the two modifiers that write `image`.
 */

export interface ImageProps extends ControlLayoutProps {
  ref?: UiNodeRef;
  /** A URL the resolver can fetch. */
  src: string;
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
  /** Shown while the bitmap is decoding and if it fails. */
  placeholderColor?: never;
}

/**
 * A picture, fetched and decoded off the main thread.
 *
 * The bitmap arrives through the `imageSource` modifier rather than a
 * subscription in this body, so it is released inside `removeSubtree`
 * when the node goes — see `media.ts` for why that matters more for an
 * image than for anything else in the library.
 */
export function Image(props: Inputs<ImageProps>, ctx: ComponentContext): UiChild {
  const store = ctx.inject(MediaStore);
  const alt = input(props.alt, undefined);
  const objectFit = input(props.objectFit, 'cover' as ObjectFit);
  const radius = input(props.borderRadius, 0);
  const status = state<'loading' | 'loaded' | 'failed'>('loading');

  // Built once, in the body, so its identity is stable across renders
  // and the modifier is never re-attached. The source is read once for
  // the same reason: a component's body runs once, and an `Image` whose
  // src changes is a different image — give it a `key`.
  const source = {
    resolver: store.images,
    source: props.src.value,
    onState: (next: 'loading' | 'loaded' | 'failed') => (status.value = next)
  };

  return Box({
    ...layoutOf(props),
    ref: props.ref?.value,
    modifiers: [imageSource(source)],
    objectFit,
    borderRadius: radius,
    // A tint of the surface while it decodes and after it fails, so a
    // list of thumbnails does not jump as they arrive. The theme
    // decides what that is; nothing here names a colour.
    backgroundColor: status.pipe(map(current => (current === 'loaded' ? undefined : 'controlBackground'))),
    // No role at all when there is no name: an unnamed `image` record
    // is worse than none.
    role: alt.pipe(map(text => (text === undefined ? undefined : ('image' as const)))),
    label: alt,
    // A picture is not selectable text and must not swallow a drag
    // meant for the list it sits in.
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
  /** What a screen reader reads. Omitted makes the icon decorative. */
  label?: string;
}

/**
 * A glyph drawn from a path.
 *
 * `COMPONENTS_ROADMAP.md` C7 says the atlas is F9's and the first cut
 * rasterises per icon, replaced later without an API change. This is
 * that first cut: the props below are what an atlas-backed version
 * would take too, because what changes is where the pixels live, not
 * what an icon is. `IconRasterizer`'s docblock states what the per-icon
 * version costs, so the atlas has a number to beat.
 */
export function Icon(props: Inputs<IconProps>, ctx: ComponentContext): UiChild {
  const store = ctx.inject(MediaStore);
  const label = input(props.label, undefined);
  const size = props.size.value ?? 16;

  const spec = {
    rasterizer: store.icons,
    path: props.path.value,
    viewBox: props.viewBox.value ?? 24,
    size,
    color: props.color.value ?? 'controlForeground',
    style: props.style.value ?? 'fill',
    strokeWidth: props.strokeWidth.value ?? 2
  };

  return Box({
    ...layoutOf(props),
    ref: props.ref?.value,
    modifiers: [iconSource(spec)],
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
 * sixty times a second. `decisions/0028` promised the F4 version would
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
export function Spinner(props: Inputs<SpinnerProps>, ctx: ComponentContext): UiChild {
  const size = props.size.value ?? 20;
  const label = input(props.label, 'Loading');
  const color = props.color.value ?? 'controlAccent';
  const step = state(0);

  const animations = ctx.inject(AnimationStore);
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
      ...layoutOf(props),
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
export function ProgressBar(props: Inputs<ProgressBarProps>, ctx: ComponentContext): UiChild {
  const label = input(props.label, 'Progress');
  const min = input(props.min, 0);
  const max = input(props.max, 1);
  const thickness = props.thickness.value ?? 6;
  const indeterminate = props.value.value === undefined;
  const step = state(0);

  if (indeterminate) {
    // The same shape as `Spinner`: a stepped, repeating tween sampled
    // once per step, so the sweep costs twenty-four writes a sweep and
    // twenty-four wake-ups, not sixty a second. It keeps sweeping
    // under reduced motion for the same reason a spinner keeps
    // turning — a still indeterminate bar states that nothing is
    // happening.
    const animations = ctx.inject(AnimationStore);
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
    : props.value.pipe(
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
      ...layoutOf(props),
      height: thickness,
      borderRadius: thickness / 2,
      backgroundColor: 'controlBackground',
      overflow: 'hidden',
      position: 'relative',
      role: 'progressbar',
      label,
      // Absent while indeterminate, which is what ARIA means by it.
      valueNow: indeterminate ? undefined : props.value,
      valueMin: indeterminate ? undefined : min,
      valueMax: indeterminate ? undefined : max,
      states: (indeterminate ? ['busy'] : []) as UiSemanticState[]
    },
    bar
  );
}
