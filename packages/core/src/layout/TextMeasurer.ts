import type { Size } from './LayoutTypes';
import { forgetHardLines, layoutParagraph, proportionalFontMetrics } from './ParagraphLayout';

export type TextWrap = 'word' | 'char' | 'none';
export type TextOverflow = 'clip' | 'ellipsis';

/**
 * The font a piece of text is measured in.
 *
 * Structural rather than imported so that layout keeps depending on
 * nothing above it; a `UiResolvedTextSpan` is one of these plus the
 * fields that only paint reads.
 */
export interface TextRunStyle {
  fontFamily?: string;
  fontWeight?: string | number;
  fontSize?: number;
  fontStyle?: string;
  fontStretch?: string;
  fontVariant?: string;
  fontKerning?: string;
  letterSpacing?: number;
}

/** A run of the paragraph with a font of its own, as offsets into the text. */
export interface TextRunSpan extends TextRunStyle {
  readonly start: number;
  readonly end: number;
  /**
   * The run is in the text but takes no room: every width that touches
   * it counts it as nothing, and a line's `runs` leave it out, so no
   * renderer has anything to draw for it.
   */
  readonly hidden?: boolean;
}

export interface TextMeasureRequest {
  text: string;
  fontSize: number;
  /** Available width. Wrapping and fit-content sizing happen against it. */
  maxWidth?: number;
  /**
   * `maxWidth` is the box's own width, fixed from outside (a width
   * set, or the box being painted): lines wrap against it, and a word
   * wider than it overflows on a line of its own. Otherwise the
   * paragraph is fit-content, and a word wider than `maxWidth` widens
   * it, every line wrapping against that wider box, as CSS lays out a
   * box sized by its content.
   */
  exactWidth?: boolean;
  /**
   * Font family for platforms that can shape text.
   *
   * Deterministic measurers may ignore every style field; they
   * are hints for platform-backed implementations only.
   */
  fontFamily?: string;
  fontWeight?: string | number;
  lineHeight?: number;
  letterSpacing?: number;
  fontStyle?: string;
  fontStretch?: string;
  fontVariant?: string;
  fontKerning?: string;
  /** Default 'word'. */
  wrap?: TextWrap;
  /** Keep at most this many lines. */
  maxLines?: number;
  /** What happens to a line that does not fit. Default 'clip'. */
  overflow?: TextOverflow;
  /**
   * Runs of `text` with a font of their own, in order and not
   * overlapping. Text outside every run is measured in the request's
   * own font.
   *
   * Only the fields that change a width are here. A run that differs
   * from its neighbours only in colour, background or underline is not
   * in this list at all, so it costs a paint and never a re-layout.
   */
  spans?: readonly TextRunSpan[];
}

/** One run of a line: where it sits in the line and which span it came from. */
export interface TextLineRun {
  /** Index into the request's `spans`, or -1 for text outside every run. */
  span: number;
  /** Offsets into the source text. */
  start: number;
  end: number;
  text: string;
  /** Distance from the line's left edge to this run's left edge. */
  x: number;
  width: number;
}

/** One laid-out line. `text` is what gets drawn and may end in an ellipsis. */
export interface TextLine {
  /** Offsets into the source text; hanging spaces and the ellipsis are outside them. */
  start: number;
  end: number;
  text: string;
  width: number;
  /**
   * The line cut at its runs, present only for a paragraph that has
   * spans. A hidden run is not among them.
   *
   * Measured once, here, where the line's own width is measured. That
   * is what keeps a spanned paragraph as cheap to paint as a plain
   * one: a renderer walks these and asks the platform for nothing.
   */
  runs?: readonly TextLineRun[];
}

export interface FontMetrics {
  /** Distance from the alphabetic baseline to the top of the glyph box. */
  ascent: number;
  /** Distance from the alphabetic baseline to the bottom of the glyph box. */
  descent: number;
}

/**
 * A measured paragraph: everything layout, alignment and painting need.
 *
 * `width` is fit-content, `height` is lines × lineHeight, and
 * `firstBaseline` is the distance from the paragraph top to the first
 * line's alphabetic baseline (half-leading plus ascent).
 */
export interface ParagraphLayout {
  lines: TextLine[];
  width: number;
  height: number;
  lineHeight: number;
  ascent: number;
  descent: number;
  firstBaseline: number;
  /** Widest unbreakable segment under the requested wrap mode. */
  minContentWidth: number;
  /** Width with no wrapping at all. */
  maxContentWidth: number;
}

/**
 * Abstraction between layout and text platforms.
 *
 * Layout never measures text itself; a platform layer
 * (Canvas2D, WebGPU, tests) supplies an implementation.
 */
export interface TextMeasurer {
  measure(request: TextMeasureRequest): Size;
  layout(request: TextMeasureRequest): ParagraphLayout;
  /**
   * The advance width of one run in the request's font. Caret and
   * selection geometry is built from prefix widths, so it has to come
   * from the same source as the line widths.
   */
  measureRunWidth(text: string, request: TextMeasureRequest): number;
  /**
   * Forgets every cached answer. Called when what a font string means
   * has changed under the measurer: a declared face finished loading,
   * so widths measured with its fallback are wrong now. Measurers with
   * nothing cached need not implement it.
   */
  invalidate?(): void;
  /**
   * Counts `invalidate` calls. A caller that keeps a paragraph past the
   * call that returned it (the layout engine keeps each node's last
   * one) may trust it only while this is unchanged. A measurer that
   * leaves it out is asked again every time.
   */
  readonly generation?: number;
}

/**
 * The primitive a platform has to provide: the advance width of one
 * run of text, and the font's vertical metrics. Everything above it
 * is shared (see ParagraphLayout.ts).
 */
export interface TextRunMeasurer {
  measureRunWidth(text: string, request: TextMeasureRequest): number;
  fontMetrics(request: TextMeasureRequest): FontMetrics;
}

/**
 * The widths of a paragraph whose runs have fonts of their own.
 *
 * Everything above it — line breaking, hanging blanks, the ellipsis,
 * caret and selection geometry — asks for the width of a stretch of
 * the text by its offsets rather than by its characters, and this
 * splits that stretch at the run boundaries and measures each piece in
 * its own font. That is the whole of what a span costs: the paragraph
 * algorithm is unchanged, and a paragraph with no spans never builds
 * one of these at all.
 */
export interface SpannedRuns {
  /** The runs, as the request gave them. */
  readonly spans: readonly TextRunSpan[];
  /** Index of the run covering `offset`, or -1 where no run does. */
  indexAt(offset: number): number;
  /** The request an offset is measured with: its run's, or the paragraph's. */
  requestAt(offset: number): TextMeasureRequest;
  /** Whether the character at `offset` is in a hidden run. */
  hiddenAt(offset: number): boolean;
  /** Width of `text.slice(start, end)`, measured run by run. */
  width(text: string, start: number, end: number): number;
  /**
   * Width of a string that is not in the text, in the font of the run
   * covering `offset`: the ellipsis, and the space a tab is counted
   * as.
   */
  widthOf(run: string, offset: number): number;
  /**
   * `text.slice(start, end)` cut at the run boundaries, each piece
   * placed from `x`. Hidden pieces take no room and are left out.
   */
  cut(text: string, start: number, end: number, x: number): TextLineRun[];
}

/**
 * Builds the run widths for a request, or undefined when it has no
 * runs.
 *
 * One request object per run, built once: the paragraph cache means a
 * paragraph is laid out once per distinct request, so this runs once
 * per paragraph rather than once per frame.
 */
export function spannedRunsFor(
  request: TextMeasureRequest,
  runs: Pick<TextRunMeasurer, 'measureRunWidth'>
): SpannedRuns | undefined {
  const spans = request.spans;
  if (spans === undefined || spans.length === 0) {
    return undefined;
  }
  const requests: TextMeasureRequest[] = spans.map(span => ({
    ...request,
    spans: undefined,
    fontFamily: span.fontFamily ?? request.fontFamily,
    fontWeight: span.fontWeight ?? request.fontWeight,
    fontSize: span.fontSize ?? request.fontSize,
    fontStyle: span.fontStyle ?? request.fontStyle,
    fontStretch: span.fontStretch ?? request.fontStretch,
    fontVariant: span.fontVariant ?? request.fontVariant,
    fontKerning: span.fontKerning ?? request.fontKerning,
    letterSpacing: span.letterSpacing ?? request.letterSpacing
  }));
  const base: TextMeasureRequest = { ...request, spans: undefined };

  const indexAt = (offset: number): number => {
    // Runs are in order and do not overlap, so a scan stops at the
    // first one that has not started yet. Paragraphs have runs in the
    // tens; a binary search would cost more than it saved.
    for (let i = 0; i < spans.length; i++) {
      if (offset < spans[i].start) {
        return -1;
      }
      if (offset < spans[i].end) {
        return i;
      }
    }
    return -1;
  };
  const requestAt = (offset: number): TextMeasureRequest => {
    const index = indexAt(offset);
    return index < 0 ? base : requests[index];
  };
  const measure = (text: string, from: number, to: number, index: number): number => {
    if (to <= from || (index >= 0 && spans[index].hidden === true)) {
      return 0;
    }
    return runs.measureRunWidth(text.slice(from, to), index < 0 ? base : requests[index]);
  };
  const each = (start: number, end: number, piece: (from: number, to: number, index: number) => void): void => {
    let from = start;
    while (from < end) {
      const index = indexAt(from);
      // The stretch runs to the end of this run, or up to where the
      // next one starts when this offset is in no run at all.
      let to = end;
      if (index >= 0) {
        to = Math.min(end, spans[index].end);
      } else {
        for (const span of spans) {
          if (span.start > from) {
            to = Math.min(end, span.start);
            break;
          }
        }
      }
      piece(from, to, index);
      from = to;
    }
  };

  return {
    spans,
    indexAt,
    requestAt,
    hiddenAt(offset) {
      const index = indexAt(offset);
      return index >= 0 && spans[index].hidden === true;
    },
    width(text, start, end) {
      let width = 0;
      each(start, end, (from, to, index) => {
        width += measure(text, from, to, index);
      });
      return width;
    },
    widthOf(run, offset) {
      return run.length === 0 ? 0 : runs.measureRunWidth(run, requestAt(offset));
    },
    cut(text, start, end, x) {
      const out: TextLineRun[] = [];
      let pen = x;
      each(start, end, (from, to, index) => {
        if (index >= 0 && spans[index].hidden === true) {
          return;
        }
        const width = measure(text, from, to, index);
        out.push({ span: index, start: from, end: to, text: text.slice(from, to), x: pen, width });
        pen += width;
      });
      return out;
    }
  };
}

/**
 * How much the paragraph cache holds before the least recently asked
 * for is forgotten: a number of paragraphs, and their text counted in
 * UTF-16 code units, whichever runs out first.
 *
 * A count alone treated a two-word label and a whole document as the
 * same size. Every keystroke in a long field is a new request, its key
 * the whole text, so 4,096 edits to a 115 KB field held 4,096 copies of
 * it, keys and lines: 1.1 GB of heap, for paragraphs nobody would ask
 * for again. The text budget keeps a handful of those; the count is
 * what bounds a screen of labels, and is larger than it was, since a
 * label costs a few hundred bytes and a list that remounts its rows
 * should find them still here.
 */
const PARAGRAPH_CACHE_ENTRIES = 16_384;
const PARAGRAPH_CACHE_TEXT = 1 << 20;

/**
 * The key length, in UTF-16 code units, from which a paragraph is
 * remembered apart from the rest; see `ParagraphCache`.
 */
const LARGE_PARAGRAPH = 1 << 14;

/**
 * The large map's budget, far below the labels': what it mostly holds
 * is the versions of a field being edited, and only the newest is asked
 * for again. A version costs much more than its text, since its lines
 * are kept with it: 300 edits of a 100 KB field held 33 MB in a map
 * with the labels' budget. Half a million code units still holds every
 * request for two documents of 250K drawn side by side, so neither
 * pushes the other out on each frame.
 */
const LARGE_PARAGRAPH_ENTRIES = 8;
const LARGE_PARAGRAPH_TEXT = 1 << 19;

/**
 * The paragraph cache: two least-recently-used maps, one for large
 * paragraphs (a key of `LARGE_PARAGRAPH` code units or more), with a
 * budget of its own (`LARGE_PARAGRAPH_ENTRIES`), and one for the rest,
 * with the whole budget of `PARAGRAPH_CACHE_ENTRIES`.
 *
 * A keystroke in a long field is a new request keyed by its whole
 * text, and both the layout engine and paint ask for it. In one map a
 * 100 KB field spent the text budget in about ten keystrokes, and
 * every label on screen was laid out again on the next frame. Apart,
 * the field's versions only push out each other's and those of other
 * long texts, which is what they did among themselves before, and the
 * labels are not touched. A paragraph's map is chosen by its key, so a
 * request finds it again without being told which it is.
 *
 * Editable text is not singled out instead: the layout engine's
 * request does not say whether it is for an editable, and paint (the
 * caret, the selection) asks for the field's paragraph again on every
 * frame it is drawn, so it does need remembering somewhere. A short
 * field still shares the map with labels, but one keystroke there
 * costs at most `LARGE_PARAGRAPH` of a million code units.
 */
class ParagraphCache {
  private readonly small = new ParagraphLru(PARAGRAPH_CACHE_ENTRIES, PARAGRAPH_CACHE_TEXT);
  private readonly large = new ParagraphLru(LARGE_PARAGRAPH_ENTRIES, LARGE_PARAGRAPH_TEXT);

  get size(): number {
    return this.small.size + this.large.size;
  }

  get(key: string): ParagraphLayout | undefined {
    return this.mapFor(key).get(key);
  }

  set(key: string, paragraph: ParagraphLayout, text: number): void {
    this.mapFor(key).set(key, paragraph, text);
  }

  clear(): void {
    this.small.clear();
    this.large.clear();
  }

  private mapFor(key: string): ParagraphLru {
    return key.length >= LARGE_PARAGRAPH ? this.large : this.small;
  }
}

/** A least-recently-used map of paragraphs, bounded by count and by text; see `PARAGRAPH_CACHE_ENTRIES`. */
class ParagraphLru {
  private readonly entries = new Map<string, { paragraph: ParagraphLayout; text: number; at: number }>();
  private text = 0;
  /** Counts insertions, so an entry knows how far back in the map's order it sits. */
  private tick = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxText: number
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): ParagraphLayout | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    // Re-inserted so the map's order is recency, which eviction reads —
    // but only once it has aged into the older half, where eviction could
    // reach it. Re-inserting on every hit was a delete and a set per text
    // leaf per measure: a scrollbar drag through a sheet asks this ~500
    // times a frame, and the touches alone cost 4.5 ms of a 21 ms frame,
    // though the same calls take a third of a microsecond each out of a
    // frame. An entry asked for while still in the newer half is at
    // least half the cap from the front, so it is not the next to go.
    if (this.tick - entry.at > this.entries.size / 2) {
      this.entries.delete(key);
      entry.at = ++this.tick;
      this.entries.set(key, entry);
    }
    return entry.paragraph;
  }

  set(key: string, paragraph: ParagraphLayout, text: number): void {
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.entries.delete(key);
      this.text -= previous.text;
    }
    // The newest entry is kept even when it alone is over the budget:
    // it is the one about to be asked for again (paint follows layout).
    while (this.entries.size > 0 && (this.entries.size >= this.maxEntries || this.text + text > this.maxText)) {
      const [oldest, entry] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.text -= entry.text;
    }
    this.entries.set(key, { paragraph, text, at: ++this.tick });
    this.text += text;
  }

  clear(): void {
    this.entries.clear();
    this.text = 0;
  }
}

/**
 * Base class for measurers: implement the two primitives and the
 * paragraph algorithm does the rest.
 *
 * **Every paragraph is laid out once per distinct request.** The same
 * request arrives several times a frame and on every frame after: the
 * layout engine asks when it measures the node, and both renderers ask
 * again when they paint it, because a `PaintState` and a box are all a
 * renderer holds. Without a cache a repaint is a line break, and a
 * transition that repaints the whole screen for half a second breaks
 * every paragraph on it sixty times a second. Measured on Sluice's
 * Bluesky feed opening a post: 30 to 50 ms a frame in `segmentParagraph`,
 * `measureRunWidth` and `applySpacing`, against under 13 ms on the same
 * click over short Wikipedia titles. The cache is keyed by every field
 * of the request, so a paragraph that changed in any way is laid out
 * again, and it is least-recently-used with a cap, so a feed that
 * mounts forty new rows a second does not grow it without bound.
 *
 * The result is shared between callers and must not be mutated.
 */
export abstract class ParagraphTextMeasurer implements TextMeasurer, TextRunMeasurer {
  private readonly paragraphs = new ParagraphCache();
  /**
   * Paragraphs that came out the same at every width they fit in, by
   * their key without the width; see `layoutFitsAnyWidth`.
   *
   * A resize asks every paragraph again at a width a few pixels from
   * the last, and a title, a caption or a label that fitted before
   * fits still: its lines, its box and everything else are what they
   * were. Keyed by its width as well, each of those missed on every
   * step of a dragged window edge and was laid out again, and the
   * box it was then painted in (its own width, exact) missed once
   * more.
   */
  private readonly fitting = new ParagraphCache();
  private generations = 0;

  abstract measureRunWidth(text: string, request: TextMeasureRequest): number;
  abstract fontMetrics(request: TextMeasureRequest): FontMetrics;

  layout(request: TextMeasureRequest): ParagraphLayout {
    const style = paragraphStyleKey(request);
    const key = `${request.maxWidth ?? ''}\0${request.exactWidth === true ? 1 : ''}\0${style}`;
    const cached = this.paragraphs.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const fitted = this.fitting.get(style);
    if (fitted !== undefined && fitsWidth(fitted, request.maxWidth)) {
      return fitted;
    }
    const paragraph = layoutParagraph(request, this);
    this.paragraphs.set(key, paragraph, request.text.length);
    if (layoutFitsAnyWidth(request, paragraph)) {
      this.fitting.set(style, paragraph, request.text.length);
    }
    return paragraph;
  }

  measure(request: TextMeasureRequest): Size {
    const paragraph = this.layout(request);
    return { width: paragraph.width, height: paragraph.height };
  }

  /** How many paragraphs are remembered right now; for specs. */
  get cachedParagraphs(): number {
    return this.paragraphs.size;
  }

  get generation(): number {
    return this.generations;
  }

  /**
   * Forgets every laid-out paragraph. A subclass that caches its own
   * primitives overrides this and calls it, so a font that finished
   * loading invalidates the lines as well as the widths they were
   * built from.
   */
  invalidate(): void {
    this.generations++;
    this.paragraphs.clear();
    this.fitting.clear();
    forgetHardLines(this);
  }
}

/**
 * Whether `paragraph`, laid out for `request`, is what a request
 * differing only in its width would get at any width it fits in.
 *
 * A paragraph's width enters its layout in four places, and none of
 * them can tell two widths apart once every hard line fits whole:
 * nothing breaks (a line that fits is not broken, `exactWidth` or
 * not); the box is fit-content, which is the natural width; no line is
 * wider than the box, so none is ellipsised in place; and the one
 * ellipsis that is fitted to the width — the last line kept by
 * `maxLines` — is excluded here, because it is only drawn when there
 * were more hard lines than that. An unbounded request is left out:
 * it is laid out unwrapped, which is a different path, and it has a
 * key of its own that never changes anyway.
 */
export function layoutFitsAnyWidth(request: TextMeasureRequest, paragraph: ParagraphLayout): boolean {
  if (!fitsWidth(paragraph, request.maxWidth)) {
    return false;
  }
  const maxLines = request.maxLines;
  return (
    request.overflow !== 'ellipsis' ||
    maxLines === undefined ||
    maxLines < 1 ||
    !hasMoreHardLines(request.text, maxLines)
  );
}

/** Whether a paragraph with nothing in it that depends on the width fits at `maxWidth`. */
export function fitsWidth(paragraph: ParagraphLayout, maxWidth: number | undefined): boolean {
  return maxWidth !== undefined && maxWidth >= 0 && paragraph.maxContentWidth <= maxWidth;
}

function hasMoreHardLines(text: string, count: number): boolean {
  let at = -1;
  for (let i = 0; i < count; i++) {
    at = text.indexOf('\n', at + 1);
    if (at < 0) {
      return false;
    }
  }
  return true;
}

/** Every field of a request but its width, in a fixed order; two requests that lay out alike at one width share a key. */
function paragraphStyleKey(request: TextMeasureRequest): string {
  return `${request.fontSize}\0${request.fontFamily ?? ''}\0${request.fontWeight ?? ''}\0${
    request.lineHeight ?? ''
  }\0${request.letterSpacing ?? ''}\0${request.wrap ?? ''}\0${request.maxLines ?? ''}\0${request.overflow ?? ''}\0${
    request.fontStyle ?? ''
  }\0${request.fontStretch ?? ''}\0${request.fontVariant ?? ''}\0${request.fontKerning ?? ''}\0${spansKey(
    request.spans
  )}\0${request.text}`;
}

/**
 * The runs' part of a paragraph key, remembered by the identity of the
 * array.
 *
 * Every field of every run would otherwise be spelt out on every
 * paint of every spanned paragraph on screen, which is the one way
 * spans could quietly undo the paragraph cache. A span array held still
 * by a bound cell is spelt out once and looked up thereafter.
 */
const spanKeys = new WeakMap<readonly TextRunSpan[], string>();

function spansKey(spans: readonly TextRunSpan[] | undefined): string {
  if (spans === undefined || spans.length === 0) {
    return '';
  }
  const cached = spanKeys.get(spans);
  if (cached !== undefined) {
    return cached;
  }
  let key = '';
  for (const span of spans) {
    key += `${span.start}:${span.end}:${span.fontFamily ?? ''}:${span.fontWeight ?? ''}:${span.fontSize ?? ''}:${
      span.fontStyle ?? ''
    }:${span.fontStretch ?? ''}:${span.fontVariant ?? ''}:${span.fontKerning ?? ''}:${span.letterSpacing ?? ''}:${span.hidden === true ? 'h' : ''};`;
  }
  spanKeys.set(spans, key);
  return key;
}

export interface FixedMetricsOptions {
  /** Advance of every glyph as a fraction of the font size. Default 0.6. */
  glyphWidth?: number;
  /** Ascent as a fraction of the font size. Default 0.8. */
  ascent?: number;
  /** Descent as a fraction of the font size. Default 0.2. */
  descent?: number;
}

/**
 * Deterministic measurer: every glyph is `glyphWidth` em wide, the
 * font is `ascent + descent` em tall, and the default line is 1.2em.
 *
 * Intended for tests and headless environments. With `glyphWidth: 1`
 * it reproduces the Ahem test font exactly, which is how the layout
 * conformance fixtures compare real wrapping text against Chrome.
 */
export class CharacterCountTextMeasurer extends ParagraphTextMeasurer {
  private readonly glyphWidth: number;
  private readonly ascentFactor: number;
  private readonly descentFactor: number;

  constructor(options: FixedMetricsOptions = {}) {
    super();
    this.glyphWidth = options.glyphWidth ?? 0.6;
    this.ascentFactor = options.ascent ?? 0.8;
    this.descentFactor = options.descent ?? 0.2;
  }

  measureRunWidth(text: string, request: TextMeasureRequest): number {
    let glyphs = 0;
    for (const _character of text) {
      glyphs++;
    }
    return glyphs * request.fontSize * this.glyphWidth;
  }

  fontMetrics(request: TextMeasureRequest): FontMetrics {
    return proportionalFontMetrics(request.fontSize, this.ascentFactor, this.descentFactor);
  }
}
