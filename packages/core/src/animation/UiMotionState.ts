import type { UiEasing } from './UiEasing';
import type { UiReducedMotionPolicy } from './UiAnimation';
import type { UiDurationToken, UiEasingToken, UiSpringSpec, UiSpringToken } from '../environment/UiMotion';

/**
 * Where an element is, visually, relative to where the layout put it.
 *
 * Six numbers and nothing else, chosen because they are exactly the
 * ones that cost no layout: opacity, a translation, a scale per axis
 * and a rotation all resolve inside `PaintState`, so an element moving
 * through them marks Paint and the layout engine never runs. Anything
 * that would move the box — a width, a margin, a gap — is deliberately
 * not here; it belongs to the layout, and animating it is what the
 * declarative `transition` prop is for.
 *
 * Every field is an *offset from rest*. Omitting one means "leave it
 * where it belongs", which is what lets `{ opacity: 0 }` be a complete
 * description of a fade without also asserting a scale of 1.
 */
export interface MotionState {
  readonly opacity?: number;
  /** Logical pixels right of where the layout put it. */
  readonly x?: number;
  /** Logical pixels below where the layout put it. */
  readonly y?: number;
  /** Both axes at once; `scaleX`/`scaleY` override it per axis. */
  readonly scale?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  /** Radians, about the node's centre. */
  readonly rotate?: number;
}

/**
 * One state, or several to be laid over each other left to right.
 *
 * `[fade, slideUp(16)]` is the idiom, and it reads as what it does.
 * An array rather than a `fade.and(...)` builder because a state is
 * data — a component may compute one, store one, or receive one as a
 * prop — and a plain object stays comparable, serialisable and
 * inspectable in a way a builder object does not.
 */
export type MotionStateInput = MotionState | readonly MotionState[];

/** The six channels a motion state drives, all resolved. */
export interface ResolvedMotionState {
  readonly opacity: number;
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotate: number;
}

/** Where an element sits when nothing is animating it. */
export const MOTION_REST: ResolvedMotionState = {
  opacity: 1,
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotate: 0
};

/** The channel names, for anything that has to walk them. */
export const MOTION_CHANNELS = ['opacity', 'x', 'y', 'scaleX', 'scaleY', 'rotate'] as const;

export type MotionChannel = (typeof MOTION_CHANNELS)[number];

/**
 * Flattens a state (or a stack of them) onto rest.
 *
 * `scale` is expanded here rather than carried through, so everything
 * downstream deals in two independent axes and a shared-element morph
 * — which genuinely needs different numbers per axis — is not a
 * special case.
 */
export function resolveMotionState(input: MotionStateInput | null | undefined): ResolvedMotionState {
  if (input === null || input === undefined) {
    return MOTION_REST;
  }
  const states = Array.isArray(input) ? (input as readonly MotionState[]) : [input as MotionState];
  let opacity = MOTION_REST.opacity;
  let x = MOTION_REST.x;
  let y = MOTION_REST.y;
  let scaleX = MOTION_REST.scaleX;
  let scaleY = MOTION_REST.scaleY;
  let rotate = MOTION_REST.rotate;
  for (const state of states) {
    if (state === null || state === undefined) {
      continue;
    }
    opacity = state.opacity ?? opacity;
    x = state.x ?? x;
    y = state.y ?? y;
    // Per-axis wins over the shorthand, whichever order they appear in
    // the same object, because they are read in that order here.
    const uniform = state.scale;
    if (uniform !== undefined) {
      scaleX = uniform;
      scaleY = uniform;
    }
    scaleX = state.scaleX ?? scaleX;
    scaleY = state.scaleY ?? scaleY;
    rotate = state.rotate ?? rotate;
  }
  return { opacity, x, y, scaleX, scaleY, rotate };
}

/** Whether a resolved state is rest, to a pixel nobody can see. */
export function isMotionRest(state: ResolvedMotionState): boolean {
  return (
    Math.abs(state.opacity - 1) < 1e-4 &&
    Math.abs(state.x) < 0.01 &&
    Math.abs(state.y) < 0.01 &&
    Math.abs(state.scaleX - 1) < 1e-4 &&
    Math.abs(state.scaleY - 1) < 1e-4 &&
    Math.abs(state.rotate) < 1e-5
  );
}

// ---------------------------------------------------------------------------
// How a state is reached
// ---------------------------------------------------------------------------

/**
 * How long a motion takes and what shape it has.
 *
 * A tween or a spring, never both: naming a `spring` and a `duration`
 * together is a contradiction, since a spring's whole point is that it
 * has no duration. The spring wins if both are given, and that is the
 * only reason this is not two types.
 */
export interface MotionTiming {
  /** Milliseconds, or a name from the motion vocabulary. Defaults to `normal`. */
  readonly duration?: number | UiDurationToken;
  /** A curve, or a name from the vocabulary. Defaults to `standard`. */
  readonly easing?: UiEasing | UiEasingToken;
  /** Use a spring instead of a tween. Named, or given outright. */
  readonly spring?: UiSpringToken | UiSpringSpec;
  /** Wait this long before starting; see `UiAnimationOptions.delay`. */
  readonly delay?: number;
  /** What a reduced-motion preference does to it. Defaults to `snap`. */
  readonly reducedMotion?: UiReducedMotionPolicy;
}

// ---------------------------------------------------------------------------
// The presets
// ---------------------------------------------------------------------------

/**
 * Invisible. The state almost every enter and exit contains, and on
 * its own the most common animation there is.
 */
export const fade: MotionState = { opacity: 0 };

/** Comes up from `distance` pixels below. */
export function slideUp(distance = 16): MotionState {
  return { y: distance };
}

/** Comes down from `distance` pixels above. */
export function slideDown(distance = 16): MotionState {
  return { y: -distance };
}

/**
 * Comes in from one edge.
 *
 * The edge names where it starts, which is the way a person describes
 * it — "it slides in from the left" — rather than which way it moves.
 */
export function slideFrom(edge: 'left' | 'right' | 'top' | 'bottom', distance = 24): MotionState {
  switch (edge) {
    case 'left':
      return { x: -distance };
    case 'right':
      return { x: distance };
    case 'top':
      return { y: -distance };
    case 'bottom':
      return { y: distance };
  }
}

/** Grows (or shrinks) into place from `scale`. */
export function scaleFrom(scale = 0.92): MotionState {
  return { scale };
}

/** Turned by `radians`. */
export function rotateFrom(radians: number): MotionState {
  return { rotate: radians };
}

/**
 * Small and invisible: what a dialog, a menu or a toast appears from.
 *
 * A named preset rather than `[fade, scaleFrom(0.9)]` written out
 * everywhere, for the reason the durations are named: a library whose
 * overlays each pick their own 0.9 or 0.94 has no feel.
 */
export function pop(scale = 0.9): MotionState {
  return { scale, opacity: 0 };
}
