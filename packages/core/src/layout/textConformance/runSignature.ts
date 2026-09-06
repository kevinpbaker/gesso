import type { TextMeasureRequest, TextRunSpan } from '../TextMeasurer.ts';

/**
 * Which font a measurement was made in, as one string.
 *
 * A paragraph of runs measures the same characters in more than one
 * font, so a recording keyed by text alone would answer the second run
 * with the first run's widths. This is the key that keeps them apart,
 * and the page that records and the spec that replays both build it
 * the same way, which is the whole of why a replay reproduces what the
 * page did.
 *
 * It is the request's own signature for a case with no runs, which is
 * why those recordings are shaped exactly as they always were.
 */
export function runSignature(request: TextMeasureRequest): string {
  return [
    request.fontFamily ?? '',
    request.fontWeight ?? '',
    request.fontSize,
    request.fontStyle ?? '',
    request.fontStretch ?? '',
    request.fontVariant ?? '',
    request.fontKerning ?? '',
    request.letterSpacing ?? ''
  ].join('|');
}

/** The signature of one run of a request: the run's fields over the paragraph's. */
export function spanSignature(request: TextMeasureRequest, span: TextRunSpan): string {
  return runSignature({
    ...request,
    fontFamily: span.fontFamily ?? request.fontFamily,
    fontWeight: span.fontWeight ?? request.fontWeight,
    fontSize: span.fontSize ?? request.fontSize,
    fontStyle: span.fontStyle ?? request.fontStyle,
    fontStretch: span.fontStretch ?? request.fontStretch,
    fontVariant: span.fontVariant ?? request.fontVariant,
    fontKerning: span.fontKerning ?? request.fontKerning,
    letterSpacing: span.letterSpacing ?? request.letterSpacing
  });
}
