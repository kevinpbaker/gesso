import type { Size, TextMeasureRequest, TextMeasurer } from 'gesso-core';

/**
 * How big a string would be, if it were drawn.
 *
 * Layout measures text constantly and an application could not ask —
 * the measurer is the runtime's, built for the layout engine, and
 * nothing handed it out. So anything that needs a width before there
 * is a node to read it from had no answer: a column autofitted to its
 * contents, a popover sized to the longest option, an axis label
 * decided before a chart is drawn, a truncation chosen rather than
 * discovered.
 *
 * The alternative every application reaches for is mounting the text
 * invisibly and reading its box back a frame later, which is a frame
 * of latency, a node in the tree and a race with the layout it is
 * trying to inform.
 *
 * **It is the runtime's own measurer**, not a second one. A width
 * from here is the width the layout engine would use, including the
 * cache it has already warmed and the invalidation it gets when a
 * declared face finishes loading — a service with its own measurer
 * would answer with the fallback font long after the real one had
 * arrived.
 */
export class TextService {
  private measurer: TextMeasurer | null = null;

  /**
   * Called by the runtime with the measurer it lays out through.
   *
   * Not for applications, on the terms `ShellService.applyColorScheme`
   * sets: the thread that draws is the only thing that knows how, and
   * a measurer an application could also install would be one the
   * next layout disagrees with.
   */
  setMeasurer(measurer: TextMeasurer | null): void {
    this.measurer = measurer;
  }

  /** Whether there is a measurer yet. False before the first frame. */
  get ready(): boolean {
    return this.measurer !== null;
  }

  /**
   * The size a string would take.
   *
   * Zero when there is no measurer, which is what a caller asking
   * before the runtime has drawn anything gets — and the honest
   * answer, since the font it would be measured in is not resolved
   * yet.
   */
  measure(request: TextMeasureRequest): Size {
    return this.measurer?.measure(request) ?? { width: 0, height: 0 };
  }

  /**
   * The width of one line, which is what sizing to content asks for.
   *
   * No `maxWidth`, so nothing wraps: the question is how wide the
   * text *wants* to be, and a wrapped answer would be the width it
   * was given rather than the width it needs.
   */
  widthOf(text: string, style: Omit<TextMeasureRequest, 'text' | 'maxWidth'>): number {
    return this.measure({ ...style, text, wrap: 'none' }).width;
  }
}
