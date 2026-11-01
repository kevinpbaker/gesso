import { easings, type UiEasing } from '../animation/UiEasing';

/**
 * The named durations a component may ask for, in milliseconds.
 *
 * Named rather than numeric for the reason a colour is named: a
 * library whose components each pick their own 180 or 240 has no feel,
 * it has forty opinions. the rule for colour —
 * tokens only, never a literal in a component — applies to time.
 */
export type UiDurationToken = 'instant' | 'fast' | 'normal' | 'slow' | 'deliberate' | (keyof UiDurationExtensions & string);

/** The named curves; see `UiEasing.ts` for what each one is for. */
export type UiEasingToken = keyof typeof easings | (keyof UiEasingExtensions & string);

/** The named springs, for a movement that follows a gesture. */
export type UiSpringToken = 'gentle' | 'snappy' | 'stiff' | (keyof UiSpringExtensions & string);

/**
 * Names an application adds to the vocabulary, as typography roles are
 * added (`UiTypographyExtensions`): a design's own `press` beside
 * `fast`, given its value in the motion it provides (`defineMotion`).
 *
 *   declare module 'gesso-core' {
 *     interface UiDurationExtensions {
 *       readonly press: unknown;
 *     }
 *   }
 *
 * Only the key is used. Declaring one makes `transition={{ opacity:
 * 'press' }}` legal and a misspelling a compile error.
 */
export interface UiDurationExtensions {}

/** Curves an application names; see `UiDurationExtensions`. */
export interface UiEasingExtensions {}

/** Springs an application names; see `UiDurationExtensions`. */
export interface UiSpringExtensions {}

/**
 * A spring, in the physical sense: `stiffness` pulls towards the
 * target, `damping` resists velocity, `mass` resists both.
 *
 * Critical damping is `2 · sqrt(stiffness · mass)`; every preset below
 * sits a little under it, so a spring settles with one small overshoot
 * rather than creeping in. A spring has no duration, which is the
 * whole point of using one for a gesture: it starts from whatever
 * velocity the finger left behind.
 */
export interface UiSpringSpec {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/**
 * A vocabulary of motion, beside the palette and the type scale.
 *
 * It is deliberately **not** a field on `UiTheme`: a theme value is
 * resolved per node at paint, and a name in an animation is resolved
 * once, when the animation starts. An application that wants a
 * different feel installs one with `AnimationService.setMotion`, for
 * the whole runtime, and a part of the tree may provide another over it
 * (`UiEnvironmentKeys.motion`): a name in a `transition` or a `motion`
 * state resolves against the motion where it is drawn (`motionOf`).
 */
export interface UiMotion {
  readonly durations: Readonly<Record<UiDurationToken, number>>;
  readonly easings: Readonly<Record<UiEasingToken, UiEasing>>;
  readonly springs: Readonly<Record<UiSpringToken, UiSpringSpec>>;
}

/** What a design changes in the vocabulary: any name, its own included. */
export interface UiMotionChanges {
  readonly durations?: Readonly<Partial<Record<UiDurationToken, number>>>;
  readonly easings?: Readonly<Partial<Record<UiEasingToken, UiEasing>>>;
  readonly springs?: Readonly<Partial<Record<UiSpringToken, UiSpringSpec>>>;
}

export const defaultMotion: UiMotion = {
  durations: {
    /** No motion. What `reducedMotion` turns everything else into. */
    instant: 0,
    /** A control acknowledging a press; too short to watch. */
    fast: 120,
    /** The default: something appearing, moving or changing colour. */
    normal: 200,
    /** A panel or a dialog, which is bigger and travels further. */
    slow: 320,
    /** A movement meant to be followed by the eye. Rare. */
    deliberate: 500
  },
  easings,
  springs: {
    gentle: { stiffness: 120, damping: 20, mass: 1 },
    snappy: { stiffness: 220, damping: 24, mass: 1 },
    stiff: { stiffness: 400, damping: 32, mass: 1 }
  }
} as const;

/**
 * A vocabulary with a design's own values, Gesso's for the rest:
 *
 *   export const motion = defineMotion({ durations: { fast: 100, press: 90 } });
 *
 * Provided to a part of the tree (`UiEnvironmentKeys.motion`) or to the
 * whole runtime (`AnimationService.setMotion`), it is what a name in a
 * `transition`, a `motion` state or `AnimationService` resolves to.
 */
export function defineMotion(changes: UiMotionChanges): UiMotion {
  return {
    durations: { ...defaultMotion.durations, ...changes.durations } as UiMotion['durations'],
    easings: { ...defaultMotion.easings, ...changes.easings } as UiMotion['easings'],
    springs: { ...defaultMotion.springs, ...changes.springs } as UiMotion['springs']
  };
}

const warnedNames = new Set<string>();

/** Says once that a name is not in the vocabulary, and what is used instead. */
function missing(kind: string, name: string, instead: string): void {
  const said = `${kind}:${name}`;
  if (!warnedNames.has(said)) {
    warnedNames.add(said);
    console.warn(`The motion vocabulary has no ${kind} named '${name}': ${instead} is used. Give it a value with defineMotion.`);
  }
}

/** A duration by name or in milliseconds, as `motion` has it; `normal` for a name it lacks. */
export function durationIn(motion: UiMotion, duration: number | UiDurationToken | undefined): number {
  if (duration === undefined) {
    return motion.durations.normal;
  }
  if (typeof duration === 'number') {
    return duration;
  }
  const found = motion.durations[duration] as number | undefined;
  if (found === undefined) {
    missing('duration', duration, 'normal');
    return motion.durations.normal;
  }
  return found;
}

/** A curve by name, or given outright; `standard` for none or a name it lacks. */
export function easingIn(motion: UiMotion, easing: UiEasing | UiEasingToken | undefined): UiEasing {
  if (easing === undefined) {
    return motion.easings.standard;
  }
  if (typeof easing === 'function') {
    return easing;
  }
  const found = motion.easings[easing] as UiEasing | undefined;
  if (found === undefined) {
    missing('easing', easing, 'standard');
    return motion.easings.standard;
  }
  return found;
}

/** A spring by name, or given outright; `snappy` for none or a name it lacks. */
export function springIn(motion: UiMotion, spring: UiSpringSpec | UiSpringToken | undefined): UiSpringSpec {
  if (spring === undefined) {
    return motion.springs.snappy;
  }
  if (typeof spring !== 'string') {
    return spring;
  }
  const found = motion.springs[spring] as UiSpringSpec | undefined;
  if (found === undefined) {
    missing('spring', spring, 'snappy');
    return motion.springs.snappy;
  }
  return found;
}
