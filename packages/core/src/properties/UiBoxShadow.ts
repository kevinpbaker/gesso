import { colorValuesEqual } from './UiColor';
import type { UiColorValue } from './UiPropertyValues';

/**
 * Renderer-independent box shadow description, with CSS `box-shadow`
 * semantics.
 *
 * An outer shadow is the node's (rounded) box, grown by `spreadRadius`
 * on every side, moved by the offset, blurred by `blurRadius` (a
 * Gaussian whose standard deviation is half of it), and seen only
 * outside the box. An inset one is the same shape inverted and seen
 * only inside the box. `color` may be a palette name, resolved against
 * the node's theme as `backgroundColor` is.
 */
export interface UiBoxShadow {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blurRadius: number;
  readonly spreadRadius: number;
  readonly color: UiColorValue;
  readonly inset?: boolean;
}

/**
 * Creates a box shadow with the supplied parameters.
 */
export function boxShadow(
  offsetX: number,
  offsetY: number,
  blurRadius: number,
  spreadRadius: number,
  color: UiColorValue,
  inset = false
): UiBoxShadow {
  return { offsetX, offsetY, blurRadius, spreadRadius, color, inset };
}

/**
 * Compares two box shadows for equality.
 */
export function boxShadowsEqual(a: UiBoxShadow, b: UiBoxShadow): boolean {
  return (
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY &&
    a.blurRadius === b.blurRadius &&
    a.spreadRadius === b.spreadRadius &&
    (a.inset ?? false) === (b.inset ?? false) &&
    colorValuesEqual(a.color, b.color)
  );
}

/**
 * Compares two shadow arrays for equality.
 */
export function boxShadowArraysEqual(a: readonly UiBoxShadow[], b: readonly UiBoxShadow[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!boxShadowsEqual(a[i]!, b[i]!)) {
      return false;
    }
  }
  return true;
}

/**
 * How far a shadow's blur reaches past the edge of its shape, as a
 * multiple of `blurRadius`.
 *
 * The blur is a Gaussian with a standard deviation of half the radius,
 * so this is three standard deviations: what is left beyond it is
 * under a quarter of a percent of the shadow's colour, and both
 * renderers stop drawing there.
 */
export const BOX_SHADOW_BLUR_REACH = 1.5;

/**
 * The corner radius of a shadow's shape, from the box's and the
 * spread: an outer shadow's corner grows with its spread, an inset
 * one's hole shrinks with it. A square corner stays square, as CSS
 * keeps it.
 */
export function boxShadowRadius(boxRadius: number, spreadRadius: number, inset: boolean): number {
  if (boxRadius <= 0) {
    return 0;
  }
  return Math.max(0, inset ? boxRadius - spreadRadius : boxRadius + spreadRadius);
}

/**
 * How far past each side of the box a node's outer shadows may paint,
 * written into `out`; all zero for a node with none. Inset shadows
 * paint inside the box and add nothing.
 */
export function boxShadowReach(
  shadows: readonly UiBoxShadow[],
  out: { left: number; top: number; right: number; bottom: number }
): void {
  out.left = 0;
  out.top = 0;
  out.right = 0;
  out.bottom = 0;
  for (const shadow of shadows) {
    if (shadow.inset === true) {
      continue;
    }
    const grow = shadow.spreadRadius + Math.max(0, shadow.blurRadius) * BOX_SHADOW_BLUR_REACH;
    out.left = Math.max(out.left, grow - shadow.offsetX);
    out.right = Math.max(out.right, grow + shadow.offsetX);
    out.top = Math.max(out.top, grow - shadow.offsetY);
    out.bottom = Math.max(out.bottom, grow + shadow.offsetY);
  }
}
