/**
 * Renderer-independent border radius description.
 *
 * Each corner is measured in logical pixels. A single scalar radius
 * can be expressed by setting all four corners to the same value.
 */
export interface UiBorderRadius {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomRight: number;
  readonly bottomLeft: number;
}

export const UiBorderRadiuses = {
  none: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }
} as const;

/**
 * Creates a uniform border radius.
 */
export function borderRadius(radius: number): UiBorderRadius {
  return {
    topLeft: radius,
    topRight: radius,
    bottomRight: radius,
    bottomLeft: radius
  };
}

/**
 * Creates a border radius with per-corner values.
 */
export function borderRadiusCorners(
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number
): UiBorderRadius {
  return { topLeft, topRight, bottomRight, bottomLeft };
}

/**
 * Compares two border radii for equality.
 */
export function borderRadiusEqual(a: UiBorderRadius, b: UiBorderRadius): boolean {
  return (
    a.topLeft === b.topLeft &&
    a.topRight === b.topRight &&
    a.bottomRight === b.bottomRight &&
    a.bottomLeft === b.bottomLeft
  );
}

/**
 * Returns true when every corner radius is zero.
 */
export function borderRadiusIsZero(radius: UiBorderRadius): boolean {
  return radius.topLeft === 0 && radius.topRight === 0 && radius.bottomRight === 0 && radius.bottomLeft === 0;
}

/**
 * The largest of the four corners. Both renderers draw every corner at
 * its own radius; this is for the questions that only need a bound,
 * such as how far a rounded edge can pull in from the box.
 */
export function uniformBorderRadius(radius: UiBorderRadius): number {
  return Math.max(radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft);
}

/** Whether all four corners are the same, so a single radius describes them. */
export function borderRadiusIsUniform(radius: UiBorderRadius): boolean {
  return (
    radius.topLeft === radius.topRight && radius.topLeft === radius.bottomRight && radius.topLeft === radius.bottomLeft
  );
}

/**
 * The corners as CSS draws them in a `width` x `height` box: when two
 * corners on one side want more than the side has, every corner is
 * scaled by the same factor until they fit (CSS Backgrounds 3, "Corner
 * Overlap"). Scaling only the offending pair would change the shape's
 * proportions, which is why the rule scales all four.
 */
export function fitBorderRadius(radius: UiBorderRadius, width: number, height: number): UiBorderRadius {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const tl = Math.max(0, radius.topLeft);
  const tr = Math.max(0, radius.topRight);
  const br = Math.max(0, radius.bottomRight);
  const bl = Math.max(0, radius.bottomLeft);
  let factor = 1;
  factor = Math.min(factor, ratio(w, tl + tr), ratio(w, bl + br), ratio(h, tl + bl), ratio(h, tr + br));
  if (
    factor >= 1 &&
    tl === radius.topLeft &&
    tr === radius.topRight &&
    br === radius.bottomRight &&
    bl === radius.bottomLeft
  ) {
    return radius;
  }
  return { topLeft: tl * factor, topRight: tr * factor, bottomRight: br * factor, bottomLeft: bl * factor };
}

function ratio(side: number, wanted: number): number {
  return wanted > 0 ? side / wanted : 1;
}

/**
 * Every corner moved out by `by` (in, when negative), as a shape grown
 * or shrunk from the box follows it: an outset ring, a spread shadow,
 * the inside edge of a border. A square corner stays square, as CSS
 * keeps it, and none goes below zero.
 */
export function offsetBorderRadius(radius: UiBorderRadius, by: number): UiBorderRadius {
  if (by === 0) {
    return radius;
  }
  const move = (corner: number): number => (corner <= 0 ? 0 : Math.max(0, corner + by));
  return {
    topLeft: move(radius.topLeft),
    topRight: move(radius.topRight),
    bottomRight: move(radius.bottomRight),
    bottomLeft: move(radius.bottomLeft)
  };
}

/**
 * Normalizes a border radius value to a UiBorderRadius.
 *
 * Numbers are expanded to a uniform radius; UiBorderRadius objects
 * pass through unchanged.
 */
function clampRadius(value: number): number {
  return Math.max(0, value);
}

export function normalizeBorderRadius(value: unknown): UiBorderRadius {
  if (typeof value === 'number') {
    return borderRadius(clampRadius(value));
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as Partial<UiBorderRadius>;
    return {
      topLeft: clampRadius(candidate.topLeft ?? 0),
      topRight: clampRadius(candidate.topRight ?? 0),
      bottomRight: clampRadius(candidate.bottomRight ?? 0),
      bottomLeft: clampRadius(candidate.bottomLeft ?? 0)
    };
  }
  return UiBorderRadiuses.none;
}

/**
 * Equality for border radius property values, used by the registry to
 * decide whether a change repaints.
 *
 * Two literal radii compare corner by corner; a scale name compares by
 * name, because what it draws depends on a theme this comparison
 * cannot see. That is the same rule and the same reason as
 * `colorValuesEqual`, and without it every name would normalize to
 * `none` and `'small'` changing to `'large'` would look like no change
 * at all.
 */
export function borderRadiusValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  // One name and one literal are never the same value, and two
  // different names are two different lookups. Either way the answer
  // is no, and normalizing first would wrongly say yes.
  if (typeof a === 'string' || typeof b === 'string') {
    return false;
  }
  return borderRadiusEqual(normalizeBorderRadius(a), normalizeBorderRadius(b));
}
