import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';

/**
 * Fields that select as one: the editables inside a container that sets
 * `editingGroup`.
 *
 * A document editor is many fields, one per paragraph, and a person
 * selects across paragraphs as if they were one text: dragging from one
 * into the next, Shift and an arrow off the end of a line, Shift and a
 * press further down, select all. Each field's own selection can only
 * cover its own text, so inside a group the editing controller keeps a
 * selection whose two ends may sit in different fields, lights every
 * field between them, and hands the shell the selected text, so native
 * copy and cut take all of it.
 *
 * What happens to such a selection when the person types, deletes,
 * presses Enter, pastes or cuts is the application's: only it knows
 * that joining a heading to the list under it makes a heading. So those
 * edits are not applied to any field. They go to `onEdit`, with both
 * ends, and the application changes its document and puts the caret
 * where it belongs.
 *
 * A selection inside one field is that field's, as it always was.
 */
export interface UiEditingGroup {
  /** An edit over a selection that spans fields. Nothing is applied for it. */
  onEdit(edit: UiGroupEdit): void;
  /**
   * The text a selection spanning fields copies as. By default each
   * field's selected text, joined by newlines.
   */
  copyText?(start: UiTextPosition, end: UiTextPosition): string;
  /**
   * The selection as HTML, which a copy puts on the clipboard beside
   * the text, for a target that takes formatting (a document, an email).
   * Asked for a selection across fields and for one inside a single
   * field of the group. Null or absent copies text alone.
   */
  copyHtml?(start: UiTextPosition, end: UiTextPosition): string | null;
  /**
   * A selection across fields began, moved, or ended (null). For a
   * command the application runs over it, such as making it bold:
   * keys reach the focused field first, and only the group knows what
   * the selection covers.
   */
  onSelectionChange?(selection: { readonly start: UiTextPosition; readonly end: UiTextPosition } | null): void;
}

/** A place in a field's text. */
export interface UiTextPosition {
  readonly node: UiNode;
  readonly offset: number;
}

/**
 * An edit over a selection that spans fields, in the DOM's vocabulary:
 * `insertText` with the text, `insertParagraph` for Enter,
 * `insertFromPaste`, a `delete…` type for Backspace and Delete, and
 * `deleteByCut`. `start` comes before `end` in document order.
 */
export interface UiGroupEdit {
  readonly inputType: string;
  readonly data: string | null;
  /** For a paste, the clipboard's HTML when it held some. */
  readonly html?: string | null;
  readonly start: UiTextPosition;
  readonly end: UiTextPosition;
}

/** The group a field belongs to, and the container that declared it, or null. */
export function editingGroupOf(node: UiNode): { readonly root: UiNode; readonly group: UiEditingGroup } | null {
  for (let current = node.parent; current !== null; current = current.parent) {
    const group = current.properties.get('editingGroup') as UiEditingGroup | undefined;
    if (group !== undefined && group !== null) {
      return { root: current, group };
    }
  }
  return null;
}

/** Whether a field takes part in its group's selection: visible and not disabled. */
function selectsInGroup(node: UiNode, root: UiNode): boolean {
  if (node.type !== UiNodeType.EditableText) {
    return false;
  }
  for (let current: UiNode | null = node; current !== null && current !== root; current = current.parent) {
    if (current.properties.get('visible') === false || current.properties.get('disabled') === true) {
      return false;
    }
  }
  return true;
}

/**
 * The next field in document order after `from` (or before it, for -1),
 * inside `root`, or null at either end. Walks only as far as it has to,
 * so stepping from one paragraph to the next costs the nodes between
 * them, not the whole document.
 */
export function adjacentField(root: UiNode, from: UiNode, direction: 1 | -1): UiNode | null {
  let current: UiNode | null = from;
  for (;;) {
    current = direction > 0 ? nextInOrder(current, root) : previousInOrder(current, root);
    if (current === null) {
      return null;
    }
    if (selectsInGroup(current, root)) {
      return current;
    }
  }
}

/** The first or last field inside `root`, or null when it has none. */
export function edgeField(root: UiNode, direction: 1 | -1): UiNode | null {
  if (direction > 0) {
    const first = root.firstChild;
    if (first === null) {
      return null;
    }
    return selectsInGroup(first, root) ? first : adjacentField(root, first, 1);
  }
  let last: UiNode = root;
  while (last.lastChild !== null) {
    last = last.lastChild;
  }
  if (last === root) {
    return null;
  }
  return selectsInGroup(last, root) ? last : adjacentField(root, last, -1);
}

/** Pre-order successor inside `root`. Children of a field are not entered: a field is a leaf to selection. */
function nextInOrder(node: UiNode, root: UiNode): UiNode | null {
  if (node.firstChild !== null && node.type !== UiNodeType.EditableText) {
    return node.firstChild;
  }
  for (let current: UiNode | null = node; current !== null && current !== root; current = current.parent) {
    if (current.nextSibling !== null) {
      return current.nextSibling;
    }
  }
  return null;
}

/** Pre-order predecessor inside `root`. */
function previousInOrder(node: UiNode, root: UiNode): UiNode | null {
  if (node === root) {
    return null;
  }
  const sibling = node.previousSibling;
  if (sibling === null) {
    return node.parent === root ? null : node.parent;
  }
  let current = sibling;
  while (current.lastChild !== null && current.type !== UiNodeType.EditableText) {
    current = current.lastChild;
  }
  return current;
}

/**
 * Which of two positions comes first in document order: negative, zero
 * or positive, as a comparator.
 */
export function comparePositions(a: UiTextPosition, b: UiTextPosition): number {
  if (a.node === b.node) {
    return a.offset - b.offset;
  }
  const path = (node: UiNode): UiNode[] => {
    const out: UiNode[] = [];
    for (let current: UiNode | null = node; current !== null; current = current.parent) {
      out.push(current);
    }
    return out.reverse();
  };
  const left = path(a.node);
  const right = path(b.node);
  let depth = 0;
  while (depth < left.length && depth < right.length && left[depth] === right[depth]) {
    depth++;
  }
  if (depth === left.length) {
    return -1;
  }
  if (depth === right.length) {
    return 1;
  }
  for (let sibling = left[depth]!.nextSibling; sibling !== null; sibling = sibling.nextSibling) {
    if (sibling === right[depth]) {
      return -1;
    }
  }
  return 1;
}
