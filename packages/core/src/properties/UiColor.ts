/**
 * Renderer-independent color representation.
 *
 * Channels are stored as floats in the [0, 1] range. This value
 * type is intentionally free of CSS strings, Canvas2D fillStyle
 * semantics, or GPU formats; conversion to a renderer's native
 * color format belongs to the renderer.
 */
export interface UiColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const UiBasicColors = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 1, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 }
} as const;

/**
 * Creates a color from RGBA float components.
 */
export function rgba(r: number, g: number, b: number, a = 1): UiColor {
  return { r, g, b, a };
}

/**
 * Creates a color from 8-bit RGBA integer components.
 */
export function rgb8(r: number, g: number, b: number, a = 255): UiColor {
  return {
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: a / 255
  };
}

/**
 * Compares two colors for equality.
 *
 * Uses a small epsilon for the float channels so that colors
 * produced by different computations (e.g. 1/3 vs 0.333333) are
 * considered equal when visually indistinguishable.
 */
export function colorsEqual(a: UiColor, b: UiColor): boolean {
  const epsilon = 0.0001;
  return (
    Math.abs(a.r - b.r) < epsilon &&
    Math.abs(a.g - b.g) < epsilon &&
    Math.abs(a.b - b.b) < epsilon &&
    Math.abs(a.a - b.a) < epsilon
  );
}

/**
 * Formatting caches, keyed on the identity of the color object.
 *
 * A UiColor is an immutable record, so once a given instance has been
 * turned into a string that string stays correct for the life of the
 * instance. Nothing in the repository writes to a color's channels;
 * the interface declares them readonly and every derived color is
 * built as a fresh object, so identity is a safe key here.
 *
 * These caches only pay for themselves because parseColor memoizes
 * too. The colors a renderer formats every frame come either from a
 * theme palette, whose objects are module constants, or from a parsed
 * CSS string. Without the parse cache below, every frame would hand
 * these maps a brand new object and every lookup would miss, so the
 * two caches have to be kept together: removing the parse cache turns
 * these into pure overhead.
 *
 * A WeakMap needs no size bound, because an entry cannot outlive the
 * color that keys it.
 */
const hexCache = new WeakMap<UiColor, string>();
const rgbaCache = new WeakMap<UiColor, string>();

/**
 * Converts a UiColor to a CSS-compatible hex string.
 *
 * This is a renderer convenience only; the canonical representation
 * remains the float object.
 */
export function colorToHex(color: UiColor): string {
  const cached = hexCache.get(color);
  if (cached !== undefined) {
    return cached;
  }
  const formatted = formatHex(color);
  hexCache.set(color, formatted);
  return formatted;
}

function formatHex(color: UiColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(color.a * 255);
  const channels = [r, g, b, a];
  const hex = channels.map(c => c.toString(16).padStart(2, '0')).join('');
  const shortenable = channels.every(c => c >> 4 === (c & 0x0f));
  if (shortenable) {
    if (a === 255) {
      return `#${hex[0]}${hex[2]}${hex[4]}`;
    }
    return `#${hex[0]}${hex[2]}${hex[4]}${hex[6]}`;
  }
  if (a === 255) {
    return `#${hex.slice(0, 6)}`;
  }
  return `#${hex}`;
}

/**
 * Converts a UiColor to a CSS rgba() string.
 */
export function colorToRgba(color: UiColor): string {
  const cached = rgbaCache.get(color);
  if (cached !== undefined) {
    return cached;
  }
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const formatted = `rgba(${r}, ${g}, ${b}, ${color.a})`;
  rgbaCache.set(color, formatted);
  return formatted;
}

const NAMED_COLORS: Record<string, UiColor> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 0.5, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 },
  yellow: { r: 1, g: 1, b: 0, a: 1 },
  cyan: { r: 0, g: 1, b: 1, a: 1 },
  magenta: { r: 1, g: 0, b: 1, a: 1 },
  orange: { r: 1, g: 0.65, b: 0, a: 1 },
  gray: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
  grey: { r: 0.5, g: 0.5, b: 0.5, a: 1 }
};

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

function parseHexColor(hex: string): UiColor | undefined {
  let raw = hex.slice(1);
  if (raw.length === 3 || raw.length === 4) {
    raw = raw
      .split('')
      .map(c => c + c)
      .join('');
  }
  if (raw.length !== 6 && raw.length !== 8) {
    return undefined;
  }
  const num = Number.parseInt(raw, 16);
  if (!Number.isFinite(num)) {
    return undefined;
  }
  if (raw.length === 8) {
    const r = (num >> 24) & 0xff;
    const g = (num >> 16) & 0xff;
    const b = (num >> 8) & 0xff;
    const a = num & 0xff;
    return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
  }
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
}

function parseRgbColor(source: string): UiColor | undefined {
  const open = source.indexOf('(');
  const close = source.indexOf(')');
  if (open < 0 || close < 0) {
    return undefined;
  }
  const parts = source
    .slice(open + 1, close)
    .split(',')
    .map(s => s.trim());
  if (parts.length < 3) {
    return undefined;
  }
  const values: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const num = Number(part.replace('%', ''));
    if (!Number.isFinite(num)) {
      return undefined;
    }
    if (part.includes('%')) {
      values.push(num / 100);
    } else if (i === 3) {
      values.push(num);
    } else {
      values.push(num / 255);
    }
  }
  const [r, g, b, a = 1] = values;
  return {
    r: clamp01(r),
    g: clamp01(g),
    b: clamp01(b),
    a: clamp01(a)
  };
}

/**
 * Marks a string that has already been found unparseable.
 *
 * "Unsupported" is a real answer worth caching, and a bare undefined
 * in the map could not be told apart from a miss without a second
 * lookup through has(). A sentinel object keeps the hot path to one
 * map read.
 */
const UNSUPPORTED: UiColor = { r: 0, g: 0, b: 0, a: 0 };

/**
 * How many distinct color strings the parse cache will hold.
 *
 * An application's colors come from a small fixed set, usually a
 * theme palette and a handful of literals, so a few hundred entries
 * covers the working set several times over. But a color can also
 * arrive through a binding, and an animated rgba() produces a fresh
 * string on every frame; caching those without a bound would be a
 * leak that grows for as long as the application runs.
 *
 * When the cache fills it is cleared wholesale rather than evicted
 * entry by entry. That is the right trade here precisely because the
 * real working set is tiny: rebuilding it costs one parse per
 * distinct color, which is a single frame's worth of work at most,
 * and it buys us a cache with no bookkeeping of recency at all.
 */
const PARSE_CACHE_LIMIT = 256;

const parseCache = new Map<string, UiColor>();

/**
 * Parses a CSS color string into a UiColor.
 *
 * Supports hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba(),
 * and a small set of named colors. Returns undefined for unsupported
 * values.
 *
 * The result is memoized on the raw input string, which matters for
 * more than the parse itself: resolving a node's paint state parses
 * the same handful of constant strings on every node of every frame,
 * and returning the same instance each time is what lets colorToHex
 * and colorToRgba cache their output by identity. Callers must treat
 * the returned color as immutable, as the interface's readonly
 * channels already require, because they are very likely holding the
 * same object as everyone else who asked for that color.
 */
export function parseColor(value: string): UiColor | undefined {
  const cached = parseCache.get(value);
  if (cached !== undefined) {
    return cached === UNSUPPORTED ? undefined : cached;
  }
  const parsed = parseColorUncached(value);
  if (parseCache.size >= PARSE_CACHE_LIMIT) {
    parseCache.clear();
  }
  parseCache.set(value, parsed ?? UNSUPPORTED);
  return parsed;
}

function parseColorUncached(value: string): UiColor | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return undefined;
  }
  const named = NAMED_COLORS[trimmed];
  if (named !== undefined) {
    return named;
  }
  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed);
  }
  if (trimmed.startsWith('rgb')) {
    return parseRgbColor(trimmed);
  }
  return undefined;
}

/**
 * Normalizes a color value to a UiColor.
 *
 * UiColor objects pass through unchanged. CSS strings are parsed.
 * Unsupported values return undefined.
 */
export function normalizeColor(value: unknown): UiColor | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return parseColor(value);
  }
  if (
    typeof value === 'object' &&
    typeof (value as Partial<UiColor>).r === 'number' &&
    typeof (value as Partial<UiColor>).g === 'number' &&
    typeof (value as Partial<UiColor>).b === 'number' &&
    typeof (value as Partial<UiColor>).a === 'number'
  ) {
    return value as UiColor;
  }
  return undefined;
}

/**
 * Equality for color property values, used by the registry to decide
 * whether a change repaints. Two literal colors compare by channel; a
 * theme palette name compares by name, because what it paints depends
 * on a theme this comparison cannot see. Lives here rather than with
 * the theme lookup so the registry can import it without a cycle.
 */
export function colorValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  const normalizedA = normalizeColor(a);
  const normalizedB = normalizeColor(b);
  if (normalizedA === undefined || normalizedB === undefined) {
    return false;
  }
  return colorsEqual(normalizedA, normalizedB);
}
