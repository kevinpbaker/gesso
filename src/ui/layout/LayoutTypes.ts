import type { UiNode } from '../graph/UiNode';

export interface Size {
  width: number;
  height: number;
}

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Options applied to a Constraints instance.
 *
 * An explicit width/height makes that axis tight
 * (min === max), mirroring CSS replaced sizing.
 */
export interface TightenOptions {
  width?: number;
  height?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

/**
 * Immutable bounds handed down the layout tree.
 *
 * Unbounded axes use Infinity for max.
 */
export class Constraints {
  constructor(
    readonly minWidth: number = 0,
    readonly maxWidth: number = Infinity,
    readonly minHeight: number = 0,
    readonly maxHeight: number = Infinity
  ) {}

  static unbounded(): Constraints {
    return new Constraints();
  }

  static tight(width: number, height: number): Constraints {
    return new Constraints(width, width, height, height);
  }

  static loose(width: number, height: number): Constraints {
    return new Constraints(0, width, 0, height);
  }

  hasBoundedWidth(): boolean {
    return isFinite(this.maxWidth);
  }

  hasBoundedHeight(): boolean {
    return isFinite(this.maxHeight);
  }
}

/**
 * The result of a full layout pass for the layout root.
 *
 * Descendant geometry is read from LayoutRecords.
 */
export interface LayoutResult {
  root: UiNode;
  box: LayoutBox;
  contentWidth: number;
  contentHeight: number;
  scrollX: number;
  scrollY: number;
  clip: LayoutBox;
}

export function clampSize(constraints: Constraints, width: number, height: number): Size {
  return {
    width: Math.min(Math.max(width, constraints.minWidth), constraints.maxWidth),
    height: Math.min(Math.max(height, constraints.minHeight), constraints.maxHeight)
  };
}

export function constraintsEqual(a: Constraints, b: Constraints): boolean {
  return (
    a.minWidth === b.minWidth && a.maxWidth === b.maxWidth && a.minHeight === b.minHeight && a.maxHeight === b.maxHeight
  );
}

/**
 * Returns new constraints with the options applied on top of
 * the supplied constraints. Explicit sizes make an axis tight,
 * min/max values tighten the existing bounds.
 */
export function tightenConstraints(constraints: Constraints, options: TightenOptions): Constraints {
  let minWidth = Math.max(constraints.minWidth, options.minWidth ?? 0);
  let maxWidth = Math.min(constraints.maxWidth, options.maxWidth ?? Infinity);
  let minHeight = Math.max(constraints.minHeight, options.minHeight ?? 0);
  let maxHeight = Math.min(constraints.maxHeight, options.maxHeight ?? Infinity);
  minWidth = Math.max(0, minWidth);
  minHeight = Math.max(0, minHeight);
  // Like CSS, a min bound wins over a conflicting max bound.
  if (minWidth > maxWidth) {
    maxWidth = minWidth;
  }
  if (minHeight > maxHeight) {
    maxHeight = minHeight;
  }
  // An explicit size tightens the axis, clamped into the
  // resolved min/max bounds.
  if (options.width !== undefined) {
    const width = Math.min(Math.max(options.width, minWidth), maxWidth);
    minWidth = width;
    maxWidth = width;
  }
  if (options.height !== undefined) {
    const height = Math.min(Math.max(options.height, minHeight), maxHeight);
    minHeight = height;
    maxHeight = height;
  }
  return new Constraints(minWidth, maxWidth, minHeight, maxHeight);
}
