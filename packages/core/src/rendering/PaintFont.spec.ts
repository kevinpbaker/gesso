import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Measuring painted text from anywhere: a painter, a render worker, or
 * code that lays labels out before anything is drawn. Calcwright sized
 * the pill beside a drag ("253 mm at 18°") at 5.7 px a character and
 * hit-tested its labels from a canvas it made itself; Mockz guessed 6.4.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** A canvas whose text is 7 px a character, with a font 11 up and 3 down at 14 px. */
function stubCanvas(fonts: string[]) {
  class FakeOffscreen {
    getContext() {
      return {
        font: '',
        measureText(this: { font: string }, text: string) {
          fonts.push(this.font);
          const size = Number(/(\d+)px/.exec(this.font)?.[1] ?? 14);
          return {
            width: text.length * size * 0.5,
            fontBoundingBoxAscent: size * 0.8,
            fontBoundingBoxDescent: size * 0.2
          };
        }
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreen);
}

describe('paintTextMetrics', () => {
  it('measures in the font text() draws with', async () => {
    const fonts: string[] = [];
    stubCanvas(fonts);
    const { paintTextMetrics, measurePaintText, paintFont } = await import('./PaintFont');
    const style = { fontSize: 20, fontWeight: 600 };
    expect(paintTextMetrics('253 mm', style)).toEqual({ width: 60, ascent: 16, descent: 4 });
    expect(measurePaintText('253 mm', style)).toBe(60);
    expect(fonts).toEqual([paintFont(style), paintFont(style)]);
  });

  it('answers the same as a painter’s own measureText', async () => {
    stubCanvas([]);
    const { paintTextMetrics } = await import('./PaintFont');
    const { PaintRecorder } = await import('./PaintRecording');
    const recorder = new PaintRecorder();
    expect(recorder.measureText('R 50 mm', { fontSize: 11 })).toBe(paintTextMetrics('R 50 mm', { fontSize: 11 }).width);
  });

  it('estimates, growing with the text and its size, where there is no canvas', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const { paintTextMetrics } = await import('./PaintFont');
    const short = paintTextMetrics('ab', { fontSize: 10 });
    const long = paintTextMetrics('abcd', { fontSize: 10 });
    expect(long.width).toBeCloseTo(short.width * 2, 5);
    expect(short.ascent + short.descent).toBeCloseTo(10, 5);
  });
});
