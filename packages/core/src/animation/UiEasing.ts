/**
 * How a tween's progress maps onto its value.
 *
 * Takes normalised time in [0, 1] and answers normalised progress.
 * An easing may leave the range — an overshooting curve is a valid
 * easing — so nothing downstream clamps what it returns.
 */
export type UiEasing = (t: number) => number;

/** Progress equals time. What a spinner and a sweep want. */
export const linear: UiEasing = t => t;

/**
 * A cubic Bézier easing, in the CSS `cubic-bezier(x1, y1, x2, y2)`
 * sense: the curve runs from (0, 0) to (1, 1) through the two control
 * points, and the easing is y at the t where x equals the input.
 *
 * Solved by Newton's method with a bisection fallback, which is what
 * every browser engine does; eight iterations is well past the point
 * where the result stops moving in a float.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): UiEasing {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  return (input: number): number => {
    if (input <= 0) {
      return 0;
    }
    if (input >= 1) {
      return 1;
    }
    let t = input;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - input;
      if (Math.abs(error) < 1e-6) {
        return sampleY(t);
      }
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      t -= error / slope;
    }
    // Newton stalled on a flat segment; bisect instead, which cannot.
    let low = 0;
    let high = 1;
    t = input;
    for (let i = 0; i < 24; i++) {
      const x = sampleX(t);
      if (Math.abs(x - input) < 1e-6) {
        break;
      }
      if (x > input) {
        high = t;
      } else {
        low = t;
      }
      t = (low + high) / 2;
    }
    return sampleY(t);
  };
}

/**
 * An easing that only takes `count` distinct values.
 *
 * The reason it exists is the `Spinner`: eight blades have eight
 * positions promised the F4 version would keep a
 * turn at eight writes a second rather than sixty. Paired with an
 * animation's `stepMs`, this is how that promise is kept — the value
 * is stepped and the frames are too.
 */
export function steps(count: number): UiEasing {
  if (!(count >= 1)) {
    throw new Error(`steps() needs at least one step, got ${count}.`);
  }
  return t => Math.min(count - 1, Math.floor(t * count)) / count;
}

/**
 * The named curves a motion vocabulary is built from.
 *
 * `standard` is the one to reach for: something entering and leaving
 * at a natural pace. `decelerate` is for something arriving (it starts
 * fast and settles), `accelerate` for something leaving. `emphasized`
 * is `standard` with more of a lean, for the one movement on a screen
 * that should be noticed.
 */
export const easings = {
  linear,
  standard: cubicBezier(0.2, 0, 0, 1),
  decelerate: cubicBezier(0, 0, 0, 1),
  accelerate: cubicBezier(0.3, 0, 1, 1),
  emphasized: cubicBezier(0.05, 0.7, 0.1, 1)
} as const;
