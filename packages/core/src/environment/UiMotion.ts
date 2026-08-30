import { easings, type UiEasing } from '../animation/UiEasing';

/**
 * The named durations a component may ask for, in milliseconds.
 *
 * Named rather than numeric for the reason a colour is named: a
 * library whose components each pick their own 180 or 240 has no feel,
 * it has forty opinions. `COMPONENTS_ROADMAP.md`'s rule for colour —
 * tokens only, never a literal in a component — applies to time.
 */
export type UiDurationToken = 'instant' | 'fast' | 'normal' | 'slow' | 'deliberate';

/** The named curves; see `UiEasing.ts` for what each one is for. */
export type UiEasingToken = keyof typeof easings;

/** The named springs, for a movement that follows a gesture. */
export type UiSpringToken = 'gentle' | 'snappy' | 'stiff';

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
 * It is deliberately **not** a field on `UiTheme`. A theme value is
 * resolved per node — `resolveColorValue` asks what the node inherits
 * — and an animation drives a *cell*, which has no node, so a motion
 * token on the theme would be a token nothing could resolve. That is
 * the mistake `decisions/0022` recorded about `visualState`: a value
 * shipped where nothing reads it. An application that wants a
 * different feel installs one with `AnimationService.setMotion`, which
 * is per runtime, as everything else in front of the graph is.
 */
export interface UiMotion {
  readonly durations: Readonly<Record<UiDurationToken, number>>;
  readonly easings: Readonly<Record<UiEasingToken, UiEasing>>;
  readonly springs: Readonly<Record<UiSpringToken, UiSpringSpec>>;
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
