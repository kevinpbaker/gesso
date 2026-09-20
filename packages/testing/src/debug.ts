import type { LayoutBox, UiNode } from 'gesso-core';
import type { GessoRuntime } from 'gesso-framework';

/** `12,8 64×32`, rounded, because a test reader wants the shape not the sixteenths. */
function formatBox(box: LayoutBox): string {
  const round = (value: number): number => Math.round(value * 100) / 100;
  return `${round(box.x)},${round(box.y)} ${round(box.width)}×${round(box.height)}`;
}

/**
 * The tree as text, one node per line.
 *
 * Printed with what a query would have matched on, in the order a
 * query would have considered it: the node's type and id, then the
 * role and accessible name its semantics record carries, then its
 * states, then the text it draws, then its box. A missed query prints
 * this, and the answer to "why did `getByRole('switch')` not find it"
 * is usually on the line for the node that turned out to be a
 * `checkbox`.
 *
 * Nodes with no semantics record are printed too, dimmer in content if
 * not in colour: a `Row` that exists only for layout is exactly the
 * thing a reader needs to see is *not* in the tree an assistive
 * technology reads.
 */
export function formatTree(runtime: GessoRuntime, root: UiNode): string {
  const semantics = runtime.semanticsTree();
  const lines: string[] = [];

  const visit = (node: UiNode, depth: number): void => {
    const parts: string[] = [`${node.type}#${node.id}`];
    const record = semantics.get(node.id);
    if (record !== undefined) {
      if (record.role !== undefined) {
        parts.push(`role=${record.role}`);
      }
      if (record.label !== undefined) {
        parts.push(`name=${JSON.stringify(record.label)}`);
      }
      if (record.states !== undefined && record.states.length > 0) {
        parts.push(`states=[${record.states.join(',')}]`);
      }
      if (record.disabled === true) {
        parts.push('disabled');
      }
      if (record.valueNow !== undefined) {
        parts.push(`value=${record.valueNow}`);
      }
    }
    const text = node.properties.get('text');
    if (typeof text === 'string' && text.length > 0 && record?.label !== text) {
      parts.push(`text=${JSON.stringify(text)}`);
    }
    if (node.properties.get('visible') === false) {
      parts.push('hidden');
    }
    let box: string;
    try {
      box = formatBox(runtime.debugLayoutBox(node));
    } catch {
      // A node built this frame and not yet laid out has no box; that
      // is worth saying rather than worth throwing from a debug print.
      box = 'not laid out';
    }
    parts.push(`[${box}]`);
    lines.push(`${'  '.repeat(depth)}${parts.join(' ')}`);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child, depth + 1);
    }
  };

  visit(root, 0);
  return lines.join('\n');
}
