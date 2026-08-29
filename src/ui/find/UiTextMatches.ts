import type { UiNode } from '../graph/UiNode';
import type { TextRange } from '../selection/UiSelectable';

/**
 * The node property holding the ranges of a `Text` node's text that the
 * current find query matched, or absent when none of it did.
 *
 * A list rather than the single range a selection has, because a
 * paragraph can hold several matches; and a separate property from
 * `textSelection`, because the two are lit at once — the active match
 * is the selection, drawn over its own softer match highlight. Both
 * live on the node for the same reason (see `UiSelectable`): in the
 * render worker the graph is all the renderer has.
 */
export const TEXT_MATCHES_PROP = 'textMatches';

/** The matched ranges of a node's text, or undefined when it has none. */
export function matchRangesOf(node: UiNode): readonly TextRange[] | undefined {
  const ranges = node.properties.get(TEXT_MATCHES_PROP);
  return Array.isArray(ranges) && ranges.length > 0 ? (ranges as readonly TextRange[]) : undefined;
}

/** Writes a node's matched ranges. Returns whether they changed. */
export function setMatchRanges(node: UiNode, ranges: readonly TextRange[]): boolean {
  const current = matchRangesOf(node);
  if (current !== undefined && rangesEqual(current, ranges)) {
    return false;
  }
  if (ranges.length === 0) {
    return clearMatchRanges(node);
  }
  node.properties.set(TEXT_MATCHES_PROP, ranges);
  return true;
}

/** Clears a node's matched ranges. Returns whether it had any. */
export function clearMatchRanges(node: UiNode): boolean {
  return node.properties.delete(TEXT_MATCHES_PROP);
}

function rangesEqual(a: readonly TextRange[], b: readonly TextRange[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].start !== b[i].start || a[i].end !== b[i].end) {
      return false;
    }
  }
  return true;
}
