import { describe, expect, it } from 'vitest';

import { CanvasTextMeasurer } from './CanvasTextMeasurer';
import { callArgs, RecordingCanvasContext } from '../RenderTestUtils';

/** The recording context reports 8px per character and no font metrics. */
describe('CanvasTextMeasurer', () => {
  it('measures text through the context with the requested font', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    const size = measurer.measure({ text: 'abc', fontSize: 14 });
    expect(ctx.font).toBe('normal 14px sans-serif');
    expect(size.width).toBe(24);
    expect(size.height).toBe(14 * 1.2);
  });

  it('passes style fields through to the font', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    measurer.measure({ text: 'x', fontSize: 20, fontFamily: 'Arial', fontWeight: 700 });
    expect(ctx.font).toBe('700 20px Arial');
  });

  it('wraps at spaces within maxWidth', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    const paragraph = measurer.layout({ text: 'ab cd ef', fontSize: 14, maxWidth: 40 });
    expect(paragraph.lines.map(line => line.text)).toEqual(['ab cd', 'ef']);
    expect(paragraph.width).toBe(40);
  });

  it('never narrows below an unbreakable word', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    const size = measurer.measure({ text: 'abcdefgh', fontSize: 14, maxWidth: 10 });
    expect(size.width).toBe(64);
  });

  it('uses the provided line height', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    const size = measurer.measure({ text: 'x', fontSize: 14, lineHeight: 30 });
    expect(size.height).toBe(30);
  });

  it('falls back to proportional metrics when the context has none', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    const paragraph = measurer.layout({ text: 'x', fontSize: 10 });
    expect(paragraph.ascent).toBe(8);
    expect(paragraph.descent).toBe(2);
  });

  it("measures a run and a font's metrics once each", () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    measurer.measure({ text: 'hello', fontSize: 14 });
    measurer.measure({ text: 'hello', fontSize: 14 });
    measurer.measure({ text: 'hello', fontSize: 14 });
    const texts = ctx.calls.filter(call => call.name === 'measureText').map(call => call.args[0]);
    expect(texts).toEqual(['Mg', 'hello']);
  });

  it('keys the width cache by font, not by available width', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    measurer.measure({ text: 'hello', fontSize: 14 });
    measurer.measure({ text: 'hello', fontSize: 20 });
    // Same font as the first call: only the space separator (used by
    // the line breaker) is new.
    measurer.measure({ text: 'hello', fontSize: 14, maxWidth: 5 });
    const texts = ctx.calls.filter(call => call.name === 'measureText').map(call => call.args[0]);
    expect(texts).toEqual(['Mg', 'hello', 'Mg', 'hello', ' ']);
  });

  it('evicts the cache when it grows too large', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    for (let i = 0; i < 9000; i++) {
      measurer.measure({ text: `text-${i}`, fontSize: 14 });
    }
    const afterChurn = measurer.measure({ text: 'hello', fontSize: 14 });
    expect(afterChurn.width).toBe(40);
  });
});

describe('CanvasTextMeasurer width cache', () => {
  const request = { text: '', fontSize: 14 };
  const measured = (ctx: RecordingCanvasContext, text: string): number =>
    callArgs(ctx, 'measureText').filter(args => args[0] === text).length;

  it('keeps a width in use however many others pass through', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    for (let i = 0; i < 20_000; i++) {
      measurer.measureRunWidth(`cell ${i}`, request);
      if (i % 500 === 0) {
        measurer.measureRunWidth('Total', request);
      }
    }
    // It used to be dropped with everything else each time the cache
    // filled, and measured again on the next frame.
    expect(measured(ctx, 'Total')).toBe(1);
  });

  it('drops a width nobody asked for over a whole generation, so the memory stays bounded', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    measurer.measureRunWidth('once', request);
    for (let i = 0; i < 10_000; i++) {
      measurer.measureRunWidth(`cell ${i}`, request);
    }
    measurer.measureRunWidth('once', request);
    expect(measured(ctx, 'once')).toBe(2);
  });
});
