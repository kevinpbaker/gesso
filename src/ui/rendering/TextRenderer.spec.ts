import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import type { TextMeasurer } from '../layout/TextMeasurer';
import { RecordingCanvasContext } from './RenderTestUtils';
import { createPaintState } from './PaintState';
import { buildFontString, drawText, layoutTextLines } from './TextRenderer';

function state(overrides: Partial<ReturnType<typeof createPaintState>>) {
  return { ...createPaintState(), ...overrides };
}

const measurer: TextMeasurer = new CharacterCountTextMeasurer();

describe('layoutTextLines', () => {
  it('lays out a single line at the box top-left by default', () => {
    const lines = layoutTextLines(
      { x: 10, y: 20, width: 100, height: 40 },
      state({ text: 'Hello', fontSize: 10 }),
      measurer
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ text: 'Hello', x: 10, y: 20, width: 30, height: 12 });
  });

  it('centers horizontally', () => {
    const [line] = layoutTextLines(
      { x: 10, y: 20, width: 100, height: 40 },
      state({ text: 'Hello', fontSize: 10, textAlign: 'center' }),
      measurer
    );
    expect(line.x).toBe(10 + (100 - 30) / 2);
  });

  it('right-aligns horizontally', () => {
    const [line] = layoutTextLines(
      { x: 10, y: 20, width: 100, height: 40 },
      state({ text: 'Hello', fontSize: 10, textAlign: 'right' }),
      measurer
    );
    expect(line.x).toBe(10 + 100 - 30);
  });

  it('centers vertically', () => {
    const [line] = layoutTextLines(
      { x: 10, y: 20, width: 100, height: 40 },
      state({ text: 'Hello', fontSize: 10, verticalAlign: 'middle' }),
      measurer
    );
    expect(line.y).toBe(20 + (40 - 12) / 2);
  });

  it('aligns to the bottom vertically', () => {
    const [line] = layoutTextLines(
      { x: 10, y: 20, width: 100, height: 40 },
      state({ text: 'Hello', fontSize: 10, verticalAlign: 'bottom' }),
      measurer
    );
    expect(line.y).toBe(20 + (40 - 12));
  });

  it('stacks multi-line text by line height', () => {
    const lines = layoutTextLines(
      { x: 0, y: 0, width: 100, height: 60 },
      state({ text: 'a\nb', fontSize: 10 }),
      measurer
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].y).toBe(0);
    expect(lines[1].y).toBe(12);
  });

  it('uses a custom line height when provided', () => {
    const lines = layoutTextLines(
      { x: 0, y: 0, width: 100, height: 60 },
      state({ text: 'a\nb', fontSize: 10, lineHeight: 20 }),
      measurer
    );
    expect(lines[0].height).toBe(20);
    expect(lines[1].y).toBe(20);
  });

  it('returns no lines for empty text or non-positive font size', () => {
    expect(
      layoutTextLines({ x: 0, y: 0, width: 100, height: 20 }, state({ text: undefined, fontSize: 10 }), measurer)
    ).toEqual([]);
    expect(
      layoutTextLines({ x: 0, y: 0, width: 100, height: 20 }, state({ text: 'Hello', fontSize: 0 }), measurer)
    ).toEqual([]);
  });
});

describe('buildFontString', () => {
  it('builds a Canvas2D font shorthand', () => {
    expect(buildFontString({ fontWeight: 'bold', fontSize: 14, fontFamily: 'Arial' })).toBe('bold 14px Arial');
    expect(buildFontString({ fontWeight: 700, fontSize: 12, fontFamily: 'sans-serif' })).toBe('700 12px sans-serif');
  });
});

describe('drawText', () => {
  it('installs the text style and draws each line', () => {
    const ctx = new RecordingCanvasContext();
    const textState = state({ text: 'Hi', fontSize: 10, textColor: { r: 0, g: 1, b: 0, a: 1 }, textAlign: 'center' });
    drawText(ctx, { x: 10, y: 20, width: 100, height: 40 }, textState, measurer);

    const names = ctx.calls.map(call => call.name);
    expect(names).toContain('set:font');
    expect(names).toContain('set:fillStyle');
    expect(names).toContain('set:textBaseline');
    expect(names).toContain('set:textAlign');
    expect(ctx.font).toBe('normal 10px sans-serif');
    expect(ctx.textBaseline).toBe('top');
    expect(ctx.textAlign).toBe('left');

    const draws = ctx.calls.filter(call => call.name === 'fillText');
    expect(draws).toHaveLength(1);
    expect(draws[0].args).toEqual(['Hi', 10 + (100 - 12) / 2, 20, 100]);
  });

  it('draws nothing for empty text', () => {
    const ctx = new RecordingCanvasContext();
    drawText(ctx, { x: 0, y: 0, width: 100, height: 20 }, state({ text: undefined }), measurer);
    expect(ctx.calls).toEqual([]);
  });
});
