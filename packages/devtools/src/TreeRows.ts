import type { UiTreeNode } from '@gesso/framework';

/**
 * A tree snapshot as the rows a panel draws (`ADOPTION_ROADMAP.md` A4).
 *
 * The panel keeps a set of expanded ids and asks for the rows; the
 * tree can be replaced by a new snapshot every frame while the set
 * stays, so a person's unfolding survives the application changing
 * under it. Ids are positional, which is what makes that work and also
 * what makes it approximate: a row that was a button can become a text
 * when a list reorders. The report says what it is now.
 */
export interface TreeRow {
  readonly node: UiTreeNode;
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  /** The nearest component anchor at or above this node, if any. */
  readonly owner?: string;
}

/** The rows of the tree with `expanded` nodes unfolded, in document order. */
export function treeRows(root: UiTreeNode, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (node: UiTreeNode, depth: number, owner: string | undefined): void => {
    const own = node.component ?? owner;
    const expandable = node.children.length > 0;
    const isExpanded = expandable && expanded.has(node.id);
    rows.push({ node, depth, expandable, expanded: isExpanded, ...(own === undefined ? {} : { owner: own }) });
    if (isExpanded) {
      for (const child of node.children) {
        visit(child, depth + 1, own);
      }
    }
  };
  visit(root, 0, undefined);
  return rows;
}

/** The ids of every node with children down to `depth` levels, for a first unfolding. */
export function idsToDepth(root: UiTreeNode, depth: number): string[] {
  const ids: string[] = [];
  const visit = (node: UiTreeNode, level: number): void => {
    if (level >= depth || node.children.length === 0) {
      return;
    }
    ids.push(node.id);
    for (const child of node.children) {
      visit(child, level + 1);
    }
  };
  visit(root, 0);
  return ids;
}

/** The ids of the ancestors of `id`, root first, or null when the tree has no such node. */
export function pathTo(root: UiTreeNode, id: string): string[] | null {
  const path: string[] = [];
  const visit = (node: UiTreeNode): boolean => {
    if (node.id === id) {
      return true;
    }
    path.push(node.id);
    for (const child of node.children) {
      if (visit(child)) {
        return true;
      }
    }
    path.pop();
    return false;
  };
  return visit(root) ? path : null;
}

/** One row's label, as the tree prints it. */
export function rowLabel(row: TreeRow): string {
  const { node } = row;
  const parts = [node.type];
  if (node.component !== undefined) {
    parts.push(`<${node.component}>`);
  }
  if (node.text !== undefined) {
    parts.push(`"${node.text}"`);
  }
  return parts.join(' ');
}
