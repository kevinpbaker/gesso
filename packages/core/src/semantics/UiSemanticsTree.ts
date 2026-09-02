import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiRole, UiSemanticState, UiSemanticStates } from '../properties/UiSemantics';
import { normalizeStates } from '../properties/UiSemantics';

/**
 * One node of the semantics tree, flattened.
 *
 * Flat rather than nested because the consumer is a diff: a record
 * carries its parent and its position among its semantic siblings, so
 * two frames' maps can be compared key by key without walking two
 * trees in step. `parent` is null for a root-level record.
 *
 * Geometry is deliberately absent. A record changes when what the node
 * *means* changes; where it sits changes on every scrolled frame, and
 * F6b's mirror can read a box from the layout engine by id when it
 * needs one. Keeping them apart is what makes "no semantics changed"
 * a cheap and true statement.
 */
export interface UiSemanticsRecord {
  readonly id: string;
  readonly parent: string | null;
  /** Position among the records sharing this parent. */
  readonly index: number;
  readonly role?: UiRole;
  /** The accessible name: an explicit `label`, else the node's text. */
  readonly label?: string;
  readonly description?: string;
  /** Sorted and de-duplicated, so declaration order does not diff. */
  readonly states?: readonly UiSemanticState[];
  readonly disabled?: true;
  readonly valueNow?: number;
  readonly valueMin?: number;
  readonly valueMax?: number;
  readonly valueText?: string;
  readonly posInSet?: number;
  readonly setSize?: number;
  /** How deep a treeitem sits, 1 for a root. */
  readonly level?: number;
}

/** Insertion-ordered: iterating the map walks the tree in document order. */
export type UiSemanticsMap = ReadonlyMap<string, UiSemanticsRecord>;

/**
 * The roles a node type carries without being asked.
 *
 * A `Button` is a button whether or not the component that built it
 * said so — which is what makes "every component emits semantics"
 * achievable rather than aspirational. Everything else states its own
 * role or is transparent.
 */
const IMPLICIT_ROLES: Partial<Record<UiNodeType, UiRole>> = {
  [UiNodeType.Button]: 'button',
  [UiNodeType.EditableText]: 'textbox'
};

/**
 * Roles whose descendants say nothing of their own.
 *
 * ARIA calls these "children presentational": the text inside a button
 * is how the button is named, not a paragraph next to it, and a screen
 * reader that announced both would say everything twice. The list is
 * ARIA's, narrowed to the roles `UiRole` has, plus `menuitem`: ARIA
 * names a menu item from its contents but stops short of marking its
 * children presentational, and the only difference that makes here is
 * a row whose label is on the tree twice.
 *
 * The other roles ARIA names from their contents are deliberately out.
 * A `listitem`, a `cell` or a `row` holds content rather than being
 * spelled by it, and a button inside one has to stay a record of its
 * own.
 */
const PRESENTATIONAL_CHILDREN: ReadonlySet<UiRole> = new Set<UiRole>([
  'button',
  'checkbox',
  'image',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'progressbar',
  'radio',
  'separator',
  'slider',
  'switch',
  'tab'
]);

/**
 * Builds the semantics tree under `root`.
 *
 * Three rules, in order:
 *
 *   1. A node is a **semantics node** when it declares a `role` or a
 *      `label`, or its type has an implicit role, or it is a `Text`
 *      with text that no ancestor has claimed as its name. Everything
 *      else is transparent: its children attach to the nearest
 *      semantics ancestor, so wrapping a button in three boxes for
 *      layout does not put three nodes in front of a screen reader.
 *   2. A semantics node's name is its `label` if it has one, else the
 *      text it and its non-semantic descendants draw. Text used that
 *      way is *claimed*: it does not also become a record, so a
 *      `Button(Text('Save'))` is one node named "Save", not two.
 *   3. An invisible subtree is not in the tree at all. A disabled one
 *      is, carrying `disabled` — unavailable is a thing to announce,
 *      hidden is not.
 */
export function buildSemanticsTree(root: UiNode): UiSemanticsMap {
  const records = new Map<string, UiSemanticsRecord>();
  const childCounts = new Map<string | null, number>();

  const nextIndex = (parent: string | null): number => {
    const index = childCounts.get(parent) ?? 0;
    childCounts.set(parent, index + 1);
    return index;
  };

  const visit = (node: UiNode, parent: string | null, inert: boolean): void => {
    if (node.properties.get('visible') === false) {
      return;
    }
    const disabled = inert || node.properties.get('disabled') === true;
    const record = describe(node, parent, disabled, nextIndex);
    if (record === null) {
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        visit(child, parent, disabled);
      }
      return;
    }
    records.set(record.id, record);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (claimedByName(node, child)) {
        continue;
      }
      visit(child, record.id, disabled);
    }
  };

  visit(root, null, false);
  return records;
}

/**
 * The record for a node, or null when the node is transparent.
 */
function describe(
  node: UiNode,
  parent: string | null,
  disabled: boolean,
  nextIndex: (parent: string | null) => number
): UiSemanticsRecord | null {
  const role = (node.properties.get('role') as UiRole | undefined) ?? IMPLICIT_ROLES[node.type as UiNodeType];
  const declaredLabel = node.properties.get('label') as string | undefined;
  const name = declaredLabel ?? accessibleText(node);
  const isText = node.type === UiNodeType.Text;
  // Prose with nothing else to say is still a record: a screen reader
  // has to be able to read the page, not only operate it.
  if (role === undefined && declaredLabel === undefined && !(isText && name !== undefined)) {
    return null;
  }
  const states = node.properties.get('states') as UiSemanticStates | undefined;
  return prune({
    id: node.id,
    parent,
    index: nextIndex(parent),
    role,
    label: name,
    description: node.properties.get('description') as string | undefined,
    states: states === undefined || states.length === 0 ? undefined : normalizeStates(states),
    disabled: disabled ? true : undefined,
    valueNow: node.properties.get('valueNow') as number | undefined,
    valueMin: node.properties.get('valueMin') as number | undefined,
    valueMax: node.properties.get('valueMax') as number | undefined,
    valueText: valueTextOf(node),
    posInSet: node.properties.get('posInSet') as number | undefined,
    setSize: node.properties.get('setSize') as number | undefined,
    level: node.properties.get('level') as number | undefined
  });
}

/**
 * An editable's content is its value, not its name, and it is held on
 * the node as `value` — the property the app sets and `onInput`
 * reports. An explicit `valueText` overrides it.
 */
function valueTextOf(node: UiNode): string | undefined {
  const declared = node.properties.get('valueText') as string | undefined;
  if (declared !== undefined) {
    return declared;
  }
  if (node.type === UiNodeType.EditableText) {
    return (node.properties.get('value') as string | undefined) ?? '';
  }
  return undefined;
}

/**
 * The text a node draws, including the text of transparent
 * descendants, joined by spaces. Stops at a descendant that is a
 * semantics node of its own, which has its own name to say.
 */
function accessibleText(node: UiNode): string | undefined {
  if (node.type === UiNodeType.EditableText) {
    return undefined;
  }
  const parts: string[] = [];
  const own = node.properties.get('text') as string | undefined;
  if (own !== undefined && own.length > 0) {
    parts.push(own);
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (!namesItsParent(child)) {
      continue;
    }
    const text = accessibleText(child);
    if (text !== undefined) {
      parts.push(text);
    }
  }
  const joined = parts.join(' ').trim();
  return joined.length > 0 ? joined : undefined;
}

/**
 * Whether a child's text belongs to its parent's name rather than to
 * a record of its own: it must be visible and say nothing itself.
 */
function namesItsParent(child: UiNode): boolean {
  if (child.properties.get('visible') === false) {
    return false;
  }
  if (child.properties.get('role') !== undefined || child.properties.get('label') !== undefined) {
    return false;
  }
  return IMPLICIT_ROLES[child.type as UiNodeType] === undefined;
}

/**
 * Whether a child is already spoken for by its parent.
 *
 * Either because the parent's name was built from its text, or because
 * the parent's role makes its whole subtree presentational — a labelled
 * button still hides the glyph inside it. A labelled *container*
 * (a form, a list, a dialog) claims nothing: its label names it, and
 * its children are the content that label introduces.
 */
function claimedByName(parent: UiNode, child: UiNode): boolean {
  const role = (parent.properties.get('role') as UiRole | undefined) ?? IMPLICIT_ROLES[parent.type as UiNodeType];
  if (role !== undefined && PRESENTATIONAL_CHILDREN.has(role)) {
    return true;
  }
  if (parent.properties.get('label') !== undefined) {
    return false;
  }
  return namesItsParent(child) && accessibleText(child) !== undefined;
}

/** Drops the undefined members, so records compare and serialise small. */
function prune(record: UiSemanticsRecord): UiSemanticsRecord {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as unknown as UiSemanticsRecord;
}
