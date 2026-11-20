import { normalizeColor } from '../../properties/UiColor';

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A colour as the WebGPU backend writes it into an instance: four
 * channels, straight alpha, nought to one.
 *
 * Parsed by the same function the rest of the framework uses. This
 * module once had a parser of its own, and the two had drifted: it read
 * an eight-digit hex as AARRGGBB where every other reader, CSS
 * included, reads RRGGBBAA, which went unseen only because the strings
 * it was handed happened to be formatted as six digits or as `rgba()`.
 * A copy is returned because the shared parser hands out one cached,
 * immutable object per string.
 */
export function parseColor(value: unknown): RgbaColor | undefined {
  const color = normalizeColor(value);
  return color === undefined ? undefined : { r: color.r, g: color.g, b: color.b, a: color.a };
}
