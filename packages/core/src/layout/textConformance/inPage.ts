import type { FontMetrics, TextMeasureRequest, TextRunMeasurer } from '../TextMeasurer.ts';
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

/** A `TextRunMeasurer` that remembers every answer it gives. */
export class RecordingRunMeasurer implements TextRunMeasurer {
  readonly widths: Record<string, number> = {};
  private metrics: FontMetrics | undefined;

  constructor(private readonly inner: TextRunMeasurer) {}

  measureRunWidth(text: string, request: TextMeasureRequest): number {
    const cached = this.widths[text];
    if (cached !== undefined) {
      return cached;
    }
    const width = this.inner.measureRunWidth(text, request);
    this.widths[text] = width;
    return width;
  }

  fontMetrics(request: TextMeasureRequest): FontMetrics {
    this.metrics ??= this.inner.fontMetrics(request);
    return this.metrics;
  }

  recording(request: TextMeasureRequest): GessoRecording {
    const metrics = this.fontMetrics(request);
    return { widths: this.widths, ascent: metrics.ascent, descent: metrics.descent };
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
  const measurer = new RecordingRunMeasurer(new CanvasTextMeasurer(context));
  const paragraph = layoutParagraph(request, measurer);
  for (const segment of seedSegments(request.text)) {
    measurer.measureRunWidth(segment, request);
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
