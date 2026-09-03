import { describe, expect, it } from 'vitest';

import { textCaseFingerprint, textCases } from './cases';
import { compareParagraphs, layoutWithGesso } from './compare';
import type { ExpectedTextFixtures } from './expectedFixtures';
import { REGENERATE_TEXT_FIXTURES } from './RecordedTextMeasurer';
// Vite's ?raw import keeps this spec free of node:fs and its types.
import expectedJson from './expected.json?raw';

/**
 * `layoutParagraph` against Chrome, in a real font.
 *
 * Each case was rendered by headless Chrome twice: as a DOM paragraph,
 * whose lines were read back, and through Gesso's own algorithm over
 * Chrome's canvas, whose run widths were recorded. This spec replays
 * the recording, so the lines it produces are what the render worker
 * would produce, and asserts them against the DOM's. No canvas and no
 * font are needed here.
 */
const fixtures = JSON.parse(expectedJson) as ExpectedTextFixtures;

describe('ParagraphLayout conformance with Chrome', () => {
  it('has an expectation for every case, and no stale ones', () => {
    const defined = textCases.map(textCase => textCase.name).sort();
    const recorded = Object.keys(fixtures.cases).sort();
    expect(recorded, REGENERATE_TEXT_FIXTURES).toEqual(defined);
  });

  it('was generated from the current case definitions', () => {
    const stale = textCases
      .filter(textCase => fixtures.cases[textCase.name]?.fingerprint !== textCaseFingerprint(textCase))
      .map(textCase => textCase.name);
    expect(stale, REGENERATE_TEXT_FIXTURES).toEqual([]);
  });

  for (const textCase of textCases) {
    const expected = fixtures.cases[textCase.name];
    if (expected === undefined) {
      // The first test reports this; skip rather than fail twice.
      continue;
    }
    const run = () => {
      const differences = compareParagraphs(
        layoutWithGesso(textCase, expected.recording),
        expected.chrome,
        textCase.tolerance
      );
      if (differences.length > 0) {
        throw new Error(`${textCase.name}: differs from Chrome\n${differences.join('\n')}`);
      }
    };
    if (textCase.divergence !== undefined) {
      // A known disagreement. `it.fails` passes while the algorithm
      // still disagrees and fails the moment it agrees, so the note
      // cannot outlive the difference it describes.
      it.fails(`${textCase.name}: known divergence: ${textCase.divergence}`, run);
    } else {
      it(textCase.name, run);
    }
  }
});
