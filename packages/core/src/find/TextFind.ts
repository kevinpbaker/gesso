import type { UiNode } from '../graph/UiNode';

/** One occurrence of the query: a range of one node's text. */
export interface FindMatch {
  readonly node: UiNode;
  readonly start: number;
  readonly end: number;
}

export interface FindOptions {
  /** Distinguish upper and lower case. Off by default, as a find bar is. */
  matchCase?: boolean;
}

/**
 * Where a query occurs in a run of text nodes.
 *
 * Matches are found within one node's text, never across two. A page of
 * HTML matches across inline elements — `hello <b>world</b>` finds
 * "hello world" — but a `Text` node is a paragraph, not a span, so
 * there is no inline seam to cross and every match is a range of one
 * node.
 *
 * Occurrences do not overlap: the scan resumes after each match, so
 * "aa" in "aaa" is one match, as it is in a browser's find bar.
 */
export function findMatchesIn(
  nodes: readonly UiNode[],
  textOf: (node: UiNode) => string | undefined,
  query: string,
  options: FindOptions = {}
): FindMatch[] {
  const matches: FindMatch[] = [];
  if (query.length === 0) {
    return matches;
  }
  for (const node of nodes) {
    const text = textOf(node);
    if (text === undefined || text.length < query.length) {
      continue;
    }
    appendMatches(node, text, query, options.matchCase === true, matches);
  }
  return matches;
}

function appendMatches(node: UiNode, text: string, query: string, matchCase: boolean, out: FindMatch[]): void {
  let haystack = text;
  let needle = query;
  if (!matchCase) {
    const lowered = text.toLowerCase();
    const loweredQuery = query.toLowerCase();
    // Case folding is not always length-preserving ('İ' lowercases to
    // two code units), and a shifted offset would highlight the wrong
    // characters. Those rare strings are matched with case instead of
    // silently misplacing the highlight.
    if (lowered.length === text.length && loweredQuery.length === query.length) {
      haystack = lowered;
      needle = loweredQuery;
    }
  }
  for (let from = 0; from <= haystack.length - needle.length;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) {
      return;
    }
    out.push({ node, start: at, end: at + needle.length });
    from = at + needle.length;
  }
}
