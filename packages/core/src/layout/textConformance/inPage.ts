import type { FontMetrics, TextMeasureRequest, TextRunMeasurer } from '../TextMeasurer.ts';
import { runSignature, spanSignature } from './runSignature.ts';
import { layoutParagraph } from '../ParagraphLayout.ts';
import { CanvasTextMeasurer } from '../../rendering/canvas2d/CanvasTextMeasurer.ts';
import type { Canvas2DContext } from '../../rendering/canvas2d/Canvas2DContext.ts';
import type { CaseResult, GessoRecording } from './toHtml.ts';

/**
 * The Gesso side of the text conformance page.
 *
 * The generator bundles this file into an IIFE and inlines it, so the
 * page can run the repository's `layoutParagraph` against the real
 * `CanvasTextMeasurer`, in the same Chrome and the same font the DOM
 * twin was rendered with. Every run width the algorithm asks for is
 * recorded, along with the font's metrics, and written into the
 * fixture; the spec replays them through `RecordedTextMeasurer` so it
 * needs neither a canvas nor the font.
 *
 * The recording is seeded with every grapheme cluster, every word and
 * every blank of the text as well, so a change to where the algorithm
 * breaks can usually be tried against the existing fixture before it
 * is regenerated.
 */

/**
 * A `TextRunMeasurer` that remembers every answer it gives, keyed by
 * the font it gave it in.
 *
 * A paragraph of runs measures the same characters in more than one
 * font, so the recording is a map per font signature; a paragraph in
 * one font has one signature and its recording is shaped exactly as it
 * was before runs existed.
 */
export class RecordingRunMeasurer implements TextRunMeasurer {
  private readonly byFont = new Map<string, { widths: Record<string, number>; metrics?: FontMetrics }>();

  constructor(
    private readonly inner: TextRunMeasurer,
    private readonly base: string
  ) {}

  measureRunWidth(text: string, request: TextMeasureRequest): number {
    const entry = this.entryFor(runSignature(request));
    const cached = entry.widths[text];
    if (cached !== undefined) {
      return cached;
    }
    const width = this.inner.measureRunWidth(text, request);
    entry.widths[text] = width;
    return width;
  }

  fontMetrics(request: TextMeasureRequest): FontMetrics {
    const entry = this.entryFor(runSignature(request));
    entry.metrics ??= this.inner.fontMetrics(request);
    return entry.metrics;
  }

  recording(request: TextMeasureRequest): GessoRecording {
    const base = this.entryFor(this.base);
    const metrics = base.metrics ?? this.inner.fontMetrics(request);
    const recording: GessoRecording = { widths: base.widths, ascent: metrics.ascent, descent: metrics.descent };
    const runs: Record<string, { widths: Record<string, number>; ascent: number; descent: number }> = {};
    let any = false;
    for (const [signature, entry] of this.byFont) {
      if (signature === this.base) {
        continue;
      }
      any = true;
      const runMetrics = entry.metrics ?? { ascent: metrics.ascent, descent: metrics.descent };
      runs[signature] = { widths: entry.widths, ascent: runMetrics.ascent, descent: runMetrics.descent };
    }
    if (any) {
      recording.runs = runs;
    }
    return recording;
  }

  private entryFor(signature: string): { widths: Record<string, number>; metrics?: FontMetrics } {
    let entry = this.byFont.get(signature);
    if (entry === undefined) {
      entry = { widths: {} };
      this.byFont.set(signature, entry);
    }
    return entry;
  }
}

/** Grapheme clusters, words and blanks: what a breaker is likely to ask for next. */
export function seedSegments(text: string): string[] {
  const segments = new Set<string>();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const segment of segmenter.segment(text)) {
    segments.add(segment.segment);
  }
  for (const word of text.split(/[ \t\n\u3000]+/)) {
    if (word.length > 0) {
      segments.add(word);
    }
  }
  segments.add(' ');
  segments.add('\u3000');
  return [...segments];
}

export function run(request: TextMeasureRequest, canvas: HTMLCanvasElement): Pick<CaseResult, 'recording' | 'gesso'> {
  const context = canvas.getContext('2d') as unknown as Canvas2DContext | null;
  if (context === null) {
    throw new Error('The conformance page could not get a 2D context.');
  }
  const measurer = new RecordingRunMeasurer(new CanvasTextMeasurer(context), runSignature(request));
  const paragraph = layoutParagraph(request, measurer);
  // Seeded in the paragraph's own font, and again in each run's, so a
  // change to where the algorithm breaks can usually be tried against
  // the committed fixture before it is regenerated.
  const seeds = seedSegments(request.text);
  for (const segment of seeds) {
    measurer.measureRunWidth(segment, request);
  }
  for (const span of request.spans ?? []) {
    const runRequest = {
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
    };
    measurer.fontMetrics(runRequest);
    for (const segment of seedSegments(request.text.slice(span.start, span.end))) {
      measurer.measureRunWidth(segment, runRequest);
    }
    if (spanSignature(request, span) !== runSignature(runRequest)) {
      throw new Error('The run signature the page recorded is not the one the spec will replay.');
    }
  }
  return {
    recording: measurer.recording(request),
    gesso: {
      lines: paragraph.lines.map(line => ({ start: line.start, end: line.end, width: line.width })),
      width: paragraph.width,
      height: paragraph.height,
      firstBaseline: paragraph.firstBaseline
    }
  };
}
