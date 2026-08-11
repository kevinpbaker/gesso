import type { UiColor } from './UiColor';

/**
 * Renderer-independent box shadow description.
 *
 * A shadow is defined by its offset, blur, spread, color, and
 * whether it is inset. The renderer is responsible for translating
 * these semantics into drawing operations.
 */
export interface UiBoxShadow {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blurRadius: number;
  readonly spreadRadius: number;
  readonly color: UiColor;
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
  color: UiColor,
  inset = false
): UiBoxShadow {
  return { offsetX, offsetY, blurRadius, spreadRadius, color, inset };
}

/**
 * Compares two box shadows for equality.
 */
export function boxShadowsEqual(a: UiBoxShadow, b: UiBoxShadow): boolean {
  const epsilon = 0.0001;
  return (
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY &&
    a.blurRadius === b.blurRadius &&
    a.spreadRadius === b.spreadRadius &&
    a.inset === b.inset &&
    Math.abs(a.color.r - b.color.r) < epsilon &&
    Math.abs(a.color.g - b.color.g) < epsilon &&
    Math.abs(a.color.b - b.color.b) < epsilon &&
    Math.abs(a.color.a - b.color.a) < epsilon
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
