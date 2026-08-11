export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parses a CSS color string into normalized RGBA.
 *
 * Supports:
 *   #rgb, #rgba, #rrggbb, #rrggbbaa
 *   rgb(r,g,b), rgba(r,g,b,a)
 *   named colors: transparent, black, white, red, green, blue
 *
 * Returns undefined for unsupported values so callers can skip
 * drawing instead of crashing.
 */
export function parseColor(value: unknown): RgbaColor | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return undefined;
  }

  const named = NAMED_COLORS[trimmed];
  if (named !== undefined) {
    return named;
  }

  if (trimmed.startsWith('#')) {
    return parseHex(trimmed);
  }
  if (trimmed.startsWith('rgb')) {
    return parseRgb(trimmed);
  }
  return undefined;
}

function parseHex(hex: string): RgbaColor | undefined {
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
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const a = raw.length === 8 ? (num >> 24) & 0xff : 0xff;
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

function parseRgb(source: string): RgbaColor | undefined {
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

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

const NAMED_COLORS: Record<string, RgbaColor> = {
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
