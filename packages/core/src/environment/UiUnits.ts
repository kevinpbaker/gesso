/**
 * What a theme's lengths are measured against.
 *
 * Every length Gesso lays out or paints is a logical pixel, the CSS
 * pixel, and nothing in the layout pass knows another unit. A designer
 * thinks in more than one: type in points or rems, a print margin in
 * millimetres, a badge in inches. The two numbers here are what those
 * are worth in pixels, carried on the theme so a screen and the scales
 * it is written from agree on them.
 *
 * They are resolved when a value is written, not when it is laid out:
 * `lengths(theme.units).rem(1.5)` is the number 24, and the element
 * that receives it never knows it was a rem. That keeps the layout
 * engine's per-node cache honest, since a resolved number cannot change
 * under it when a parent's units do, and it is why changing a theme's
 * units moves what is written with them the next time it is written,
 * not the screen already drawn.
 */
export interface UiUnits {
  /**
   * How many logical pixels make an inch, and from it a point (1/72 in)
   * and a millimetre (1/25.4 in). 96, as in CSS, so a theme that never
   * sets it measures as the browser does.
   */
  readonly pixelsPerInch: number;
  /** What one `rem` is, in logical pixels: 16, as a browser's default root font. */
  readonly rootFontSize: number;
}

export const defaultUnits: UiUnits = { pixelsPerInch: 96, rootFontSize: 16 } as const;

/**
 * Conversions from a designer's units to logical pixels, for one set
 * of units.
 *
 * Unrounded, because a size in points is often meant to be a fraction
 * of a pixel (`pt(10.5)` is 14): rounding is the author's choice, made
 * where a half pixel would put every box inside on one too.
 */
export interface UiLengths {
  /** The units these convert with. */
  readonly units: UiUnits;
  /** Multiples of the root font size: `rem(1.5)` is 24 at the default 16. */
  rem(value: number): number;
  /** Inches: `inch(1)` is the pixels per inch. */
  inch(value: number): number;
  /** Points, 72 to the inch: `pt(12)` is 16 at 96 pixels per inch. */
  pt(value: number): number;
  /** Millimetres, 25.4 to the inch. */
  mm(value: number): number;
}

/**
 * The conversions for a set of units, usually a theme's.
 *
 *   const { rem, pt } = lengths(theme.units);
 *   <box padding={rem(1)}><text fontSize={pt(12)} /></box>
 *
 * A theme writes its own scales the same way, from the units it is
 * about to carry, so the scales follow them:
 *
 *   const units = { pixelsPerInch: 96, rootFontSize: 16 };
 *   const { rem } = lengths(units);
 *   export const theme = { ...lightTheme, units, spacing: { ...lightTheme.spacing, large: rem(1) } };
 *
 * Throws on units that cannot measure anything, a zero or negative or
 * non-finite number, since every length written from them would be.
 */
export function lengths(units: UiUnits = defaultUnits): UiLengths {
  check('pixelsPerInch', units.pixelsPerInch);
  check('rootFontSize', units.rootFontSize);
  const inch = units.pixelsPerInch;
  return {
    units,
    rem: value => value * units.rootFontSize,
    inch: value => value * inch,
    pt: value => (value * inch) / 72,
    mm: value => (value * inch) / 25.4
  };
}

/**
 * Compares two sets of units for equality.
 */
export function unitsEqual(a: UiUnits, b: UiUnits): boolean {
  return a.pixelsPerInch === b.pixelsPerInch && a.rootFontSize === b.rootFontSize;
}

function check(name: keyof UiUnits, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`UiUnits.${name} has to be a positive number of pixels; it was ${value}.`);
  }
}
