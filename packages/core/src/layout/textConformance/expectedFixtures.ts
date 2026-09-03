import type { ChromeParagraph, GessoRecording } from './toHtml.ts';

/**
 * Shape of `expected.json`: one entry per case, keyed by name, holding
 * what Chrome laid out and what its canvas measured, with the
 * fingerprint of the case definition both came from.
 */
export interface ExpectedTextCase {
  fingerprint: string;
  chrome: ChromeParagraph;
  recording: GessoRecording;
}

export interface FixtureFont {
  face: string;
  file: string;
  bytes: number;
  sha256: string;
}

export interface ExpectedTextFixtures {
  generator: { chrome: string; generatedAt: string; fonts: Record<string, FixtureFont> };
  cases: Record<string, ExpectedTextCase>;
}
