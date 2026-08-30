import type { UiColor } from '../properties/UiColor';
import type { UiTransform } from '../properties/UiTransform';

/**
 * Blends two values of one property.
 *
 * `t` is progress, normally in [0, 1] but not necessarily: a spring
 * and an overshooting easing both leave the range, and an interpolator
 * that clamped would flatten exactly the part of the motion that is
 * worth having.
 */
export type UiInterpolator<T> = (from: T, to: T, t: number) => T;

export const interpolateNumber: UiInterpolator<number> = (from, to, t) => from + (to - from) * t;

/**
 * Blends two colours channel by channel, in the [0, 1] float space
 * `UiColor` already uses.
 *
 * Linear RGB rather than a perceptual space: both renderers hand
 * these channels straight to the GPU or to a `fillStyle`, so blending
 * anywhere else would mean converting twice a frame to be slightly
 * more correct about a midpoint nobody looks at for 200 ms.
 */
export const interpolateColor: UiInterpolator<UiColor> = (from, to, t) => ({
  r: from.r + (to.r - from.r) * t,
  g: from.g + (to.g - from.g) * t,
  b: from.b + (to.b - from.b) * t,
  a: from.a + (to.a - from.a) * t
});

/**
 * Blends two transforms field by field, filling identity for whatever
 * either side omits.
 *
 * `x` and `y` are the pivot, not a translation (see `UiTransform`), so
 * blending them moves where the rotation happens rather than moving
 * the node. `translateX` and `translateY` are the pair that moves it.
 */
export const interpolateTransform: UiInterpolator<Partial<UiTransform>> = (from, to, t) => ({
  x: interpolateNumber(from.x ?? 0, to.x ?? 0, t),
  y: interpolateNumber(from.y ?? 0, to.y ?? 0, t),
  translateX: interpolateNumber(from.translateX ?? 0, to.translateX ?? 0, t),
  translateY: interpolateNumber(from.translateY ?? 0, to.translateY ?? 0, t),
  scaleX: interpolateNumber(from.scaleX ?? 1, to.scaleX ?? 1, t),
  scaleY: interpolateNumber(from.scaleY ?? 1, to.scaleY ?? 1, t),
  rotation: interpolateNumber(from.rotation ?? 0, to.rotation ?? 0, t)
});

function isColor(value: object): boolean {
  const candidate = value as Partial<UiColor>;
  return (
    typeof candidate.r === 'number' &&
    typeof candidate.g === 'number' &&
    typeof candidate.b === 'number' &&
    typeof candidate.a === 'number'
  );
}

const TRANSFORM_FIELDS = ['x', 'y', 'translateX', 'translateY', 'scaleX', 'scaleY', 'rotation'] as const;

function isTransform(value: object): boolean {
  const candidate = value as Record<string, unknown>;
  let seen = 0;
  for (const key of Object.keys(candidate)) {
    if (!(TRANSFORM_FIELDS as readonly string[]).includes(key)) {
      return false;
    }
    if (typeof candidate[key] !== 'number') {
      return false;
    }
    seen++;
  }
  return seen > 0;
}

/**
 * The interpolator for a pair of values, or undefined when the type
 * cannot be blended.
 *
 * Three types, and the reason the list is short is that the rest are
 * not numbers in disguise. A `UiLength` may be `percent(50)`, `fr(1)`
 * or `auto`, and blending `auto` into `fr(1)` means nothing until the
 * layout engine has resolved both — an animation that took a length
 * would be choosing a frame's resolved value and writing it back as a
 * fixed one, which is a different layout. A colour that names a
 * palette entry (`'controlAccent'`) is not blendable either: it
 * resolves against the node at paint, and this code has a cell rather
 * than a node. Both cases fall back to writing the value, which is
 * the honest outcome — no animation rather than a wrong one.
 */
export function interpolatorFor(from: unknown, to: unknown): UiInterpolator<unknown> | undefined {
  if (typeof from === 'number' && typeof to === 'number') {
    return interpolateNumber as unknown as UiInterpolator<unknown>;
  }
  if (typeof from !== 'object' || from === null || typeof to !== 'object' || to === null) {
    return undefined;
  }
  if (isColor(from) && isColor(to)) {
    return interpolateColor as unknown as UiInterpolator<unknown>;
  }
  if (isTransform(from) && isTransform(to)) {
    return interpolateTransform as unknown as UiInterpolator<unknown>;
  }
  return undefined;
}
