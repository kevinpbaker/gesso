import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import {
  clearSelectionRange,
  selectableTextNodes,
  selectableTextOf,
  selectionRangeOf,
  setSelectionRange
} from './UiSelectable';

const graph = new UiGraph();
let ids = 0;

function node(type: UiNodeType, props: Record<string, unknown> = {}): UiNode {
  const created = graph.createNode(`n${ids++}`, type);
  for (const [key, value] of Object.entries(props)) {
    created.setProperty(key, value);
  }
  return created;
}

function tree(parent: UiNode, ...children: UiNode[]): UiNode {
  for (const child of children) {
    graph.appendChild(parent, child);
  }
  return parent;
}

describe('UiSelectable', () => {
  describe('selectableTextOf', () => {
    it('is the text of a Text node', () => {
      expect(selectableTextOf(node(UiNodeType.Text, { text: 'hello' }))).toBe('hello');
    });

    it('is undefined for an empty, absent or non-text node', () => {
      expect(selectableTextOf(node(UiNodeType.Text, { text: '' }))).toBeUndefined();
      expect(selectableTextOf(node(UiNodeType.Text))).toBeUndefined();
      expect(selectableTextOf(node(UiNodeType.Box, { text: 'hello' }))).toBeUndefined();
    });

    it('leaves an editable to its own model', () => {
      expect(selectableTextOf(node(UiNodeType.EditableText, { value: 'hello' }))).toBeUndefined();
    });

    it('is undefined inside a subtree that opted out', () => {
      const label = node(UiNodeType.Text, { text: 'hello' });
      tree(node(UiNodeType.Column, { selectable: false }), tree(node(UiNodeType.Box), label));
      expect(selectableTextOf(label)).toBeUndefined();
    });

    it('is undefined inside a Button, whose label is a control not prose', () => {
      const label = node(UiNodeType.Text, { text: 'Save' });
      tree(node(UiNodeType.Button), label);
      expect(selectableTextOf(label)).toBeUndefined();
    });

    it('opts back in below an opted-out ancestor, nearest setting winning', () => {
      const label = node(UiNodeType.Text, { text: 'Save' });
      tree(node(UiNodeType.Button), tree(node(UiNodeType.Box, { selectable: true }), label));
      expect(selectableTextOf(label)).toBe('Save');
    });

    it('is undefined in an inert subtree', () => {
      const label = node(UiNodeType.Text, { text: 'hello' });
      tree(node(UiNodeType.Column, { visible: false }), label);
      expect(selectableTextOf(label)).toBeUndefined();
    });
  });

  describe('selectableTextNodes', () => {
    it('walks the tree in document order and skips what cannot be selected', () => {
      const heading = node(UiNodeType.Text, { text: 'Title' });
      const body = node(UiNodeType.Text, { text: 'Body' });
      const buttonLabel = node(UiNodeType.Text, { text: 'Save' });
      const field = node(UiNodeType.EditableText, { value: 'typed' });
      const root = tree(
        node(UiNodeType.Column),
        heading,
        tree(node(UiNodeType.Box), body),
        tree(node(UiNodeType.Button), buttonLabel),
        field
      );
      expect(selectableTextNodes(root)).toEqual([heading, body]);
    });

    it('does not descend into a text node', () => {
      const inner = node(UiNodeType.Text, { text: 'inner' });
      const outer = tree(node(UiNodeType.Text, { text: 'outer' }), inner);
      expect(selectableTextNodes(tree(node(UiNodeType.Column), outer))).toEqual([outer]);
    });
  });

  describe('ranges', () => {
    it('round-trips and reports whether it changed', () => {
      const text = node(UiNodeType.Text, { text: 'hello' });
      expect(selectionRangeOf(text)).toBeUndefined();
      expect(setSelectionRange(text, 1, 3)).toBe(true);
      expect(selectionRangeOf(text)).toEqual({ start: 1, end: 3 });
      expect(setSelectionRange(text, 1, 3)).toBe(false);
      expect(setSelectionRange(text, 1, 4)).toBe(true);
      expect(clearSelectionRange(text)).toBe(true);
      expect(clearSelectionRange(text)).toBe(false);
      expect(selectionRangeOf(text)).toBeUndefined();
    });
  });
});
