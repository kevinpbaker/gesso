/**
 * Renderer-independent 2D transform.
 *
 * The transform is applied around the node's origin. A separate
 * transform-origin property is not modeled here; the origin is
 * resolved by consumers (e.g. layout/paint) from the node's box.
 */
export interface UiTransform {
  /** Additional translation along the x-axis, in logical pixels. */
  readonly x: number;
  /** Additional translation along the y-axis, in logical pixels. */
  readonly y: number;
  /** Scale along the x-axis. */
  readonly scaleX: number;
  /** Scale along the y-axis. */
  readonly scaleY: number;
  /** Rotation in radians. */
  readonly rotation: number;
}

export const UiTransforms = {
  identity: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
} as const;

/**
 * Creates a transform from partial values, filling in identity
 * defaults for any omitted field.
 */
export function transform(partial: Partial<UiTransform> = {}): UiTransform {
  return {
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    scaleX: partial.scaleX ?? 1,
    scaleY: partial.scaleY ?? 1,
    rotation: partial.rotation ?? 0
  };
}

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Parses a loose transform object into a canonical transform.
 */
export function parseTransform(value: unknown): UiTransform | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const candidate = value as Partial<UiTransform>;
  if (
    (candidate.x !== undefined && !isValidNumber(candidate.x)) ||
    (candidate.y !== undefined && !isValidNumber(candidate.y)) ||
    (candidate.scaleX !== undefined && !isValidNumber(candidate.scaleX)) ||
    (candidate.scaleY !== undefined && !isValidNumber(candidate.scaleY)) ||
    (candidate.rotation !== undefined && !isValidNumber(candidate.rotation))
  ) {
    return undefined;
  }
  const parsed = transform(candidate);
  if (transformIsIdentity(parsed)) {
    return undefined;
  }
  return parsed;
}

/**
 * Compares two transforms for equality.
 */
export function transformsEqual(a: UiTransform, b: UiTransform): boolean {
  const epsilon = 0.0001;
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.scaleX - b.scaleX) < epsilon &&
    Math.abs(a.scaleY - b.scaleY) < epsilon &&
    Math.abs(a.rotation - b.rotation) < epsilon
  );
}

/**
 * Returns true when the transform is the identity transform.
 */
export function transformIsIdentity(transform: UiTransform): boolean {
  return transformsEqual(transform, UiTransforms.identity);
}
