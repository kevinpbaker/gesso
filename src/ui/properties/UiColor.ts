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

export const UiColors = {
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
 * Converts a UiColor to a CSS-compatible hex string.
 *
 * This is a renderer convenience only; the canonical representation
 * remains the float object.
 */
export function colorToHex(color: UiColor): string {
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
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${color.a})`;
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
 * Parses a CSS color string into a UiColor.
 *
 * Supports hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba(),
 * and a small set of named colors. Returns undefined for unsupported
 * values.
 */
export function parseColor(value: string): UiColor | undefined {
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
