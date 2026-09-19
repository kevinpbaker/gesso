import {
  AnimationService,
  computed,
  input,
  internalState,
  type ComponentContext,
  type InternalState,
  type Inputs
} from '@gesso/framework';
import {
  Box,
  Column,
  percent,
  type UiChild,
  type UiEasing,
  type UiElement,
  type UiLength,
  type UiSemanticState
} from '@gesso/core';
import { layoutOf, type ControlLayoutProps, modifiersOf } from './internals';

/**
 * A grey stand-in with the same box as the content it is waiting for.
 *
 * The reason it exists is not that a loading screen should look busy.
 * It is that **a list which fills in must not move what is under it.**
 * Segue hand-rolled this before the library had it: `rows.tsx` exports
 * `ROW_HEIGHT` for no other purpose than to let `RowSkeleton` occupy
 * exactly the same box as the real row, so the thumb resting over the
 * third row is still over the third row once the data lands. A
 * stand-in whose box differs from the content it stands in for is
 * worse than no stand-in at all: nothing is the absence of a jump, and
 * a wrong box is a jump plus the flicker of the grey thing that caused
 * it.
 *
 * Everything else follows from that. The box is the caller's, because
 * only the caller knows what is coming. `circle` exists because an
 * avatar's place is round and a square stand-in for it is the same
 * mistake at a smaller scale. `SkeletonText` exists because a
 * paragraph's stand-in is several bars of differing width, and making
 * every caller write that loop is the thing a library exists to
 * prevent.
 *
 * The ground is `placeholder`, the palette's own token for this, read
 * at paint from whatever theme the node inherits. It is not a prop and
 * it is not borrowed from `border`: see `UiColors.placeholder` for why
 * it is its own token. Restyling is a theme provider, as everywhere
 * else in the library (`COMPONENTS_ROADMAP.md` §2.3).
 */

/** One breath, out and back, in milliseconds. */
const SHIMMER_PERIOD_MS = 1600;

/**
 * Milliseconds between samples of the breath.
 *
 * Ten wake-ups a second and ten property writes a second, not sixty of
 * each, on the same reasoning `Spinner` gives for its eight: the value
 * is decoration, the eye cannot tell a hundred-millisecond step of an
 * opacity ramp from a continuous one, and a screenful of skeletons is
 * exactly the moment an application can least afford the frames. A run
 * of `SkeletonText` costs one write however many bars it draws,
 * because the opacity is on the column and not on each bar.
 */
const SHIMMER_STEP_MS = 100;

/** The dim end of the breath; the bright end is the block at full strength. */
const SHIMMER_DIM = 0.55;

/**
 * There and back from one repeating tween.
 *
 * `UiTween` with `repeat` samples `easing(elapsed % duration / duration)`,
 * so an easing that returns to its start at t = 1 gives an out-and-back
 * with no second animation and no bookkeeping: this one is 0 at t = 0,
 * 1 at t = 0.5 and back to 0 as t approaches 1. A cosine rather than a
 * triangle because a breath has no corners in it; the eye reads a
 * linear ramp that reverses as a blink.
 *
 * Nothing downstream clamps an easing's output (`UiEasing` says so),
 * but this one stays inside [0, 1] anyway.
 */
const BREATH: UiEasing = t => (1 - Math.cos(2 * Math.PI * t)) / 2;

/** A default block is a line of body text's worth of grey. */
const BLOCK_HEIGHT = 16;
/** A round stand-in with no size given: an avatar's usual place. */
const CIRCLE_SIZE = 40;
/** Larger than any radius a skeleton can need, so `circle` is round. */
const ROUND = 999;
/** The stock corner, matched to the library's small controls. */
const BLOCK_RADIUS = 4;

const BUSY: readonly UiSemanticState[] = Object.freeze(['busy']) as readonly UiSemanticState[];

export interface SkeletonProps extends ControlLayoutProps {
  /** Corner rounding. Ignored when `circle` is set, which is round. */
  radius?: number;
  /**
   * Breathe, rather than standing still. Off by default: a skeleton is
   * already saying that content is coming, and a page full of moving
   * grey is a page that is harder to read past than a page of still
   * grey. Turn it on where the wait is long enough that a still block
   * starts to read as a broken layout.
   */
  shimmer?: boolean;
  /** A round stand-in, for an avatar's place. */
  circle?: boolean;
  /** What a screen reader says while it waits. */
  label?: string;
  /**
   * Whether it says anything at all. See "Announcing" below.
   */
  announce?: boolean;
}

/**
 * Announcing, and why it is a prop rather than a fact.
 *
 * A `status` is a live region: an assistive technology reads it when it
 * appears. One skeleton standing in for one thing should say "Loading"
 * once. Twelve of them standing in for a list should also say it
 * **once**, and a component that announced unconditionally would say it
 * twelve times, which is worse than silence because it is twelve
 * interruptions that carry one bit between them.
 *
 * So the rule is: the container speaks and the bars are silent.
 * `SkeletonText` implements it for the run it draws, announcing on the
 * column and passing `announce: false` down. A caller assembling a
 * group by hand (a row's stand-in, a grid of cards) does the same:
 * `announce={false}` on every `Skeleton` in the group, and one region
 * around them that says it. The default is `true` so that the single
 * skeleton, which is the common case and the one nobody thinks about,
 * is announced rather than silent by an oversight.
 */
export function Skeleton(inputs: Inputs<SkeletonProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Loading');
  const announce = input(inputs.announce, true);
  // Read once, like `Chip`'s axes: each decides the *shape* of the
  // element built in this body, and a body runs a single time. A
  // skeleton that has to change from block to circle changes its `key`.
  const circle = inputs.circle.value === true;
  const radius = inputs.radius.value ?? (circle ? ROUND : BLOCK_RADIUS);

  const layout = layoutOf(inputs);
  const sized = sizeOf(layout, circle);

  return Box({
    ...layout,
    ...sized,
    modifiers: modifiersOf(inputs),
    borderRadius: radius,
    backgroundColor: 'placeholder',
    opacity: breath(inputs, ctx),
    // Furniture, not content: nothing to select, and the pointer goes
    // through to whatever the skeleton is sitting in, which is what a
    // caller who put a stand-in inside a pressable card wants.
    selectable: false,
    hitTestable: false,
    role: computed(() => (announce.value ? ('status' as const) : undefined)),
    label: computed(() => (announce.value ? label.value : undefined)),
    states: computed(() => (announce.value ? BUSY : undefined))
  });
}

export interface SkeletonTextProps extends ControlLayoutProps {
  /** How many bars. Read once; change `key` to change it. */
  lines?: number;
  /**
   * The width of each bar, in order.
   *
   * `UiLength` rather than the `number | string` a CSS library would
   * take, because `percent(60)` is how this codebase writes a
   * percentage and `UiLength` is deliberately never a string to parse.
   * Short of `lines`, the last entry repeats.
   *
   * The default ramp is full width for every bar but the last, which is
   * 60%, because that is what a paragraph does: only its final line
   * stops early. A ramp with no short line reads as a table.
   */
  widths?: readonly UiLength[];
  /** How thick each bar is. */
  lineHeight?: number;
  /** The space between bars. */
  gap?: number;
  shimmer?: boolean;
  label?: string;
  announce?: boolean;
}

const DEFAULT_LINES = 3;
const DEFAULT_LINE_HEIGHT = 12;
const DEFAULT_GAP = 8;
/** How far the last line falls short, as a paragraph's does. */
const LAST_LINE = percent(60);
const FULL_LINE = percent(100);

/**
 * A paragraph's stand-in: a run of bars of differing width.
 *
 * One component rather than a loop at every call site, and one
 * announcement rather than one per bar: the column carries the
 * `status` and the bars carry nothing, which is the rule `Skeleton`'s
 * docblock sets out. The shimmer, when it is on, is one cell writing
 * the column's opacity, so a ten-line run costs exactly what a one-line
 * run costs.
 */
export function SkeletonText(inputs: Inputs<SkeletonTextProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Loading');
  const announce = input(inputs.announce, true);
  // Read once: the number of bars decides how many elements this body
  // builds, and the body runs a single time.
  const count = Math.max(1, Math.round(inputs.lines.value ?? DEFAULT_LINES));
  const widths = inputs.widths.value ?? defaultWidths(count);
  const lineHeight = inputs.lineHeight.value ?? DEFAULT_LINE_HEIGHT;

  const bars: UiElement[] = [];
  for (let index = 0; index < count; index++) {
    bars.push(
      Box({
        // Short of `lines`, the last given width repeats, rather than
        // the bar collapsing to nothing and leaving a gap in the run.
        width: widths[Math.min(index, widths.length - 1)] ?? FULL_LINE,
        height: lineHeight,
        borderRadius: BLOCK_RADIUS,
        backgroundColor: 'placeholder',
        flexShrink: 0,
        selectable: false,
        hitTestable: false
      })
    );
  }

  return Column(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      gap: input(inputs.gap, DEFAULT_GAP),
      opacity: breath(inputs, ctx),
      role: computed(() => (announce.value ? ('status' as const) : undefined)),
      label: computed(() => (announce.value ? label.value : undefined)),
      states: computed(() => (announce.value ? BUSY : undefined))
    },
    ...bars
  );
}

/** Full width for every bar but the last, which stops short. */
function defaultWidths(count: number): readonly UiLength[] {
  const widths: UiLength[] = [];
  for (let index = 0; index < count; index++) {
    widths.push(index === count - 1 && count > 1 ? LAST_LINE : FULL_LINE);
  }
  return widths;
}

/**
 * The breathing opacity, or nothing at all.
 *
 * Built the way `Spinner` builds its turn: one cell, one repeating
 * tween on `AnimationService`, a `stepMs` that keeps the runtime from
 * waking sixty times a second for decoration, and
 * `ctx.onUnmount(() => animations.stop(cell))`, because a driver
 * holding a cell holds every closure the component that made it
 * captured.
 *
 * **Reduced motion stops it, and that is the opposite of what
 * `Spinner` does.** `Spinner` passes `reducedMotion: 'keep'` on the
 * grounds that a still spinner is not a calmer spinner but one that
 * says work has stopped: its movement *is* the information, so WCAG
 * 2.3.3 (which is about motion triggered by interaction) does not ask
 * for it to stop. A shimmer carries nothing a still block does not
 * already carry. The grey box says "content is coming" whether or not
 * it breathes, so the breath is pure decoration and takes the default
 * `'snap'` policy: under a reduced-motion preference, and on a hidden
 * tab, `AnimationDriver` never lets it into the running set at all.
 *
 * Which is why the tween runs *from* the dim end *to* full strength
 * rather than the other way round. `snap()` writes the target, so a
 * snapped shimmer rests at 1 and is pixel-for-pixel the still skeleton
 * the caller would have got by leaving `shimmer` off. Written the
 * obvious way round, a reduced-motion preference would leave every
 * skeleton on the screen permanently dimmed, which is a worse block
 * than the one it was asked to calm down.
 */
function breath(inputs: Inputs<{ shimmer?: boolean }>, ctx: ComponentContext): InternalState<number> | undefined {
  // Read once. A shimmer that could be switched on later would mean
  // owning a cell and a subscription in every skeleton that will never
  // use one, and the switch is a `key` away for the caller who wants it.
  if (inputs.shimmer.value !== true) {
    return undefined;
  }
  const animations = ctx.inject(AnimationService);
  const opacity = internalState(SHIMMER_DIM);
  animations.animate(opacity, 1, {
    duration: SHIMMER_PERIOD_MS,
    easing: BREATH,
    stepMs: SHIMMER_STEP_MS,
    repeat: true
  });
  ctx.onUnmount(() => animations.stop(opacity));
  return opacity;
}

/**
 * The box, when the caller did not give one.
 *
 * A stand-in with no size is not a stand-in, so both axes always end up
 * decided. A block fills the width it is given and is one line of body
 * text tall; a circle with one axis given derives the other from
 * `aspectRatio`, so `<Skeleton circle width={32} />` is a 32 pixel
 * disc rather than a 32 pixel stripe.
 */
function sizeOf(layout: Record<string, unknown>, circle: boolean): Record<string, unknown> {
  const hasWidth = layout.width !== undefined;
  const hasHeight = layout.height !== undefined;
  if (!circle) {
    return {
      width: hasWidth ? layout.width : FULL_LINE,
      height: hasHeight ? layout.height : BLOCK_HEIGHT
    };
  }
  if (!hasWidth && !hasHeight) {
    return { width: CIRCLE_SIZE, height: CIRCLE_SIZE, flexShrink: 0 };
  }
  return {
    width: layout.width,
    height: layout.height,
    // Only when one axis is open: two definite sides are the caller's
    // business, and a ratio fighting them would be the library
    // overruling a number somebody typed.
    aspectRatio: hasWidth !== hasHeight ? 1 : undefined,
    flexShrink: 0
  };
}
