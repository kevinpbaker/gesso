import { describe, expect, it } from 'vitest';

import { WebGPUGlyphAtlas, phaseFor, GLYPH_SUBPIXEL_PHASES } from './WebGPUGlyphAtlas';
import { GlyphShaper } from './WebGPUGlyphShaper';

/**
 * The glyph atlas and the line shaper (ROADMAP.md F9).
 *
 * Both are pure CPU: the atlas decides where a cell goes and the
 * shaper decides where a cluster sits on its line, and neither needs a
 * device. That is the reason they are split from `WebGPUGlyphPages`,
 * and it is what lets the packing, the eviction and the positioning be
 * asserted here rather than only seen in a browser.
 */
describe('WebGPUGlyphAtlas', () => {
  const FONT = 'normal 10px sans-serif';

  function atlas(pageSize = 64, maxPages = 2): WebGPUGlyphAtlas {
    return new WebGPUGlyphAtlas({ pageSize, maxPages });
  }

  it('allocates a cell once per cluster, style and phase', () => {
    const a = atlas();
    const style = a.styleFor(FONT, '#000', 10, 1);
    const first = a.slotFor(style, 'a', 6, 0)!;
    expect(a.slotFor(style, 'a', 6, 0)).toBe(first);
    expect(a.glyphCount).toBe(1);
    // A second phase of the same letter is a second cell: the pixels
    // differ, which is the whole point of rasterising per phase.
    expect(a.slotFor(style, 'a', 6, 1)).not.toBe(first);
    expect(a.glyphCount).toBe(2);
    // A different colour is a different style, and its own cells.
    a.slotFor(a.styleFor(FONT, '#fff', 10, 1), 'a', 6, 0);
    expect(a.glyphCount).toBe(3);
  });

  it('queues each new cell for upload exactly once', () => {
    const a = atlas();
    const style = a.styleFor(FONT, '#000', 10, 1);
    a.slotFor(style, 'a', 6, 0);
    a.slotFor(style, 'b', 6, 0);
    a.slotFor(style, 'a', 6, 0);
    const pending = a.takePending();
    expect(pending.map(upload => upload.cluster)).toEqual(['a', 'b']);
    expect(a.takePending()).toEqual([]);
  });

  it('bakes the subpixel phase into the pen inside the cell', () => {
    const a = atlas();
    const style = a.styleFor(FONT, '#000', 10, 1);
    a.slotFor(style, 'a', 6, 0);
    a.slotFor(style, 'a', 1, 1);
    const [zero, one] = a.takePending();
    // The cell's left edge is a whole pixel either way; only where the
    // glyph is drawn inside it moves.
    expect(one.penX - zero.penX).toBeCloseTo(1 / GLYPH_SUBPIXEL_PHASES, 10);
    expect(zero.penX % 1).toBe(0);
  });

  it('gives a cell a UV rectangle inside its page and an offset from the pen', () => {
    const a = atlas(64, 2);
    const style = a.styleFor(FONT, '#000', 10, 1);
    const slot = a.slotFor(style, 'a', 6, 0)!;
    expect(slot.page).toBe(0);
    expect(slot.u).toBe(0);
    expect(slot.v).toBe(0);
    expect(slot.uw).toBeGreaterThan(0);
    expect(slot.uw).toBeLessThanOrEqual(1);
    // The cell starts left of and above the pen: a side bearing, and
    // the ascent the baseline sits below.
    expect(slot.offsetX).toBeLessThan(0);
    expect(slot.offsetY).toBeLessThan(0);
    expect(slot.width).toBeGreaterThan(6);
  });

  it('starts a new shelf when a row fills, and a new page when a page does', () => {
    const a = atlas(64, 2);
    const style = a.styleFor(FONT, '#000', 10, 1);
    const pages = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const slot = a.slotFor(style, String.fromCharCode(0x41 + i), 6, 0);
      if (slot !== null) {
        pages.add(slot.page);
      }
    }
    expect(a.pageCount).toBeGreaterThan(1);
    expect(pages.has(1)).toBe(true);
  });

  it('clears the least recently used page when every page is full', () => {
    const a = atlas(64, 1);
    const style = a.styleFor(FONT, '#000', 10, 1);
    for (let i = 0; i < 40; i++) {
      a.slotFor(style, String.fromCharCode(0x41 + i), 6, 0);
    }
    a.takePending();
    const held = a.glyphCount;
    expect(a.pageCount).toBe(1);
    // The page filled and was recycled, so the cells on it went with it.
    expect(held).toBeLessThan(40);
    expect(a.takeCleared()).toContain(0);
    expect(a.takeCleared()).toEqual([]);
  });

  it('refuses a cluster that cannot fit a page', () => {
    const a = atlas(16, 1);
    const style = a.styleFor(FONT, '#000', 400, 1);
    expect(a.slotFor(style, 'a', 300, 0)).toBeNull();
  });

  it('drops everything on reset', () => {
    const a = atlas();
    a.slotFor(a.styleFor(FONT, '#000', 10, 1), 'a', 6, 0);
    a.reset();
    expect(a.glyphCount).toBe(0);
    expect(a.pageCount).toBe(0);
    expect(a.takePending()).toEqual([]);
  });

  it('quantises a pen fraction into a phase, and never past the last one', () => {
    expect(phaseFor(0)).toBe(0);
    expect(phaseFor(0.5)).toBe(1);
    expect(phaseFor(0.999)).toBe(GLYPH_SUBPIXEL_PHASES - 1);
    expect(phaseFor(1)).toBe(GLYPH_SUBPIXEL_PHASES - 1);
  });
});

describe('GlyphShaper', () => {
  const FONT = 'normal 10px sans-serif';
  /** Six pixels a character, as the deterministic measurer gives. */
  const measure = (text: string): number => text.length * 6;

  it('positions clusters by prefix width and ends at the line width', () => {
    const shaper = new GlyphShaper();
    const clusters = shaper.shape('abc', FONT, 18, measure);
    expect(clusters.map(c => c.text)).toEqual(['a', 'b', 'c']);
    expect(clusters.map(c => c.x)).toEqual([0, 6, 12]);
    expect(clusters[2].x + clusters[2].advance).toBe(18);
  });

  it('ends the last cluster at the measured line width, not at a prefix', () => {
    const shaper = new GlyphShaper();
    // A line whose measured width includes kerning the prefixes do not:
    // the run still has to end exactly where layout put it.
    const clusters = shaper.shape('ab', FONT, 11, measure);
    expect(clusters[1].x + clusters[1].advance).toBe(11);
  });

  it('marks whitespace clusters as blank so the frame loop skips them', () => {
    const shaper = new GlyphShaper();
    const clusters = shaper.shape('a b', FONT, 18, measure);
    expect(clusters.map(c => c.blank)).toEqual([false, true, false]);
  });

  it('keeps combining marks with their base as one cluster', () => {
    const shaper = new GlyphShaper();
    const clusters = shaper.shape('éx', FONT, 18, measure);
    expect(clusters.map(c => c.text)).toEqual(['é', 'x']);
  });

  it('shapes a line once and reuses it', () => {
    const shaper = new GlyphShaper();
    let calls = 0;
    const counted = (text: string): number => {
      calls++;
      return measure(text);
    };
    const first = shaper.shape('hello', FONT, 30, counted);
    const measured = calls;
    expect(measured).toBeGreaterThan(0);
    expect(shaper.shape('hello', FONT, 30, counted)).toBe(first);
    expect(calls).toBe(measured);
    // A different font is a different shaping.
    shaper.shape('hello', 'normal 20px sans-serif', 30, counted);
    expect(calls).toBeGreaterThan(measured);
  });

  it('returns nothing for an empty line', () => {
    expect(new GlyphShaper().shape('', FONT, 0, measure)).toEqual([]);
  });
});
