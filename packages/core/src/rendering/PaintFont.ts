import { fontStackFor } from './FontStacks';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_FONT_WEIGHT } from './PaintState';
import type { PaintTextStyle } from './PaintSurface';

/** The canvas font a painted line of text is drawn in: the one string drawing and measuring both use. */
export function paintFont(style?: PaintTextStyle): string {
  const size = style?.fontSize ?? DEFAULT_FONT_SIZE;
  const weight = style?.fontWeight ?? DEFAULT_FONT_WEIGHT;
  const family = fontStackFor(style?.fontFamily ?? DEFAULT_FONT_FAMILY);
  const slant = style?.fontStyle === undefined || style.fontStyle === 'normal' ? '' : `${style.fontStyle} `;
  return `${slant}${String(weight)} ${size}px ${family}`;
}

interface Measuring {
  font: string;
  measureText(text: string): { width: number };
}

let shared: Measuring | null | undefined;

/** A context to measure with, made once; null where there is no canvas (in node, without a DOM). */
function measuring(): Measuring | null {
  if (shared !== undefined) {
    return shared;
  }
  shared =
    typeof OffscreenCanvas === 'undefined' ? null : (new OffscreenCanvas(1, 1).getContext('2d') as Measuring | null);
  return shared;
}

/**
 * How wide `text` would draw a line, for a painter that is being
 * recorded rather than drawn: measured on a canvas of its own in the
 * font drawing will use, or, with no canvas at all, estimated at
 * 0.55 em a character, so a painter laid out in a test still gets a
 * width that grows with its text and its size.
 */
export function measurePaintText(value: string, style?: PaintTextStyle): number {
  const context = measuring();
  if (context === null) {
    return value.length * 0.55 * (style?.fontSize ?? DEFAULT_FONT_SIZE);
  }
  context.font = paintFont(style);
  return context.measureText(value).width;
}
