import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import { clearMatchRanges, matchRangesOf, setMatchRanges } from './UiTextMatches';

const graph = new UiGraph();
let ids = 0;
const node = () => graph.createNode(`n${ids++}`, UiNodeType.Text);

describe('UiTextMatches', () => {
  it('round-trips a list of ranges', () => {
    const text = node();
    expect(matchRangesOf(text)).toBeUndefined();
    expect(
      setMatchRanges(text, [
        { start: 0, end: 2 },
        { start: 5, end: 7 }
      ])
    ).toBe(true);
    expect(matchRangesOf(text)).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 7 }
    ]);
  });

  it('reports whether the ranges changed, so paint is only marked when they did', () => {
    const text = node();
    setMatchRanges(text, [{ start: 0, end: 2 }]);
    expect(setMatchRanges(text, [{ start: 0, end: 2 }])).toBe(false);
    expect(setMatchRanges(text, [{ start: 0, end: 3 }])).toBe(true);
    expect(
      setMatchRanges(text, [
        { start: 0, end: 3 },
        { start: 4, end: 5 }
      ])
    ).toBe(true);
  });

  it('treats an empty list as no matches at all', () => {
    const text = node();
    setMatchRanges(text, [{ start: 0, end: 2 }]);
    expect(setMatchRanges(text, [])).toBe(true);
    expect(matchRangesOf(text)).toBeUndefined();
    expect(setMatchRanges(text, [])).toBe(false);
  });

  it('clears, reporting whether there was anything to clear', () => {
    const text = node();
    setMatchRanges(text, [{ start: 1, end: 2 }]);
    expect(clearMatchRanges(text)).toBe(true);
    expect(clearMatchRanges(text)).toBe(false);
  });
});
