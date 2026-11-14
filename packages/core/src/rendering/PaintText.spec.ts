import { describe, expect, it } from 'vitest';

import { PaintTarget, type PaintResolver } from './PaintTarget';
import { PaintRecorder } from './PaintRecording';
import { RecordingPaintContext } from './RenderTestUtils';

const resolver: PaintResolver = { color: () => ({ r: 0, g: 0, b: 0, a: 1 }), gradient: () => undefined };

describe('a painted line of text', () => {
  it('is set upright by default, and in italics when its style says so', () => {
    const context = new RecordingPaintContext();
    const target = new PaintTarget(context, resolver);
    const fonts: string[] = [];
    target.text('Upright', 0, 10, { fontSize: 12, fontFamily: 'sans-serif' });
    fonts.push(context.font);
    target.text('Abstract', 0, 30, { fontSize: 12, fontFamily: 'sans-serif', fontStyle: 'italic', fontWeight: 700 });
    fonts.push(context.font);
    expect(fonts[0]).not.toMatch(/italic/);
    expect(fonts[1]).toMatch(/^italic 700 12px /);
  });
});

describe('a painted line of text, measured', () => {
  it('is measured in the font it would be drawn in, and draws nothing', () => {
    const context = new RecordingPaintContext();
    const target = new PaintTarget(context, resolver);
    target.measureText('Label', { fontSize: 13, fontWeight: 600 });
    expect(context.font).toMatch(/^600 13px /);
    target.text('Label', 0, 10, { fontSize: 13, fontWeight: 600 });
    expect(context.font).toMatch(/^600 13px /);
  });

  it('is measured while recording too, and the recording keeps no trace of it', () => {
    const recorder = new PaintRecorder();
    const short = recorder.measureText('12', { fontSize: 12 });
    const long = recorder.measureText('12.345 mm', { fontSize: 12 });
    const big = recorder.measureText('12', { fontSize: 24 });
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(big).toBeGreaterThan(short);
    expect(recorder.finish().ops).toEqual([]);
  });
});
