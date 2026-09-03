import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { buildSemanticsTree, type UiSemanticsRecord } from './UiSemanticsTree';

class Tree {
  readonly graph = new UiGraph();
  readonly root: UiNode;
  private ids = 0;

  constructor() {
    this.root = this.node(UiNodeType.Column);
  }

  node(type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
    const node = this.graph.createNode(`n${this.ids++}`, type);
    for (const [key, value] of Object.entries(props)) {
      node.setProperty(key, value);
    }
    return node;
  }

  add(parent: UiNode, ...children: UiNode[]): void {
    for (const child of children) {
      this.graph.appendChild(parent, child);
    }
  }

  build(): UiSemanticsRecord[] {
    return [...buildSemanticsTree(this.root).values()];
  }
}

describe('buildSemanticsTree', () => {
  it('gives a Button a role and names it from the text it contains', () => {
    const t = new Tree();
    const button = t.node(UiNodeType.Button);
    const label = t.node(UiNodeType.Text, { text: 'Save' });
    t.add(button, label);
    t.add(t.root, button);

    const records = t.build();

    expect(records).toEqual([{ id: button.id, parent: null, index: 0, role: 'button', label: 'Save' }]);
  });

  it('carries a live region setting so changing text can be announced', () => {
    const t = new Tree();
    const status = t.node(UiNodeType.Row, { role: 'status', label: 'Passcode, 1 of 6 digits entered', live: 'polite' });
    t.add(t.root, status);
    expect(t.build()).toEqual([
      {
        id: status.id,
        parent: null,
        index: 0,
        role: 'status',
        label: 'Passcode, 1 of 6 digits entered',
        live: 'polite'
      }
    ]);
  });

  it('sees through the boxes a layout needs', () => {
    const t = new Tree();
    const outer = t.node(UiNodeType.Box);
    const inner = t.node(UiNodeType.Row);
    const button = t.node(UiNodeType.Button, { text: 'Go' });
    t.add(inner, button);
    t.add(outer, inner);
    t.add(t.root, outer);

    const records = t.build();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ parent: null, index: 0, role: 'button', label: 'Go' });
  });

  it('prefers an explicit label to the text, and drops the claimed text', () => {
    const t = new Tree();
    const button = t.node(UiNodeType.Button, { label: 'Delete note' });
    t.add(button, t.node(UiNodeType.Text, { text: '×' }));
    t.add(t.root, button);

    const records = t.build();

    expect(records).toHaveLength(1);
    expect(records[0].label).toBe('Delete note');
  });

  it('makes prose a record of its own so a page can be read', () => {
    const t = new Tree();
    t.add(t.root, t.node(UiNodeType.Text, { text: 'Hello' }), t.node(UiNodeType.Text, { text: 'World' }));

    const records = t.build();

    expect(records.map(record => record.label)).toEqual(['Hello', 'World']);
    expect(records.map(record => record.index)).toEqual([0, 1]);
    expect(records.every(record => record.role === undefined)).toBe(true);
  });

  it('reports an editable as a textbox whose value is its content', () => {
    const t = new Tree();
    const field = t.node(UiNodeType.EditableText, { value: 'Ada', label: 'Name' });
    t.add(t.root, field);

    const records = t.build();

    expect(records).toEqual([
      { id: field.id, parent: null, index: 0, role: 'textbox', label: 'Name', valueText: 'Ada' }
    ]);
  });

  it('nests records under the nearest semantic ancestor and numbers them there', () => {
    const t = new Tree();
    const list = t.node(UiNodeType.Column, { role: 'list' });
    const rows = [0, 1, 2].map(index =>
      t.node(UiNodeType.Box, { role: 'listitem', posInSet: index + 1, setSize: 1000 })
    );
    for (const [index, row] of rows.entries()) {
      t.add(row, t.node(UiNodeType.Text, { text: `Row ${index}` }));
    }
    t.add(list, ...rows);
    t.add(t.root, list);

    const records = t.build();

    expect(records[0]).toMatchObject({ role: 'list', parent: null, index: 0 });
    expect(records.slice(1)).toEqual(
      rows.map((row, index) => ({
        id: row.id,
        parent: list.id,
        index,
        role: 'listitem',
        label: `Row ${index}`,
        posInSet: index + 1,
        setSize: 1000
      }))
    );
  });

  it('claims the text inside a menu item, which is how the item is named', () => {
    const t = new Tree();
    const menu = t.node(UiNodeType.Column, { role: 'menu', label: 'Actions' });
    const item = t.node(UiNodeType.Row, { role: 'menuitem', label: 'Rename' });
    t.add(item, t.node(UiNodeType.Text, { text: 'Rename' }));
    t.add(menu, item);
    t.add(t.root, menu);

    const records = t.build();

    // Two records, not three: an item is named by the text it draws,
    // and a reader that announced both would say it twice.
    expect(records.map(record => [record.role, record.label])).toEqual([
      ['menu', 'Actions'],
      ['menuitem', 'Rename']
    ]);
  });

  it('carries disabled down the subtree, because inert is inherited', () => {
    const t = new Tree();
    const group = t.node(UiNodeType.Box, { role: 'group', disabled: true });
    const button = t.node(UiNodeType.Button, { text: 'Send' });
    t.add(group, button);
    t.add(t.root, group);

    const records = t.build();

    expect(records.map(record => record.disabled)).toEqual([true, true]);
  });

  it('leaves an invisible subtree out entirely', () => {
    const t = new Tree();
    const hidden = t.node(UiNodeType.Box, { visible: false });
    t.add(hidden, t.node(UiNodeType.Button, { text: 'Hidden' }));
    t.add(t.root, hidden, t.node(UiNodeType.Button, { text: 'Shown' }));

    expect(t.build().map(record => record.label)).toEqual(['Shown']);
  });

  it('sorts and de-duplicates states so declaration order does not diff', () => {
    const t = new Tree();
    const box = t.node(UiNodeType.Box, { role: 'checkbox', label: 'Wrap', states: ['required', 'checked', 'checked'] });
    t.add(t.root, box);

    expect(t.build()[0].states).toEqual(['checked', 'required']);
  });

  it('names a control from its own text prop', () => {
    const t = new Tree();
    const button = t.node(UiNodeType.Button, { text: 'Open' });
    t.add(t.root, button);

    expect(t.build()[0].label).toBe('Open');
  });
});
