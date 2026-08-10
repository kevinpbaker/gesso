import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer } from './TextMeasurer';

describe('CharacterCountTextMeasurer', () => {
  it('sizes text by character count and font size', () => {
    const measurer = new CharacterCountTextMeasurer();
    const size = measurer.measure({ text: 'Hello', fontSize: 10 });
    expect(size.width).toBe(30);
    expect(size.height).toBe(12);
  });

  it('returns zero for empty text', () => {
    const measurer = new CharacterCountTextMeasurer();
    const size = measurer.measure({ text: '', fontSize: 10 });
    expect(size.width).toBe(0);
    expect(size.height).toBe(12);
  });

  it('clamps width to maxWidth', () => {
    const measurer = new CharacterCountTextMeasurer();
    const size = measurer.measure({ text: 'Hello', fontSize: 10, maxWidth: 20 });
    expect(size.width).toBe(20);
    expect(size.height).toBe(12);
  });
});
