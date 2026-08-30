import { graphemeBoundaries } from '../../editing/TextBoundaries';

/**
 * Where each grapheme cluster of a line starts, and how wide it is.
 *
 * Positions come from **prefix widths** — the x of cluster `i` is the
 * measured width of the line's first `i` clusters — which is the same
 * rule caret and selection geometry use (`TextGeometry.ts`), from the
 * same measurer that produced the line. Two things follow from that
 * and neither is available from summing per-glyph advances: kerning is
 * honoured, because each prefix is measured in context; and the last
 * cluster's end is exactly the line width layout was sized with, so a
 * centred or right-aligned line ends where the box says it does.
 *
 * What it does not do is shape. Clusters are split by grapheme
 * boundary and drawn one at a time, so a font's ligatures do not form:
 * `fi` draws as an f and an i at the positions the ligature would have
 * occupied rather than as one glyph. Combining marks survive, because
 * a base and its marks are one cluster and rasterise together. This is
 * the cost of rasterising with a canvas instead of a shaping engine,
 * and it is the same trade the editing caret already makes.
 */
export interface ShapedCluster {
  text: string;
  /** Offset from the line's left edge, logical pixels. */
  x: number;
  /** Advance width, logical pixels. */
  advance: number;
  /** Whitespace only: it advances the pen and draws nothing. */
  blank: boolean;
}

/** The advance width of a run of text in the line's font. */
export type MeasureRun = (text: string) => number;

/**
 * Entries kept before the cache is cleared wholesale.
 *
 * The same crude cap `CanvasTextMeasurer` uses, for the same reason:
 * an LRU costs more than it saves until profiling says otherwise. One
 * entry is a line's clusters, so a screen of a document is a few
 * hundred entries and a scrolled list re-uses every one of them.
 */
const MAX_CACHE_ENTRIES = 4096;

/**
 * Splits lines into positioned clusters, once per distinct line.
 *
 * Prefix measurement costs one `measureText` per cluster, so a line is
 * measured n times the first time it is seen and never again. The
 * cache is keyed by font and text — not by position, size or colour —
 * so scrolling, moving or recolouring a line costs nothing.
 */
export class GlyphShaper {
  private readonly cache = new Map<string, ShapedCluster[]>();

  get size(): number {
    return this.cache.size;
  }

  /**
   * The clusters of one line. `width` is the line's measured width,
   * used as the last cluster's end so the run closes exactly where
   * layout put it.
   */
  shape(text: string, font: string, width: number, measure: MeasureRun): readonly ShapedCluster[] {
    if (text.length === 0) {
      return [];
    }
    const key = `${font}\0${text}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const boundaries = graphemeBoundaries(text);
    const clusters: ShapedCluster[] = [];
    let previous = 0;
    for (let i = 1; i < boundaries.length; i++) {
      const end = boundaries[i];
      // The final prefix is the whole line, whose width layout already
      // measured; taking it from the argument keeps the run's end and
      // the line box in exact agreement.
      const advanceEnd = i === boundaries.length - 1 ? width : measure(text.slice(0, end));
      const cluster = text.slice(boundaries[i - 1], end);
      clusters.push({
        text: cluster,
        x: previous,
        advance: Math.max(0, advanceEnd - previous),
        blank: isBlank(cluster)
      });
      previous = advanceEnd;
    }

    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      this.cache.clear();
    }
    this.cache.set(key, clusters);
    return clusters;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Whether a cluster is whitespace. Decided once, when the line is
 * shaped, because the frame loop asks it of every cluster it draws and
 * `trim()` would allocate a string per glyph per frame.
 */
function isBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const space = code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11;
    if (!space && !(code >= 0x2000 && code <= 0x200a) && code !== 0x00a0 && code !== 0x3000) {
      return false;
    }
  }
  return true;
}
