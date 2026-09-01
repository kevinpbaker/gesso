import type { PercentLength } from '../layout/UiLength';
import { isPercentLength } from '../layout/UiLength';
import type { UiColor } from './UiColor';
import type { UiColorValue } from './UiPropertyValues';
import { colorValuesEqual } from './UiColor';

/**
 * Renderer-independent gradient descriptions.
 *
 * A gradient is a paint, not a colour: it is what a box's background
 * is filled with instead of one flat value, and both backends have to
 * arrive at the same pixels from it. So the description here is
 * geometry plus stops, with nothing renderer-shaped in it, and the two
 * renderers share the arithmetic in `gradientPaint` below rather than
 * each deriving a gradient line of its own.
 *
 * Lengths follow the rest of the framework: a plain number is logical
 * pixels and `percent(n)` is a fraction of whatever the value is a
 * fraction of, never a string to parse. For a stop that is the length
 * of the gradient itself, so `percent(50)` is halfway along it whatever
 * the box measures, and `24` is 24 pixels from its start.
 */

/** How far along a gradient a stop sits. */
export type UiGradientOffset = number | PercentLength;

export interface UiGradientStop {
  /**
   * Omitted on every stop of a gradient means "spread them evenly",
   * which is what almost every gradient wants. Omitted on only some of
   * them is an error rather than a guess: CSS's rule for filling the
   * gaps is subtle enough that a reader could not predict the result.
   */
  readonly offset?: UiGradientOffset;
  /**
   * A palette name resolves against the theme the node inherits, so a
   * themed gradient follows a theme change exactly as `backgroundColor`
   * does.
   */
  readonly color: UiColorValue;
}

export interface UiLinearGradient {
  readonly kind: 'linear';
  /**
   * Direction in radians, on CSS's compass: 0 points at the top of the
   * box and the angle turns clockwise, so `Math.PI / 2` runs left to
   * right and `Math.PI` runs top to bottom.
   */
  readonly angle: number;
  readonly stops: readonly UiGradientStop[];
}

export interface UiRadialGradient {
  readonly kind: 'radial';
  /** The centre, from the box's top-left. Defaults to `percent(50)` on both axes. */
  readonly centerX?: UiGradientOffset;
  readonly centerY?: UiGradientOffset;
  /**
   * The radius of the outermost stop. `percent(100)`, the default, is
   * the distance from the centre to the box's farthest corner, which is
   * CSS's `farthest-corner`.
   */
  readonly radius?: UiGradientOffset;
  readonly stops: readonly UiGradientStop[];
}

export type UiGradient = UiLinearGradient | UiRadialGradient;

/**
 * The most stops one gradient may carry.
 *
 * The WebGPU side stores a gradient as a fixed-size slab in a storage
 * buffer, because a variable-length record would need a second buffer
 * of stops and an index into it for what is, in every real interface, a
 * handful of colours. Eight keeps a record at twelve `vec4`s, and a
 * ninth stop is a loud error rather than a stop that quietly vanishes:
 * see `validateGradient`.
 */
export const MAX_GRADIENT_STOPS = 8;

/**
 * A linear gradient at `angle` radians, clockwise from the top.
 *
 *   linearGradient(Math.PI, [{ color: '#0ea5e9' }, { color: '#1e293b' }])
 */
export function linearGradient(angle: number, stops: readonly UiGradientStop[]): UiLinearGradient {
  return checked({ kind: 'linear', angle, stops });
}

/** A radial gradient, centred and sized as `UiRadialGradient` describes. */
export function radialGradient(
  stops: readonly UiGradientStop[],
  options: Omit<UiRadialGradient, 'kind' | 'stops'> = {}
): UiRadialGradient {
  return checked({ kind: 'radial', ...options, stops });
}

function checked<T extends UiGradient>(gradient: T): T {
  const message = validateGradient(gradient);
  if (message !== undefined) {
    throw new Error(message);
  }
  return gradient;
}

/**
 * Rejects a gradient the renderers cannot draw, returning the message
 * for the error the caller raises.
 *
 * The property registry calls this when a plain value is written, so a
 * bad gradient fails where it was authored. A gradient arriving through
 * an Observable is checked by `resolveGradient` instead, at paint,
 * which is where a bound length is checked too.
 */
export function validateGradient(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const gradient = value as Partial<UiGradient>;
  if (typeof value !== 'object' || value === null) {
    return `backgroundGradient: expected a gradient, got ${String(value)}. Use linearGradient() or radialGradient().`;
  }
  if (gradient.kind !== 'linear' && gradient.kind !== 'radial') {
    return `backgroundGradient: unknown gradient kind '${String(gradient.kind)}'. Use 'linear' or 'radial'.`;
  }
  if (gradient.kind === 'linear' && !Number.isFinite((gradient as UiLinearGradient).angle)) {
    return `backgroundGradient: a linear gradient needs a finite angle in radians, got ${String(
      (gradient as UiLinearGradient).angle
    )}.`;
  }
  const stops = gradient.stops;
  if (!Array.isArray(stops)) {
    return 'backgroundGradient: a gradient needs a `stops` array.';
  }
  if (stops.length < 2) {
    return `backgroundGradient: a gradient needs at least two stops, got ${stops.length}.`;
  }
  if (stops.length > MAX_GRADIENT_STOPS) {
    return (
      `backgroundGradient: ${stops.length} stops exceeds the ${MAX_GRADIENT_STOPS} a gradient may carry. ` +
      `The WebGPU backend stores a gradient as a fixed-size record, so the limit is a hard one; ` +
      `approximate the ramp with ${MAX_GRADIENT_STOPS} stops, or stack two gradients.`
    );
  }
  let placed = 0;
  for (const stop of stops as readonly UiGradientStop[]) {
    if (stop === null || typeof stop !== 'object') {
      return `backgroundGradient: expected a stop object, got ${String(stop)}.`;
    }
    if (stop.offset !== undefined) {
      placed++;
      if (!isGradientOffset(stop.offset)) {
        return `backgroundGradient: a stop offset must be a number of pixels or percent(n), got ${String(stop.offset)}.`;
      }
    }
  }
  if (placed !== 0 && placed !== stops.length) {
    return (
      `backgroundGradient: ${placed} of ${stops.length} stops carry an offset. ` +
      'Give every stop an offset, or none of them, in which case they spread evenly.'
    );
  }
  if (gradient.kind === 'radial') {
    const radial = gradient as UiRadialGradient;
    for (const [name, offset] of [
      ['centerX', radial.centerX],
      ['centerY', radial.centerY],
      ['radius', radial.radius]
    ] as const) {
      if (offset !== undefined && !isGradientOffset(offset)) {
        return `backgroundGradient: ${name} must be a number of pixels or percent(n), got ${String(offset)}.`;
      }
    }
  }
  return undefined;
}

function isGradientOffset(value: unknown): value is UiGradientOffset {
  return (typeof value === 'number' && Number.isFinite(value)) || isPercentLength(value);
}

/** Whether two gradient property values would paint the same, for the registry. */
export function gradientsEqual(a: UiGradient | undefined, b: UiGradient | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined || a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'linear' && b.kind === 'linear') {
    if (a.angle !== b.angle) {
      return false;
    }
  } else if (a.kind === 'radial' && b.kind === 'radial') {
    if (
      !offsetsEqual(a.centerX, b.centerX) ||
      !offsetsEqual(a.centerY, b.centerY) ||
      !offsetsEqual(a.radius, b.radius)
    ) {
      return false;
    }
  }
  if (a.stops.length !== b.stops.length) {
    return false;
  }
  for (let i = 0; i < a.stops.length; i++) {
    if (!offsetsEqual(a.stops[i].offset, b.stops[i].offset) || !colorValuesEqual(a.stops[i].color, b.stops[i].color)) {
      return false;
    }
  }
  return true;
}

function offsetsEqual(a: UiGradientOffset | undefined, b: UiGradientOffset | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (isPercentLength(a) && isPercentLength(b)) {
    return a.value === b.value;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Paint-time resolution
// ---------------------------------------------------------------------------

export interface ResolvedGradientStop {
  readonly offset: UiGradientOffset | undefined;
  readonly color: UiColor;
}

/**
 * A gradient with its palette names resolved against the node's theme,
 * and nothing else changed.
 *
 * Geometry stays as it was authored because it needs the node's box,
 * which `resolvePaintState` does not have: the renderer turns this into
 * a `GradientPaint` once it knows the record. Splitting it that way
 * also means the theme is read once per node per frame rather than once
 * per stop per pixel.
 */
export type ResolvedGradient =
  | { readonly kind: 'linear'; readonly angle: number; readonly stops: readonly ResolvedGradientStop[] }
  | {
      readonly kind: 'radial';
      readonly centerX: UiGradientOffset | undefined;
      readonly centerY: UiGradientOffset | undefined;
      readonly radius: UiGradientOffset | undefined;
      readonly stops: readonly ResolvedGradientStop[];
    };

/**
 * Note that the resolution itself, `resolveGradient`, lives in
 * `UiThemeColor.ts` rather than here. The registry imports this file
 * for `gradientsEqual` and `validateGradient`, and the theme lookup
 * reads properties, so a gradient that resolved its own stops would
 * close a cycle through the registry. It is the same split that keeps
 * `colorValuesEqual` in `UiColor.ts`.
 */

/**
 * A gradient placed in a box: geometry in the box's own coordinates,
 * with the origin at its top-left, and stop offsets as fractions of the
 * gradient's length.
 *
 * This is the shared form both renderers draw from. Canvas2D adds the
 * box's origin and hands the numbers to `createLinearGradient`; the
 * WebGPU builder writes them into the frame's gradient buffer and the
 * fragment shader evaluates the same ramp per pixel.
 */
export interface GradientPaint {
  readonly kind: 'linear' | 'radial';
  /** Linear: the start of the gradient line. Radial: the centre. */
  readonly x0: number;
  readonly y0: number;
  /** Linear: the end of the gradient line. Radial: the centre again. */
  readonly x1: number;
  readonly y1: number;
  /** Radial only; zero for a linear gradient. */
  readonly radius: number;
  readonly stops: readonly { readonly offset: number; readonly color: UiColor }[];
}

/**
 * Places a resolved gradient in a box of the given size.
 *
 * The linear case is CSS's: the gradient line runs through the centre
 * of the box in the direction of the angle, and it is long enough that
 * the two corners nearest its ends sit exactly on its endpoints, which
 * is `|w·sin| + |h·cos|`. The radial case is a circle, centred where
 * the gradient says and reaching the farthest corner at `percent(100)`.
 *
 * Offsets are clamped into `[0, 1]` and forced to not go backwards, as
 * CSS forces them, so the two backends receive one already-sorted list
 * and neither has to decide what a stop behind its predecessor means.
 */
export function gradientPaint(gradient: ResolvedGradient, width: number, height: number): GradientPaint {
  if (gradient.kind === 'linear') {
    const dx = Math.sin(gradient.angle);
    // Screen y grows downwards, so the vector for "towards the top" is
    // negative in y; this is the whole of the difference between CSS's
    // compass and the coordinates the renderers work in.
    const dy = -Math.cos(gradient.angle);
    const length = Math.abs(width * dx) + Math.abs(height * dy);
    const cx = width / 2;
    const cy = height / 2;
    return {
      kind: 'linear',
      x0: cx - (dx * length) / 2,
      y0: cy - (dy * length) / 2,
      x1: cx + (dx * length) / 2,
      y1: cy + (dy * length) / 2,
      radius: 0,
      stops: placeStops(gradient.stops, length)
    };
  }
  const cx = resolveOffset(gradient.centerX, width, width / 2);
  const cy = resolveOffset(gradient.centerY, height, height / 2);
  const farthest = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
  const radius = resolveOffset(gradient.radius, farthest, farthest);
  return {
    kind: 'radial',
    x0: cx,
    y0: cy,
    x1: cx,
    y1: cy,
    radius,
    stops: placeStops(gradient.stops, radius)
  };
}

/** A pixel length, or a percentage of `base`; `fallback` when unset. */
function resolveOffset(offset: UiGradientOffset | undefined, base: number, fallback: number): number {
  if (offset === undefined) {
    return fallback;
  }
  return isPercentLength(offset) ? (offset.value / 100) * base : offset;
}

function placeStops(
  stops: readonly ResolvedGradientStop[],
  length: number
): readonly { offset: number; color: UiColor }[] {
  const placed: { offset: number; color: UiColor }[] = [];
  const spread = stops.every(stop => stop.offset === undefined);
  let previous = 0;
  for (let i = 0; i < stops.length; i++) {
    const raw = spread ? i / (stops.length - 1) : resolveFraction(stops[i].offset, length);
    const offset = Math.max(previous, Math.min(1, Math.max(0, raw)));
    previous = offset;
    placed.push({ offset, color: stops[i].color });
  }
  return placed;
}

/** A stop's position as a fraction of the gradient's length. */
function resolveFraction(offset: UiGradientOffset | undefined, length: number): number {
  if (offset === undefined) {
    return 0;
  }
  if (isPercentLength(offset)) {
    return offset.value / 100;
  }
  return length > 0 ? offset / length : 0;
}
