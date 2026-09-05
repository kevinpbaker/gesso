import { describe, expect, it } from 'vitest';

import type { UiTreeNode } from '@gesso/framework';
import { idsToDepth, pathTo, rowLabel, treeRows } from './TreeRows';

const leaf = (id: string, text?: string): UiTreeNode => ({
  id,
  type: 'text',
  children: [],
  ...(text === undefined ? {} : { text })
});
const tree: UiTreeNode = {
  id: 'root',
  type: 'column',
  children: [
    {
      id: 'card',
      type: 'fragment',
      component: 'card',
      children: [{ id: 'box', type: 'box', children: [leaf('title', 'Hello')] }]
    },
    leaf('after', 'after')
  ]
};

describe('treeRows', () => {
  it('lists only what is unfolded, in document order, with depth and the nearest component', () => {
    const rows = treeRows(tree, new Set(['root', 'card']));

    expect(rows.map(row => [row.node.id, row.depth, row.owner])).toEqual([
      ['root', 0, undefined],
      ['card', 1, 'card'],
      ['box', 2, 'card'],
      ['after', 1, undefined]
    ]);
    expect(rows[2]).toMatchObject({ expandable: true, expanded: false });
    expect(rows[3]).toMatchObject({ expandable: false, expanded: false });
  });

  it('shows a collapsed root alone', () => {
    expect(treeRows(tree, new Set()).map(row => row.node.id)).toEqual(['root']);
  });
});

describe('idsToDepth', () => {
  it('names the nodes with children down to the given depth', () => {
    expect(idsToDepth(tree, 1)).toEqual(['root']);
    expect(idsToDepth(tree, 2)).toEqual(['root', 'card']);
    expect(idsToDepth(tree, 9)).toEqual(['root', 'card', 'box']);
  });
});

describe('pathTo', () => {
  it('returns the ancestors root first, and null for an unknown id', () => {
    expect(pathTo(tree, 'title')).toEqual(['root', 'card', 'box']);
    expect(pathTo(tree, 'root')).toEqual([]);
    expect(pathTo(tree, 'nope')).toBeNull();
  });
});

describe('rowLabel', () => {
  it('prints the type, the component and the text that are there', () => {
    const rows = treeRows(tree, new Set(['root', 'card', 'box']));
    expect(rowLabel(rows[1]!)).toBe('fragment <card>');
    expect(rowLabel(rows[3]!)).toBe('text "Hello"');
    expect(rowLabel(rows[0]!)).toBe('column');
  });
});
