import { describe, expect, it } from 'vitest';

import { PaintTarget, type PaintResolver } from './PaintTarget';
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
