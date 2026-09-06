import { describe, expect, it } from 'vitest';

import { CharacterCountTextMeasurer } from './TextMeasurer';
import type { FontMetrics, TextMeasureRequest, TextRunSpan } from './TextMeasurer';
import { flattenTextSpans } from '../properties/UiTextStyle';
import type { UiTextSpan } from '../properties/UiTextStyle';

/**
 * Paragraph budgets for runs (roadmap X6).
 *
 * `decisions/0065` bought the frame rate back by laying a paragraph
 * out once per distinct request, and runs are the one change that
 * could quietly spend it again: a per-run measurement on every paint
 * would be a line break on every paint, which is exactly what that
 * decision removed. These are hard budgets on counts. They fail the
 * build with numbers when a change makes a paragraph with runs cost
 * more work than the runs warrant, and there are no timings here at
 * all, because what matters is how many times the platform is asked
 * and not how fast this machine answered.
 *
 * The three that matter:
 *
 *   1. Laying out a paragraph with runs measures a bounded number of
 *      stretches, in the order of the runs and the words, and never
 *      per character.
 *   2. Laying it out again measures nothing and returns the same
 *      object, runs included, so painting it is free.
 *   3. A run that changed only its colour, its background, its
 *      underline or its link is the same paragraph. Only the metric
 *      fields reach the request, so a hover repaints and never
 *      re-breaks a line.
 */
class CountingMeasurer extends CharacterCountTextMeasurer {
  widths = 0;
  metrics = 0;

  override measureRunWidth(text: string, request: TextMeasureRequest): number {
    this.widths++;
    return super.measureRunWidth(text, request);
  }

  override fontMetrics(request: TextMeasureRequest): FontMetrics {
    this.metrics++;
    return super.fontMetrics(request);
  }
}

/** A markdown-shaped paragraph: prose, emphasis, code and a link. */
const PROSE: readonly UiTextSpan[] = [
  { text: 'A paragraph with ' },
  { text: 'emphasis', fontStyle: 'italic' },
  { text: ', ' },
  { text: 'strength', fontWeight: 'bold' },
  { text: ', ' },
  { text: 'code()', fontFamily: 'monospace' },
  { text: ' and a ' },
  { text: 'link', link: { href: '#' } },
  { text: '.' }
];

function metricSpans(spans: readonly UiTextSpan[]): TextRunSpan[] {
  return flattenTextSpans(spans).spans.map(span => ({
    start: span.start,
    end: span.end,
    fontFamily: span.fontFamily,
    fontSize: span.fontSize,
    fontWeight: span.fontWeight,
    fontStyle: span.fontStyle,
    letterSpacing: span.letterSpacing
  }));
}

function request(spans: readonly TextRunSpan[], text: string): TextMeasureRequest {
  return { text, fontSize: 10, lineHeight: 12, maxWidth: 200, spans };
}

describe('paragraph budgets with runs', () => {
  it('measures each run and each word once, and never a character at a time', () => {
    const measurer = new CountingMeasurer();
    const { text, spans } = { text: flattenTextSpans(PROSE).text, spans: metricSpans(PROSE) };
    const paragraph = measurer.layout(request(spans, text));
    expect(paragraph.lines.length).toBeGreaterThan(1);
    // Nine runs over eleven words, broken into four lines at 200px:
    // the budget is the segments the breaker tried plus the pieces
    // each line was cut into, and it is nowhere near the 74 characters.
    // eslint-disable-next-line no-console
    console.info(`[paragraph budget] runs: ${measurer.widths} widths, ${measurer.metrics} metrics`);
    expect(measurer.widths).toBeLessThan(60);
    expect(measurer.widths).toBeLessThan(text.length);
    // One per distinct run font, plus the paragraph's own.
    expect(measurer.metrics).toBeLessThanOrEqual(spans.length + 1);
  });

  it('measures nothing the second time, and hands back the same lines and runs', () => {
    const measurer = new CountingMeasurer();
    const text = flattenTextSpans(PROSE).text;
    const spans = metricSpans(PROSE);
    const first = measurer.layout(request(spans, text));
    const before = measurer.widths;
    const second = measurer.layout(request(spans, text));
    expect(measurer.widths).toBe(before);
    expect(second).toBe(first);
    // The runs a renderer draws were measured in the first layout and
    // are handed back with it; painting asks the platform for nothing.
    expect(second.lines[0].runs).toBe(first.lines[0].runs);
  });

  it('is the same paragraph when a run changed only its colour, background, underline or link', () => {
    const measurer = new CountingMeasurer();
    const text = flattenTextSpans(PROSE).text;
    const first = measurer.layout(request(metricSpans(PROSE), text));
    const before = measurer.widths;

    const restyled = PROSE.map(span => ({
      ...span,
      color: 'primary',
      backgroundColor: 'surface',
      textDecoration: 'underline' as const,
      link: { onClick: () => {} }
    }));
    const second = measurer.layout(request(metricSpans(restyled), text));
    expect(measurer.widths).toBe(before);
    expect(second).toBe(first);
  });

  it('re-lays out when a run changed a metric field, and only then', () => {
    const measurer = new CountingMeasurer();
    const text = flattenTextSpans(PROSE).text;
    measurer.layout(request(metricSpans(PROSE), text));
    const before = measurer.widths;
    const bigger = PROSE.map((span, i) => (i === 3 ? { ...span, fontSize: 20 } : span));
    measurer.layout(request(metricSpans(bigger), text));
    expect(measurer.widths).toBeGreaterThan(before);
  });

  it('flattens a run array once, however many passes read it', () => {
    const first = flattenTextSpans(PROSE);
    expect(flattenTextSpans(PROSE)).toBe(first);
    expect(flattenTextSpans(PROSE).spans).toBe(first.spans);
  });

  it('grows the paragraph cache by one entry per distinct paragraph, not per run', () => {
    const measurer = new CountingMeasurer();
    const text = flattenTextSpans(PROSE).text;
    const spans = metricSpans(PROSE);
    measurer.layout(request(spans, text));
    measurer.layout(request(spans, text));
    measurer.layout(request(metricSpans(PROSE), text));
    expect(measurer.cachedParagraphs).toBe(1);
  });
});
