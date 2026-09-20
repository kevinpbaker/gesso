import { defaultMotion, type UiSpringSpec, type UiSpringToken } from '../environment/UiMotion';
import type { UiEasing } from './UiEasing';
import type { UiReducedMotionPolicy } from './UiAnimation';

/**
 * How one property gets from its old value to its new one, when the
 * element declares a `transition`.
 */
export type UiTransitionSpec =
  | {
      readonly kind: 'tween';
      readonly duration: number;
      readonly easing?: UiEasing;
      readonly stepMs?: number;
      readonly reducedMotion?: UiReducedMotionPolicy;
    }
  | {
      readonly kind: 'spring';
      readonly spring: UiSpringSpec;
      readonly restDelta?: number;
      readonly reducedMotion?: UiReducedMotionPolicy;
    };

/**
 * What an element may write for one property of a `transition`.
 *
 * A bare number is a duration in milliseconds, which is what makes
 * `transition: { opacity: 200, transform: spring() }` read the way
 * That is how it was written.
 */
export type UiTransitionValue = number | UiTransitionSpec;

/** A tween of `duration` milliseconds along `easing`. */
export function tween(
  duration: number,
  options: { easing?: UiEasing; stepMs?: number; reducedMotion?: UiReducedMotionPolicy } = {}
): UiTransitionSpec {
  return { kind: 'tween', duration, ...options };
}

/**
 * A spring, named from the motion vocabulary or given outright.
 *
 * Springs apply to numbers only; see `UiSpring` for why springing a
 * colour or a whole transform is not a thing this offers.
 */
export function spring(
  spec: UiSpringToken | UiSpringSpec = 'snappy',
  options: { restDelta?: number; reducedMotion?: UiReducedMotionPolicy } = {}
): UiTransitionSpec {
  return {
    kind: 'spring',
    spring: typeof spec === 'string' ? defaultMotion.springs[spec] : spec,
    ...options
  };
}

export function normalizeTransition(value: UiTransitionValue): UiTransitionSpec {
  return typeof value === 'number' ? { kind: 'tween', duration: value } : value;
}

/**
 * Rejects a `transition` prop that is not a map of property names to
 * durations or specs, naming the node the way an unknown prop does.
 */
export function assertTransitionMap(
  nodeId: string,
  value: unknown,
  isKnownProperty: (name: string) => boolean
): ReadonlyMap<string, UiTransitionSpec> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The 'transition' prop on node '${nodeId}' must be an object, got ${describe(value)}.`);
  }
  const specs = new Map<string, UiTransitionSpec>();
  for (const [property, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isKnownProperty(property)) {
      throw new Error(
        `The 'transition' prop on node '${nodeId}' names '${property}', which is not a UI property. ` +
          `A transition names the properties it animates, so an unknown one is a typo the same way an unknown prop is.`
      );
    }
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry) || entry < 0) {
        throw new Error(
          `The 'transition' for '${property}' on node '${nodeId}' must be a duration in ms, got ${entry}.`
        );
      }
      specs.set(property, { kind: 'tween', duration: entry });
      continue;
    }
    if (
      typeof entry === 'object' &&
      entry !== null &&
      ((entry as UiTransitionSpec).kind === 'tween' || (entry as UiTransitionSpec).kind === 'spring')
    ) {
      specs.set(property, entry as UiTransitionSpec);
      continue;
    }
    throw new Error(
      `The 'transition' for '${property}' on node '${nodeId}' must be a duration in milliseconds or a spec ` +
        `built by tween() or spring(), got ${describe(entry)}.`
    );
  }
  return specs;
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
}
