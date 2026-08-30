import type { MeasuredBox } from './toHtml.ts';

/**
 * Shape of `expected.json`: one entry per case, keyed by name, with
 * the fingerprint of the case definition it was generated from.
 */
export interface ExpectedCase {
  fingerprint: string;
  boxes: MeasuredBox[];
}

export interface ExpectedFixtures {
  generator: { chrome: string; generatedAt: string };
  cases: Record<string, ExpectedCase>;
}
