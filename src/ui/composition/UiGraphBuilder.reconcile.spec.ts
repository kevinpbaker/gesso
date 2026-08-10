import { BehaviorSubject, Subject } from 'rxjs';

import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Button, Column, Row, Text } from './UiComponents';
import { UiGraphBuilder } from './UiGraphBuilder';

describe('UiGraphBuilder reconciliation', () => {
  function createBuilder() {
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph);
    return {
      graph,
      builder
    };
  }

  describe('updating properties', () => {
    it('reuses the root node across renders', () => {
      const { graph, builder } = createBuilder();
      const first = builder.build(Column(Text({ text: 'Hello' })));
      const second = builder.build(Column(Text({ text: 'Goodbye' })));
      expect(second).toBe(first);
      expect(graph.getNode(first.id)).toBe(first);
    });

    it('updates a changed plain property on the same node', () => {
      const { builder } = createBuilder();
      const first = builder.build(Text({ text: 'Hello' }));
      const node = builder.build(Text({ text: 'Goodbye' }));
      expect(node).toBe(first);
      expect(node.getProperty('text')).toBe('Goodbye');
    });

    it('reuses descendant nodes with the same shape', () => {
      const { builder } = createBuilder();
      const first = builder.build(Column(Text({ text: 'Hello' }), Text({ text: 'World' })));
      const second = builder.build(Column(Text({ text: 'A' }), Text({ text: 'B' })));
      const firstChildren = getChildren(first);
      const secondChildren = getChildren(second);
      expect(secondChildren[0]).toBe(firstChildren[0]);
      expect(secondChildren[1]).toBe(firstChildren[1]);
      expect(secondChildren[0].getProperty('text')).toBe('A');
      expect(secondChildren[1].getProperty('text')).toBe('B');
    });
  });

  describe('creating nodes', () => {
    it('creates nodes that are newly added', () => {
      const { builder } = createBuilder();
      const first = builder.build(Column(Text({ text: 'A' })));
      const second = builder.build(Column(Text({ text: 'A' }), Text({ text: 'B' })));
      const children = getChildren(second);
      expect(children).toHaveLength(2);
      expect(children[0]).toBe(getChildren(first)[0]);
      expect(children[1].getProperty('text')).toBe('B');
    });

    it('replaces a node when the type changes', () => {
      const { graph, builder } = createBuilder();
      const first = builder.build(Text({ text: 'Hello' }));
      const second = builder.build(Button({ text: 'Save' }));
      expect(second.type).toBe(UiNodeType.Button);
      expect(second).not.toBe(first);
      expect(second.id).toBe(first.id);
      expect(graph.getNode(first.id)).toBe(second);
      expect(second.getProperty('text')).toBe('Save');
    });

    it('replaces a keyed node when the type changes', () => {
      const { graph, builder } = createBuilder();
      const first = builder.build(Text({ text: 'Hello', key: 'greeting' }));
      const second = builder.build(Button({ text: 'Save', key: 'greeting' }));
      expect(second).not.toBe(first);
      expect(second.id).toBe(first.id);
      expect(second.type).toBe(UiNodeType.Button);
      expect(graph.getNode(first.id)).toBe(second);
    });

    it('creates a nested subtree for a new branch', () => {
      const { builder } = createBuilder();
      builder.build(Column(Text({ text: 'A' })));
      const second = builder.build(Column(Text({ text: 'A' }), Row(Text({ text: 'B' }), Text({ text: 'C' }))));
      const children = getChildren(second);
      expect(children[1].type).toBe(UiNodeType.Row);
      const rowChildren = getChildren(children[1]);
      expect(rowChildren[0].getProperty('text')).toBe('B');
      expect(rowChildren[1].getProperty('text')).toBe('C');
    });
  });

  describe('destroying nodes', () => {
    it('removes nodes that are no longer present', () => {
      const { graph, builder } = createBuilder();
      const root = builder.build(Column(Text({ text: 'A' }), Text({ text: 'B' })));
      const firstChildren = getChildren(root);
      builder.build(Column(Text({ text: 'A' })));
      expect(graph.hasNode(firstChildren[1].id)).toBe(false);
    });

    it('destroys bindings of removed nodes', () => {
      const { graph, builder } = createBuilder();
      const text$ = new BehaviorSubject('B');
      const root = builder.build(Column(Text({ text: 'A' }), Text({ text: text$ })));
      const removed = getChildren(root)[1];
      const binding = graph.getBindingsForNode(removed);
      expect(binding).toHaveLength(1);
      builder.build(Column(Text({ text: 'A' })));
      expect(graph.hasNode(removed.id)).toBe(false);
      expect(graph.getBindingsForNode(removed)).toHaveLength(0);
      expect(binding[0].connected()).toBe(false);
    });
  });

  describe('reordering with keys', () => {
    it('reorders keyed children', () => {
      const { builder } = createBuilder();
      const root = builder.build(Column(Text({ text: 'A', key: 'a' }), Text({ text: 'B', key: 'b' })));
      const original = getChildren(root);
      const updated = builder.build(Column(Text({ text: 'B', key: 'b' }), Text({ text: 'A', key: 'a' })));
      const children = getChildren(updated);
      expect(children[0]).toBe(original[1]);
      expect(children[1]).toBe(original[0]);
      expect(children[0].getProperty('text')).toBe('B');
      expect(children[1].getProperty('text')).toBe('A');
    });

    it('throws when sibling definitions share a key', () => {
      const { builder } = createBuilder();
      expect(() => builder.build(Column(Text({ text: 'A', key: 'x' }), Text({ text: 'B', key: 'x' })))).toThrow(
        "Duplicate key 'x' in parent 'root:0'."
      );
    });

    it('moves a keyed node to the front', () => {
      const { builder } = createBuilder();
      const root = builder.build(
        Column(Text({ text: 'A', key: 'a' }), Text({ text: 'B', key: 'b' }), Text({ text: 'C', key: 'c' }))
      );
      const original = getChildren(root);
      const updated = builder.build(
        Column(Text({ text: 'C', key: 'c' }), Text({ text: 'A', key: 'a' }), Text({ text: 'B', key: 'b' }))
      );
      const children = getChildren(updated);
      expect(children[0]).toBe(original[2]);
      expect(children[1]).toBe(original[0]);
      expect(children[2]).toBe(original[1]);
    });

    it('inserts a keyed node between keyed siblings', () => {
      const { builder } = createBuilder();
      const root = builder.build(Column(Text({ text: 'A', key: 'a' }), Text({ text: 'C', key: 'c' })));
      const original = getChildren(root);
      const updated = builder.build(
        Column(Text({ text: 'A', key: 'a' }), Text({ text: 'B', key: 'b' }), Text({ text: 'C', key: 'c' }))
      );
      const children = getChildren(updated);
      expect(children[0]).toBe(original[0]);
      expect(children[2]).toBe(original[1]);
      expect(children[1].getProperty('text')).toBe('B');
    });
  });

  describe('binding reconciliation', () => {
    it('keeps a binding when the Observable instance is unchanged', () => {
      const { graph, builder } = createBuilder();
      const text$ = new BehaviorSubject('Hello');
      const first = builder.build(Text({ text: text$ }));
      const before = graph.getBindingsForNode(first);
      const node = builder.build(Text({ text: text$ }));
      const after = graph.getBindingsForNode(node);
      expect(node).toBe(first);
      expect(after).toHaveLength(1);
      expect(after[0]).toBe(before[0]);
      expect(after[0].connected()).toBe(true);
    });

    it('rebinds when a different Observable instance is supplied', () => {
      const { graph, builder } = createBuilder();
      const first$ = new BehaviorSubject('First');
      const second$ = new BehaviorSubject('Second');
      const first = builder.build(Text({ text: first$ }));
      const before = graph.getBindingsForNode(first);
      const node = builder.build(Text({ text: second$ }));
      const after = graph.getBindingsForNode(node);
      expect(node).toBe(first);
      expect(after).toHaveLength(1);
      expect(after[0]).not.toBe(before[0]);
      expect(node.getProperty('text')).toBe('Second');
      expect(before[0].connected()).toBe(false);
    });

    it('creates a binding when a plain property becomes an Observable', () => {
      const { graph, builder } = createBuilder();
      const text$ = new BehaviorSubject('Hello');
      const node = builder.build(Text({ text: 'Goodbye' }));
      expect(graph.getBindingsForNode(node)).toHaveLength(0);
      const updated = builder.build(Text({ text: text$ }));
      expect(updated).toBe(node);
      expect(graph.getBindingsForNode(updated)).toHaveLength(1);
      expect(updated.getProperty('text')).toBe('Hello');
    });

    it('replaces a binding when an Observable becomes a plain value', () => {
      const { graph, builder } = createBuilder();
      const text$ = new BehaviorSubject('Hello');
      const first = builder.build(Text({ text: text$ }));
      const before = graph.getBindingsForNode(first);
      const node = builder.build(Text({ text: 'Goodbye' }));
      expect(node).toBe(first);
      expect(before[0].connected()).toBe(false);
      expect(graph.getBindingsForNode(node)).toHaveLength(0);
      expect(node.getProperty('text')).toBe('Goodbye');
    });

    it('unbinds a property that disappears from the definition', () => {
      const { graph, builder } = createBuilder();
      const text$ = new BehaviorSubject('Hello');
      const node = builder.build(Text({ text: text$, color: 'red' }));
      const binding = graph.getBindingsForNode(node)[0];
      builder.build(Text({ color: 'red' }));
      expect(binding.connected()).toBe(false);
      expect(graph.getBindingsForNode(node)).toHaveLength(0);
    });

    it('keeps pushing values to a preserved binding', () => {
      const { builder } = createBuilder();
      const text$ = new Subject<string>();
      const node = builder.build(Text({ text: text$ }));
      builder.build(Text({ text: text$ }));
      text$.next('First');
      expect(node.getProperty('text')).toBe('First');
      text$.next('Second');
      expect(node.getProperty('text')).toBe('Second');
    });
  });

  describe('moved bindings', () => {
    it('keeps bindings attached to a reordered node', () => {
      const { graph, builder } = createBuilder();
      const a$ = new BehaviorSubject('A');
      const root = builder.build(Column(Text({ text: a$, key: 'a' }), Text({ text: 'B', key: 'b' })));
      const aNode = getChildren(root)[0];
      const binding = graph.getBindingsForNode(aNode)[0];
      const updated = builder.build(Column(Text({ text: 'B', key: 'b' }), Text({ text: a$, key: 'a' })));
      const children = getChildren(updated);
      expect(children[1]).toBe(aNode);
      expect(graph.getBindingsForNode(aNode)[0]).toBe(binding);
      expect(aNode.getProperty('text')).toBe('A');
    });
  });
});

function getChildren(node: UiNode): UiNode[] {
  const children: UiNode[] = [];
  let child = node.firstChild;
  while (child !== null) {
    children.push(child);
    child = child.nextSibling;
  }
  return children;
}
