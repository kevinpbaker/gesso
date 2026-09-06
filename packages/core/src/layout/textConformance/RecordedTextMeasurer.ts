import type { FontMetrics, TextMeasureRequest } from '../TextMeasurer.ts';
import { ParagraphTextMeasurer } from '../TextMeasurer.ts';
import type { GessoRecording } from './toHtml.ts';
import { runSignature } from './runSignature.ts';

export const REGENERATE_TEXT_FIXTURES =
  'Run `pnpm fixtures:text` to regenerate packages/core/src/layout/textConformance/expected.json.';

/**
 * Replays the run widths and font metrics Chrome's canvas produced when
 * the fixtures were generated, so the paragraph algorithm can be run
 * against Chrome's lines in a test with no canvas and no font.
 *
 * A width the recording does not hold is a hard error rather than a
 * guess: it means the algorithm now asks for a segment it did not ask
 * for when the fixture was made, which is exactly the kind of change
 * the fixtures exist to check, and the answer is to regenerate them.
 */
export class RecordedTextMeasurer extends ParagraphTextMeasurer {
  private readonly base: string;

  constructor(
    private readonly recording: GessoRecording,
    private readonly caseName: string,
    baseRequest?: TextMeasureRequest
  ) {
    super();
    this.base = baseRequest === undefined ? '' : runSignature(baseRequest);
  }

  measureRunWidth(text: string, request: TextMeasureRequest): number {
    const width = this.recordingFor(request).widths[text];
    if (width === undefined) {
      throw new Error(
        `${this.caseName}: the fixture holds no width for ${JSON.stringify(text)}. ${REGENERATE_TEXT_FIXTURES}`
      );
    }
    return width;
  }

  fontMetrics(request: TextMeasureRequest): FontMetrics {
    const recording = this.recordingFor(request);
    return { ascent: recording.ascent, descent: recording.descent };
  }

  /** The paragraph's own recording, or the run's where its font differs. */
  private recordingFor(request: TextMeasureRequest): { widths: Record<string, number>; ascent: number; descent: number } {
    const runs = this.recording.runs;
    if (runs === undefined) {
      return this.recording;
    }
    const signature = runSignature(request);
    if (signature === this.base) {
      return this.recording;
    }
    const run = runs[signature];
    if (run === undefined) {
      throw new Error(`${this.caseName}: the fixture holds no run for ${signature}. ${REGENERATE_TEXT_FIXTURES}`);
    }
    return run;
  }
}
