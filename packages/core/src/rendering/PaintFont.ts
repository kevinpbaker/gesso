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
  measureText(text: string): {
    width: number;
    fontBoundingBoxAscent?: number;
    fontBoundingBoxDescent?: number;
    actualBoundingBoxAscent?: number;
    actualBoundingBoxDescent?: number;
  };
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
 * How big a line of painted text is: its width, and how far the font
 * reaches above and below the baseline `text()` draws it on.
 *
 * `ascent` and `descent` are the font's, not the glyphs': the same for
 * `"x"` as for `"Ág"` in one font and size, so plates behind labels that
 * say different things are one height, and a label centred on `y` is
 * drawn at `y + (ascent - descent) / 2`.
 */
export interface PaintTextMetrics {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
}

/**
 * The size of a line of painted text, measured wherever the code runs:
 * in a painter, in a render worker, or outside any paint at all (laying
 * out labels, hit-testing them, sizing a pill before it is drawn). It is
 * measured in the font `PaintSurface.text` draws with, on a canvas of its
 * own, so it agrees with what is drawn. With no canvas (node, without a
 * DOM) the width is estimated at 0.55 em a character and the font at
 * 0.8 em above the baseline and 0.2 em below.
 */
export function paintTextMetrics(value: string, style?: PaintTextStyle): PaintTextMetrics {
  const size = style?.fontSize ?? DEFAULT_FONT_SIZE;
  const context = measuring();
  if (context === null) {
    return { width: value.length * 0.55 * size, ascent: size * 0.8, descent: size * 0.2 };
  }
  context.font = paintFont(style);
  const measured = context.measureText(value);
  // `fontBoundingBox` is newer than `actualBoundingBox`; either is
  // better than a guess, and the guess is what is left.
  const ascent = measured.fontBoundingBoxAscent ?? measured.actualBoundingBoxAscent ?? size * 0.8;
  const descent = measured.fontBoundingBoxDescent ?? measured.actualBoundingBoxDescent ?? size * 0.2;
  return { width: measured.width, ascent, descent };
}

/**
 * How wide `text` would draw a line, for a painter that is being
 * recorded rather than drawn, or for code that is not painting at all: measured on a canvas of its own in the
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
