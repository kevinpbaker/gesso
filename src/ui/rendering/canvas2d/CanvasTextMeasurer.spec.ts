import { describe, expect, it } from 'vitest';

import { CanvasTextMeasurer } from './CanvasTextMeasurer';
import { RecordingCanvasContext } from '../RenderTestUtils';

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

  it('caps width at maxWidth', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    const size = measurer.measure({ text: 'abcdefgh', fontSize: 14, maxWidth: 10 });
    expect(size.width).toBe(10);
  });

  it('uses the provided line height', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    const size = measurer.measure({ text: 'x', fontSize: 14, lineHeight: 30 });
    expect(size.height).toBe(30);
  });

  it('caches measurements so measureText runs once per key', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    measurer.measure({ text: 'hello', fontSize: 14 });
    measurer.measure({ text: 'hello', fontSize: 14 });
    const measureCalls = ctx.calls.filter(call => call.name === 'measureText');
    expect(measureCalls).toHaveLength(1);
  });

  it('distinguishes cache keys by text, font and maxWidth', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    measurer.measure({ text: 'hello', fontSize: 14 });
    measurer.measure({ text: 'hello', fontSize: 20 });
    measurer.measure({ text: 'hello', fontSize: 14, maxWidth: 5 });
    const measureCalls = ctx.calls.filter(call => call.name === 'measureText');
    expect(measureCalls).toHaveLength(3);
  });

  it('evicts the cache when it grows too large', () => {
    const ctx = new RecordingCanvasContext();
    const measurer = new CanvasTextMeasurer(ctx);
    for (let i = 0; i < 5000; i++) {
      measurer.measure({ text: `text-${i}`, fontSize: 14 });
    }
    const afterChurn = measurer.measure({ text: 'hello', fontSize: 14 });
    expect(afterChurn.width).toBe(40);
  });
});
