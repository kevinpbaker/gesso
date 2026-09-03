import { describe, expect, it } from 'vitest';

import { textCases } from '../../layout/textConformance/cases';
import { layoutWithGesso } from '../../layout/textConformance/compare';
import type { ExpectedTextFixtures } from '../../layout/textConformance/expectedFixtures';
import expectedJson from '../../layout/textConformance/expected.json?raw';
import { GlyphShaper } from './WebGPUGlyphShaper';

/**
 * The WebGPU shaper's word order against Chrome.
 *
 * For every right-to-left text fixture, Chrome recorded where each
 * grapheme cluster sits on its line. The shaper is given each line as
 * layout produced it, with the recorded run widths as its measure, and
 * every word cell it places has to start where Chrome put that word's
 * first cluster. That is the whole of what the WebGPU renderer needs to
 * draw Arabic and Hebrew where Canvas2D draws them.
 */
const fixtures = JSON.parse(expectedJson) as ExpectedTextFixtures;

/** Kerning does not cross a blank and Chrome snaps to 1/64 px, so a word's start agrees closely. */
const TOLERANCE = 0.5;

describe('GlyphShaper visual order against Chrome', () => {
  const cases = textCases.filter(textCase => fixtures.cases[textCase.name]?.chrome.lines.some(line => line.clusters));
  it('has right-to-left fixtures with recorded clusters', () => {
    expect(cases.length).toBeGreaterThan(5);
  });

  for (const textCase of cases) {
    const expected = fixtures.cases[textCase.name];
    it(textCase.name, () => {
      const rtl = textCase.direction === 'rtl';
      const gesso = layoutWithGesso(textCase, expected.recording);
      const shaper = new GlyphShaper();
      const measure = (run: string): number => {
        const width = expected.recording.widths[run];
        if (width === undefined) {
          throw new Error(`${textCase.name}: no recorded width for ${JSON.stringify(run)}`);
        }
        return width;
      };
      const mismatches: string[] = [];
      gesso.lines.forEach((line, index) => {
        const chromeLine = expected.chrome.lines[index];
        if (chromeLine?.clusters === undefined) {
          return;
        }
        const lineText = textCase.text.slice(line.start, line.end);
        // `line.x` here is the ink start; the line box starts at the
        // paragraph's edge, which for these cases is 0 for a left-aligned
        // and (width - lineWidth) for a right-aligned line.
        const boxX = line.x - leadingBlankWidth(lineText, expected.recording.widths);
        for (const cluster of shaper.shape(lineText, 'font', line.width, measure, rtl)) {
          if (cluster.blank) {
            continue;
          }
          const start = line.start + lineText.indexOf(cluster.text);
          const end = start + cluster.text.length;
          const chromeClusters = chromeLine.clusters.filter(c => c.start >= start && c.start < end);
          if (chromeClusters.length === 0) {
            mismatches.push(`  ${JSON.stringify(cluster.text)}: Chrome recorded no cluster for it`);
            continue;
          }
          const chromeX = Math.min(...chromeClusters.map(c => c.x));
          const gessoX = boxX + cluster.x;
          if (Math.abs(gessoX - chromeX) > TOLERANCE) {
            mismatches.push(
              `  ${JSON.stringify(cluster.text)}: gesso x ${gessoX.toFixed(2)} vs chrome ${chromeX.toFixed(2)}`
            );
          }
        }
      });
      if (mismatches.length > 0) {
        throw new Error(`${textCase.name}: word cells off Chrome's positions\n${mismatches.join('\n')}`);
      }
    });
  }
});

function leadingBlankWidth(text: string, widths: Record<string, number>): number {
  let width = 0;
  for (const character of text) {
    if (character === ' ' || character === '\t') {
      width += widths[' '] ?? 0;
    } else {
      break;
    }
  }
  return width;
}
