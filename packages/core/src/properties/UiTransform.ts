/**
 * Renderer-independent 2D transform.
 *
 * The transform is applied around a pivot, and `x` / `y` are where
 * that pivot sits inside the node — not a translation. Both renderers
 * compose `T(translate) · T(pivot) · R · S · T(-pivot)`
 * (`Canvas2DRenderer.applyTransform`, `buildOwnTransform` in
 * `WebGPURenderData`), so `{ x: 50, y: 50 }` alone moves nothing,
 * which is what `UiHitTester.spec`'s "unaffected by an identity
 * transform" asserts. A node that wants to rotate about its middle
 * passes half its width and height.
 *
 * Those two fields were documented as "additional translation" until
 * the Media tier's `Spinner` was written against that description and
 * swung around its own top-left corner in the browser. Moving a node
 * is `translateX` / `translateY`, which is a different pair and is
 * outside the pivot, exactly as CSS's `translate` is outside
 * `transform-origin`.
 */
export interface UiTransform {
  /** The pivot's offset from the node's left edge, in logical pixels. */
  readonly x: number;
  /** The pivot's offset from the node's top edge, in logical pixels. */
  readonly y: number;
  /**
   * Moves the node right by this many logical pixels, after the pivot,
   * rotation and scale have been applied.
   *
   * The field a motion system moves things with. It is paint-only —
   * the layout record does not change, so a node sliding across the
   * screen marks Paint and never Layout — which is the whole reason it
   * exists: `decisions/0029` accepted a relative `left`/`top` offset
   * for `animateLayout` precisely because this was missing, and paid
   * for it with a relayout per tick.
   */
  readonly translateX: number;
  /** The same, downwards. */
  readonly translateY: number;
  /** Scale along the x-axis. */
  readonly scaleX: number;
  /** Scale along the y-axis. */
  readonly scaleY: number;
  /** Rotation in radians. */
  readonly rotation: number;
}

export const UiTransforms = {
  identity: { x: 0, y: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0 }
} as const;

/**
 * Creates a transform from partial values, filling in identity
 * defaults for any omitted field.
 */
export function transform(partial: Partial<UiTransform> = {}): UiTransform {
  return {
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    translateX: partial.translateX ?? 0,
    translateY: partial.translateY ?? 0,
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
    (candidate.translateX !== undefined && !isValidNumber(candidate.translateX)) ||
    (candidate.translateY !== undefined && !isValidNumber(candidate.translateY)) ||
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
    Math.abs(a.translateX - b.translateX) < epsilon &&
    Math.abs(a.translateY - b.translateY) < epsilon &&
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
