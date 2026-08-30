import type { UiBoxShadow } from '../properties/UiBoxShadow';
import { boxShadowArraysEqual } from '../properties/UiBoxShadow';

/**
 * A renderer-independent shadow scale.
 *
 * Each value is an array of shadows so layered shadows can be
 * expressed. Renderers translate these into native shadow drawing
 * operations.
 */
export interface UiShadows {
  readonly none: readonly UiBoxShadow[];
  readonly extraSmall: readonly UiBoxShadow[];
  readonly small: readonly UiBoxShadow[];
  readonly medium: readonly UiBoxShadow[];
  readonly large: readonly UiBoxShadow[];
  readonly extraLarge: readonly UiBoxShadow[];
}

export const defaultShadows: UiShadows = {
  none: [],
  extraSmall: [],
  small: [],
  medium: [],
  large: [],
  extraLarge: []
} as const;

/**
 * Compares two shadow scales for equality.
 */
export function shadowsEqual(a: UiShadows, b: UiShadows): boolean {
  return (
    boxShadowArraysEqual(a.none, b.none) &&
    boxShadowArraysEqual(a.extraSmall, b.extraSmall) &&
    boxShadowArraysEqual(a.small, b.small) &&
    boxShadowArraysEqual(a.medium, b.medium) &&
    boxShadowArraysEqual(a.large, b.large) &&
    boxShadowArraysEqual(a.extraLarge, b.extraLarge)
  );
}
