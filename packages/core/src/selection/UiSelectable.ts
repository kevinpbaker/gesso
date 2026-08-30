import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { isNodeInert, isNodeSelectable } from '../input/UiInteraction';
import { resolveString } from '../properties/UiPropertyResolver';

/**
 * The node property holding the range of a `Text` node's text that is
 * selected, as `{ start, end }` in source offsets, or absent when none
 * of it is.
 *
 * It lives on the node for the same reason the editable's model does
 * (see `UiEditable`): the node is the identity that survives
 * reconciliation, and paint has to see the selection without the
 * selection having to be threaded through the render context — which
 * matters most in the render worker, where the graph is all the
 * renderer has.
 */
export const TEXT_SELECTION_PROP = 'textSelection';

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** The selected range of a node's text, or undefined when none is. */
export function selectionRangeOf(node: UiNode): TextRange | undefined {
  const range = node.properties.get(TEXT_SELECTION_PROP);
  if (typeof range !== 'object' || range === null) {
    return undefined;
  }
  const candidate = range as Partial<TextRange>;
  return typeof candidate.start === 'number' && typeof candidate.end === 'number' ? (range as TextRange) : undefined;
}

/**
 * Writes a node's selected range. Returns whether it changed, so the
 * caller only marks the node dirty when there is something new to
 * paint.
 */
export function setSelectionRange(node: UiNode, start: number, end: number): boolean {
  const current = selectionRangeOf(node);
  if (current !== undefined && current.start === start && current.end === end) {
    return false;
  }
  node.properties.set(TEXT_SELECTION_PROP, { start, end });
  return true;
}

/** Clears a node's selected range. Returns whether it had one. */
export function clearSelectionRange(node: UiNode): boolean {
  return node.properties.delete(TEXT_SELECTION_PROP);
}

/**
 * The text a `Text` node draws, when the user may select it.
 *
 * Undefined for anything that is not selectable text: another node
 * type, an empty or absent string, an inert subtree, or a subtree that
 * opted out through `selectable: false` — which, as in a browser's
 * default stylesheet, a `Button` does for its label.
 */
export function selectableTextOf(node: UiNode): string | undefined {
  if (node.type !== UiNodeType.Text || !isNodeSelectable(node) || isUnderInert(node)) {
    return undefined;
  }
  const text = resolveString(node, 'text');
  return text !== undefined && text.length > 0 ? text : undefined;
}

/**
 * Whether anything from the node up hides it. Inertness is a subtree
 * property, so the answer is not on the node alone — and a caller may
 * hold a node reference from before an ancestor was hidden.
 */
function isUnderInert(node: UiNode): boolean {
  for (let current: UiNode | null = node; current !== null; current = current.parent) {
    if (isNodeInert(current)) {
      return true;
    }
  }
  return false;
}

/**
 * Every selectable text node under `root`, in document order.
 *
 * Document order is what makes a selection across nodes meaningful:
 * the two ends are ordered by their position in this list, and every
 * node between them is fully covered. Fragments are expanded in place,
 * as they are everywhere else; `zIndex` is deliberately not honoured,
 * because painting order is not reading order.
 */
export function selectableTextNodes(root: UiNode): UiNode[] {
  const found: UiNode[] = [];
  collectSelectable(root, found);
  return found;
}

function collectSelectable(node: UiNode, out: UiNode[]): void {
  if (isNodeInert(node)) {
    return;
  }
  if (selectableTextOf(node) !== undefined) {
    out.push(node);
    return;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    collectSelectable(child, out);
  }
}
