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
 * Returns a single scalar radius for renderers that do not yet
 * support per-corner radii. This is a temporary bridge; per-corner
 * support belongs in each renderer.
 */
export function uniformBorderRadius(radius: UiBorderRadius): number {
  return Math.max(radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft);
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
