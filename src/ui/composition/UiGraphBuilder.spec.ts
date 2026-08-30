import { BehaviorSubject, Subject } from 'rxjs';

import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import { type UiNode } from '../graph/UiNode';
import { Box, Button, Column, Row, Text } from './UiComponents';
import { createElement } from './UiFactory';
import { UiGraphBuilder } from './UiGraphBuilder';

describe('UiGraphBuilder', () => {
  function createBuilder() {
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph);
    return {
      graph,
      builder
    };
  }

  describe('build', () => {
    it('builds a single element', () => {
      const { graph, builder } = createBuilder();
      const definition = Text({
        text: 'Hello'
      });
      const node = builder.build(definition);
      expect(node.type).toBe(UiNodeType.Text);
      expect(graph.getNode(node.id)).toBe(node);
    });

    it('builds a nested tree', () => {
      const { graph, builder } = createBuilder();
      const definition = Column(
        Text({
          text: 'Hello'
        }),
        Row(
          Text({
            text: 'World'
          }),
          Button({
            text: 'Save'
          })
        )
      );
      const root = builder.build(definition);
      expect(root.type).toBe(UiNodeType.Column);
      const children = getChildren(root);
      expect(children).toHaveLength(2);
      expect(children[0].type).toBe(UiNodeType.Text);
      expect(children[1].type).toBe(UiNodeType.Row);
      const rowChildren = getChildren(children[1]);
      expect(rowChildren).toHaveLength(2);
      expect(rowChildren[0].type).toBe(UiNodeType.Text);
      expect(rowChildren[1].type).toBe(UiNodeType.Button);
      expect(graph.getNode(children[0].id)).toBe(children[0]);
    });

    it('preserves child ordering', () => {
      const { builder } = createBuilder();
      const definition = Column(
        Text({
          text: 'A'
        }),
        Text({
          text: 'B'
        }),
        Text({
          text: 'C'
        })
      );
      const root = builder.build(definition);
      const children = getChildren(root);
      expect(children.map(child => child.id)).toHaveLength(3);
      expect(children.map(child => child.getProperty('text'))).toEqual(['A', 'B', 'C']);
    });

    it('builds deeply nested trees', () => {
      const { builder } = createBuilder();
      const definition = Column(
        Row(
          Column(
            Row(
              Text({
                text: 'Deep'
              })
            )
          )
        )
      );
      const root = builder.build(definition);
      const row1 = getChildren(root)[0];
      const column = getChildren(row1)[0];
      const row2 = getChildren(column)[0];
      const text = getChildren(row2)[0];
      expect(text.type).toBe(UiNodeType.Text);
      expect(text.getProperty('text')).toBe('Deep');
    });
  });

  describe('ref prop', () => {
    it('hands the node to ref once, and null when the node is removed', () => {
      const graph = new UiGraph();
      const builder = new UiGraphBuilder(graph);
      const seen: (UiNode | null)[] = [];
      const ref = (node: UiNode | null) => seen.push(node);
      const root = builder.build(Column({}, Box({ ref, width: 10 })));
      expect(seen).toHaveLength(1);
      expect(seen[0]?.type).toBe(UiNodeType.Box);
      expect(root.firstChild?.properties.has('ref')).toBe(false);

      // Same callback identity: not called again.
      builder.build(Column({}, Box({ ref, width: 20 })));
      expect(seen).toHaveLength(1);

      builder.build(Column({}));
      expect(seen).toEqual([seen[0], null]);
    });
  });

  describe('plain properties', () => {
    it('writes plain properties to the node', () => {
      const { builder } = createBuilder();
      const definition = Text({
        text: 'Hello'
      });
      const node = builder.build(definition);
      expect(node.getProperty('text')).toBe('Hello');
    });

    it('writes multiple properties', () => {
      const { builder } = createBuilder();
      const definition = Text({
        text: 'Hello',
        fontSize: 20
      });

      const node = builder.build(definition);
      expect(node.getProperty('text')).toBe('Hello');
      expect(node.getProperty('fontSize')).toBe(20);
    });
  });

  describe('container props', () => {
    it('writes flex props declared on a Column', () => {
      const { builder } = createBuilder();
      const root = builder.build(Column({ gap: 8, padding: 4 }, Text({ text: 'A' }), Text({ text: 'B' })));
      expect(root.type).toBe(UiNodeType.Column);
      expect(root.getProperty('gap')).toBe(8);
      expect(root.getProperty('padding')).toBe(4);
      const children = getChildren(root);
      expect(children).toHaveLength(2);
      expect(children.map(child => child.getProperty('text'))).toEqual(['A', 'B']);
    });

    it('writes alignment props declared on a Row', () => {
      const { builder } = createBuilder();
      const root = builder.build(Row({ x: 'center', y: 'center' }, Text({ text: 'A' })));
      expect(root.type).toBe(UiNodeType.Row);
      expect(root.getProperty('x')).toBe('center');
      expect(root.getProperty('y')).toBe('center');
    });

    it('rejects a prop no property definition declares, naming the closest one', () => {
      // The typed factories reject these at compile time; createElement
      // is the untyped path, which is where the runtime check matters.
      expect(() => createBuilder().builder.build(createElement(UiNodeType.Row, { widht: 100 }))).toThrow(
        /Unknown prop 'widht' on node 'root:0'. Did you mean 'width'\?/
      );
      // CSS names that Gesso spells differently are the common case.
      expect(() => createBuilder().builder.build(createElement(UiNodeType.Row, { alignItems: 'center' }))).toThrow(
        /Unknown prop 'alignItems'/
      );
      // A misspelled event handler with a non-function value is still an event prop.
      expect(() => createBuilder().builder.build(createElement(UiNodeType.Row, { onClik: 'x' }))).toThrow(
        /Unknown prop 'onClik'.*Did you mean 'onClick'/
      );
    });

    it('rejects an unknown prop bound to an Observable as well', () => {
      const { builder } = createBuilder();
      expect(() => builder.build(createElement(UiNodeType.Row, { colour: new BehaviorSubject('#fff') }))).toThrow(
        /Unknown prop 'colour' on node 'root:0'. Did you mean 'color'\?/
      );
    });

    it('accepts every registered property, key and ref', () => {
      const { builder } = createBuilder();
      const seen: unknown[] = [];
      const root = builder.build(
        createElement(
          UiNodeType.Column,
          { key: 'k', ref: (node: unknown) => seen.push(node), hitTestable: false, virtualIndex: 3 },
          [Text({ text: 'A' })]
        )
      );
      expect(root.getProperty('hitTestable')).toBe(false);
      expect(root.getProperty('virtualIndex')).toBe(3);
      expect(seen).toEqual([root]);
    });
  });

  describe('reactive properties', () => {
    it('creates a binding for an Observable property', () => {
      const { graph, builder } = createBuilder();
      const text$ = new BehaviorSubject('Hello');
      const definition = Text({
        text: text$
      });
      const node = builder.build(definition);
      expect(node.getProperty('text')).toBe('Hello');
      const bindings = graph.getBindingsForNode(node);
      expect(bindings).toHaveLength(1);
    });

    it('receives subsequent Observable values', () => {
      const { builder } = createBuilder();
      const text$ = new BehaviorSubject('Hello');
      const definition = Text({
        text: text$
      });
      const node = builder.build(definition);
      expect(node.getProperty('text')).toBe('Hello');
      text$.next('World');
      expect(node.getProperty('text')).toBe('World');
    });

    it('does not create a binding for plain values', () => {
      const { graph, builder } = createBuilder();
      const definition = Text({
        text: 'Hello'
      });
      const node = builder.build(definition);
      const bindings = graph.getBindingsForNode(node);
      expect(bindings).toHaveLength(0);
    });

    it('handles multiple reactive properties', () => {
      const { graph, builder } = createBuilder();
      const text$ = new BehaviorSubject('Hello');
      const size$ = new BehaviorSubject(20);
      const definition = Text({
        text: text$,
        fontSize: size$
      });
      const node = builder.build(definition);
      expect(node.getProperty('text')).toBe('Hello');
      expect(node.getProperty('fontSize')).toBe(20);
      const bindings = graph.getBindingsForNode(node);
      expect(bindings).toHaveLength(2);
    });

    it('updates the runtime property when the Observable changes', () => {
      const { builder } = createBuilder();
      const subject = new Subject<string>();
      const definition = Text({
        text: subject
      });
      const node = builder.build(definition);
      subject.next('First');
      expect(node.getProperty('text')).toBe('First');
      subject.next('Second');
      expect(node.getProperty('text')).toBe('Second');
    });
  });
});

/**
 * Converts the linked-list child structure into an array.
 *
 * This helper intentionally uses the public tree relationships
 * rather than reaching into UiGraph's internal storage.
 */
function getChildren(node: UiNode): UiNode[] {
  const children: UiNode[] = [];
  let child = node.firstChild;
  while (child !== null) {
    children.push(child);
    child = child.nextSibling;
  }
  return children;
}
