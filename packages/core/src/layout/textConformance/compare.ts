import { layoutParagraph } from '../ParagraphLayout.ts';
import { placeLines } from '../../rendering/TextRenderer.ts';
import type { TextCase } from './cases.ts';
import { RecordedTextMeasurer } from './RecordedTextMeasurer.ts';
import type { ChromeParagraph, GessoRecording } from './toHtml.ts';
import { requestFor } from './toHtml.ts';

/**
 * The Gesso side of a text case, and its comparison with Chrome's.
 * Shared by the spec and the generator so both report the same thing.
 */

/**
 * Chrome snaps glyph positions to 1/64 px; the canvas answers in
 * floats. Anything under a tenth of a pixel is agreement.
 */
export const TEXT_TOLERANCE = 0.1;

export interface GessoLine {
  start: number;
  end: number;
  x: number;
  width: number;
}

export interface GessoParagraph {
  width: number;
  height: number;
  baseline: number;
  lines: GessoLine[];
}

/** Lays the case out with `layoutParagraph` over the recorded widths, and places its lines. */
export function layoutWithGesso(textCase: TextCase, recording: GessoRecording): GessoParagraph {
  const request = requestFor(textCase);
  const paragraph = layoutParagraph(request, new RecordedTextMeasurer(recording, textCase.name));
  // A fixed box is the tight constraint the layout engine would hand a
  // text node: the node is exactly that wide, whatever the paragraph
  // measured, and its lines are aligned within it.
  const width = textCase.box === 'fixed' && textCase.maxWidth !== undefined ? textCase.maxWidth : paragraph.width;
  const placed = placeLines(
    { x: 0, y: 0, width, height: paragraph.height },
    { textAlign: textCase.align ?? 'left', verticalAlign: 'top' },
    paragraph
  );
  // Chrome reports a line's ink, from its first glyph; a Gesso line that
  // keeps its leading blanks starts before them. Measure the ink the
  // same way, with each blank at the width the algorithm gives it.
  return {
    width,
    height: paragraph.height,
    baseline: paragraph.firstBaseline,
    lines: placed.map(line => {
      const leading = leadingBlankWidth(textCase.text.slice(line.start, line.end), recording.widths);
      return { start: line.start, end: line.end, x: line.x + leading, width: line.width - leading };
    })
  };
}

function leadingBlankWidth(text: string, widths: Record<string, number>): number {
  let width = 0;
  for (const character of text) {
    if (character === ' ' || character === '\t') {
      width += widths[' '] ?? 0;
    } else if (character === '\u3000') {
      width += widths['\u3000'] ?? 0;
    } else {
      break;
    }
  }
  return width;
}

/** Every way the two paragraphs differ, one line each; empty when they agree. */
export function compareParagraphs(
  gesso: GessoParagraph,
  chrome: ChromeParagraph,
  tolerance: number = TEXT_TOLERANCE
): string[] {
  const differences: string[] = [];
  for (const key of ['width', 'height', 'baseline'] as const) {
    if (Math.abs(gesso[key] - chrome[key]) > tolerance) {
      differences.push(`  ${key}: gesso ${n(gesso[key])} vs chrome ${n(chrome[key])}`);
    }
  }
  if (gesso.lines.length !== chrome.lines.length) {
    differences.push(`  line count: gesso ${gesso.lines.length} vs chrome ${chrome.lines.length}`);
  }
  const count = Math.min(gesso.lines.length, chrome.lines.length);
  for (let i = 0; i < count; i++) {
    const actual = gesso.lines[i];
    const expected = chrome.lines[i];
    const differing: string[] = [];
    if (actual.start !== expected.start) {
      differing.push('start');
    }
    if (expected.truncated !== true) {
      if (actual.end !== expected.end) {
        differing.push('end');
      }
      if (Math.abs(actual.x - expected.x) > tolerance) {
        differing.push('x');
      }
      if (Math.abs(actual.width - expected.width) > tolerance) {
        differing.push('width');
      }
    }
    if (differing.length > 0) {
      differences.push(
        `  line ${i}: gesso ${formatLine(actual)} vs chrome ${formatLine(expected)}  (${differing.join(', ')})`
      );
    }
  }
  return differences;
}

function formatLine(line: { start: number; end: number; x: number; width: number; truncated?: boolean }): string {
  return `[${line.start}..${line.end}) x ${n(line.x)} w ${n(line.width)}${line.truncated === true ? ' truncated' : ''}`;
}

function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
