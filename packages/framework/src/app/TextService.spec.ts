import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer } from 'gesso-core';

import { TextService } from './TextService';

/**
 * Measurement an application can ask for.
 *
 * The measurer is deterministic here — one unit per character — so
 * these assert the plumbing and the rules, not a font's metrics.
 */
describe('TextService', () => {
  const withMeasurer = () => {
    const service = new TextService();
    service.setMeasurer(new CharacterCountTextMeasurer());
    return service;
  };

  it('measures a string through the measurer it was given', () => {
    const service = withMeasurer();
    expect(service.widthOf('abcd', { fontSize: 10 })).toBeGreaterThan(service.widthOf('ab', { fontSize: 10 }));
  });

  it('gives the size, not only the width', () => {
    const size = withMeasurer().measure({ text: 'abc', fontSize: 10 });
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  /**
   * The question is how wide the text *wants* to be. A wrapped answer
   * would be the width it was given rather than the width it needs.
   */
  it('does not wrap when asked for a width', () => {
    const service = withMeasurer();
    const long = 'a word and then some more words after it';
    expect(service.widthOf(long, { fontSize: 10 })).toBeGreaterThan(service.widthOf('a word', { fontSize: 10 }));
  });

  /**
   * Zero before the runtime has drawn anything, which is the honest
   * answer: the font it would be measured in is not resolved yet.
   */
  it('answers zero until there is a measurer', () => {
    const service = new TextService();
    expect(service.ready).toBe(false);
    expect(service.widthOf('anything', { fontSize: 12 })).toBe(0);
  });

  it('knows when it can answer', () => {
    expect(withMeasurer().ready).toBe(true);
  });
});
