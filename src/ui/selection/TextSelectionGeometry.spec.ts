import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import type { LayoutBox } from '../layout/LayoutTypes';
import { createPaintState, type PaintState } from '../rendering/PaintState';
import {
  hasDrawnText,
  offsetAtPointIn,
  paragraphGeometry,
  selectionRectsIn,
  wordRangeIn
} from './TextSelectionGeometry';

/** 10px glyphs on a 10px font, 12px lines: every offset is a round number. */
const measurer = new CharacterCountTextMeasurer({ glyphWidth: 1 });

function state(overrides: Partial<PaintState> = {}): PaintState {
  return Object.assign(createPaintState(), { fontSize: 10, lineHeight: 12 }, overrides);
}

const box: LayoutBox = { x: 0, y: 0, width: 50, height: 100 };

describe('TextSelectionGeometry', () => {
  it('lays a paragraph out into the lines the renderers draw', () => {
    const geometry = paragraphGeometry('hello world', box, state(), measurer);
    expect(geometry.lines.map(line => line.text)).toEqual(['hello', 'world']);
    expect(geometry.end).toBe(11);
    expect(hasDrawnText(geometry)).toBe(true);
  });

  it('has nothing to select in empty text', () => {
    const geometry = paragraphGeometry('', box, state(), measurer);
    expect(hasDrawnText(geometry)).toBe(false);
    expect(offsetAtPointIn(geometry, 10, 5)).toBe(0);
    expect(selectionRectsIn(geometry, 0, 5)).toEqual([]);
  });

  it('finds the offset nearest a point, on the line under it', () => {
    const geometry = paragraphGeometry('hello world', box, state(), measurer);
    expect(offsetAtPointIn(geometry, 0, 0)).toBe(0);
    expect(offsetAtPointIn(geometry, 29, 0)).toBe(3);
    // Second line starts at 6 ('hello' + the space).
    expect(offsetAtPointIn(geometry, 21, 13)).toBe(8);
    // Past the last glyph of the last line: the end of the text.
    expect(offsetAtPointIn(geometry, 200, 13)).toBe(11);
  });

  /**
   * One box per line, and a range that runs through a wrap highlights
   * the space hanging at the break — the same rule the editable's
   * selection follows, from the same geometry.
   */
  it('covers a range with one box per line', () => {
    const geometry = paragraphGeometry('hello world', box, state(), measurer);
    expect(selectionRectsIn(geometry, 2, 8)).toEqual([
      { x: 20, y: 0, width: 40, height: 12 },
      { x: 0, y: 12, width: 20, height: 12 }
    ]);
  });

  it('clamps a range to the drawn text', () => {
    const geometry = paragraphGeometry('hello world', box, state(), measurer);
    expect(selectionRectsIn(geometry, -5, 99)).toEqual([
      { x: 0, y: 0, width: 60, height: 12 },
      { x: 0, y: 12, width: 50, height: 12 }
    ]);
    expect(selectionRectsIn(geometry, 5, 5)).toEqual([]);
  });

  /**
   * A clamped paragraph is the case an editable never has: only what is
   * on screen can be selected, and the geometry has to stop where the
   * glyphs do rather than measure the text that was cut.
   */
  it('stops at the last drawn line when maxLines clamps the text', () => {
    const geometry = paragraphGeometry('hello world again', box, state({ maxLines: 1 }), measurer);
    expect(geometry.lines.map(line => line.text)).toEqual(['hello']);
    expect(geometry.end).toBe(5);
    expect(geometry.text).toBe('hello');
    expect(offsetAtPointIn(geometry, 200, 0)).toBe(5);
    expect(selectionRectsIn(geometry, 0, 17)).toEqual([{ x: 0, y: 0, width: 50, height: 12 }]);
  });

  it('ignores the ellipsis, which is drawn but is not in the source', () => {
    const geometry = paragraphGeometry('hello world', box, state({ maxLines: 1, textOverflow: 'ellipsis' }), measurer);
    expect(geometry.lines[0].text.endsWith('…')).toBe(true);
    // The source offsets stop before the ellipsis, so copying gives
    // real text rather than the glyph standing in for the rest.
    expect(geometry.text).toBe(geometry.text.slice(0, geometry.end));
    expect(geometry.text.includes('…')).toBe(false);
  });

  it('mirrors x against the right edge for a right-to-left paragraph', () => {
    const geometry = paragraphGeometry('hello', box, state({ rtl: true }), measurer);
    expect(selectionRectsIn(geometry, 0, 2)).toEqual([{ x: 30, y: 0, width: 20, height: 12 }]);
  });

  it('takes the word around an offset', () => {
    const geometry = paragraphGeometry('hello world', box, state(), measurer);
    expect(wordRangeIn(geometry, 8)).toEqual({ start: 6, end: 11 });
  });
});
