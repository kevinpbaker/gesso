import { BehaviorSubject } from 'rxjs';

import { describe, expect, it } from 'vitest';

import { LayoutEngine } from '../layout/LayoutEngine';
import { Constraints } from '../layout/LayoutTypes';
import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { Box, Column, Row, Text } from './UiComponents';
import type { UiElement } from './UiElement';
import { UiGraphBuilder } from './UiGraphBuilder';

describe('UiGraphBuilder observable children', () => {
  function createBuilder() {
    const graph = new UiGraph();
    const builder = new UiGraphBuilder(graph);
    return { graph, builder };
  }

  function getChildren(node: UiNode): UiNode[] {
    const children: UiNode[] = [];
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      children.push(child);
    }
    return children;
  }

  describe('single observable child', () => {
    it('creates a fragment anchor and reconciles the emitted element', () => {
      const { builder } = createBuilder();
      const child$ = new BehaviorSubject<UiElement>(Text({ text: 'A' }));

      const root = builder.build(Column(child$));

      const rootChildren = getChildren(root);
      expect(rootChildren).toHaveLength(1);
      expect(rootChildren[0].type).toBe(UiNodeType.Fragment);

      const fragmentChildren = getChildren(rootChildren[0]);
      expect(fragmentChildren).toHaveLength(1);
      expect(fragmentChildren[0].type).toBe(UiNodeType.Text);
      expect(fragmentChildren[0].getProperty('text')).toBe('A');
    });

    it('updates the child when the observable emits a new element', () => {
      const { builder } = createBuilder();
      const child$ = new BehaviorSubject(Text({ text: 'A' }));

      const root = builder.build(Column(child$));
      const fragment = getChildren(root)[0];

      child$.next(Text({ text: 'B' }));

      const fragmentChildren = getChildren(fragment);
      expect(fragmentChildren).toHaveLength(1);
      expect(fragmentChildren[0].getProperty('text')).toBe('B');
    });
  });

  describe('observable array child', () => {
    it('reconciles an array of elements', () => {
      const { builder } = createBuilder();
      const items$ = new BehaviorSubject([Text({ text: 'A' }), Text({ text: 'B' })]);

      const root = builder.build(Column(items$));
      const fragment = getChildren(root)[0];
      const children = getChildren(fragment);

      expect(children).toHaveLength(2);
      expect(children[0].getProperty('text')).toBe('A');
      expect(children[1].getProperty('text')).toBe('B');
    });

    it('updates the list when the observable emits new items', () => {
      const { builder } = createBuilder();
      const items$ = new BehaviorSubject([Text({ key: 'a', text: 'A' })]);

      const root = builder.build(Column(items$));
      const fragment = getChildren(root)[0];

      const firstNode = getChildren(fragment)[0];
      items$.next([Text({ key: 'a', text: 'A2' }), Text({ key: 'b', text: 'B' })]);

      const children = getChildren(fragment);
      expect(children).toHaveLength(2);
      expect(children[0]).toBe(firstNode);
      expect(children[0].getProperty('text')).toBe('A2');
      expect(children[1].getProperty('text')).toBe('B');
    });

    it('removes items when the observable emits a shorter array', () => {
      const { builder } = createBuilder();
      const items$ = new BehaviorSubject([Text({ text: 'A' }), Text({ text: 'B' }), Text({ text: 'C' })]);

      const root = builder.build(Column(items$));
      const fragment = getChildren(root)[0];

      items$.next([Text({ text: 'A' })]);

      const children = getChildren(fragment);
      expect(children).toHaveLength(1);
      expect(children[0].getProperty('text')).toBe('A');
    });
  });

  describe('mixed static and observable children', () => {
    it('preserves ordering between static and dynamic children', () => {
      const { builder } = createBuilder();
      const items$ = new BehaviorSubject([Text({ text: 'Dynamic1' }), Text({ text: 'Dynamic2' })]);

      const root = builder.build(Column(Text({ text: 'Static1' }), items$, Text({ text: 'Static2' })));

      const children = getChildren(root);
      expect(children).toHaveLength(3);
      expect(children[0].type).toBe(UiNodeType.Text);
      expect(children[0].getProperty('text')).toBe('Static1');
      expect(children[1].type).toBe(UiNodeType.Fragment);
      expect(children[2].type).toBe(UiNodeType.Text);
      expect(children[2].getProperty('text')).toBe('Static2');

      const fragmentChildren = getChildren(children[1]);
      expect(fragmentChildren[0].getProperty('text')).toBe('Dynamic1');
      expect(fragmentChildren[1].getProperty('text')).toBe('Dynamic2');
    });

    it('moves the fragment when the observable child changes position', () => {
      const { builder } = createBuilder();
      const items$ = new BehaviorSubject([Text({ text: 'Dynamic' })]);

      const root = builder.build(Column(items$, Text({ text: 'Static' })));
      expect(getChildren(root)[0].type).toBe(UiNodeType.Fragment);
      expect(getChildren(root)[1].type).toBe(UiNodeType.Text);

      builder.build(Column(Text({ text: 'Static' }), items$));
      expect(getChildren(root)[0].type).toBe(UiNodeType.Text);
      expect(getChildren(root)[1].type).toBe(UiNodeType.Fragment);
    });
  });

  describe('observable child lifecycle', () => {
    it('removes the fragment and its binding when the observable child is gone', () => {
      const { graph, builder } = createBuilder();
      const items$ = new BehaviorSubject([Text({ text: 'A' })]);

      const root = builder.build(Column(items$));
      const fragment = getChildren(root)[0];
      const fragmentId = fragment.id;
      expect(graph.getNode(fragmentId)).toBe(fragment);

      builder.build(Column(Text({ text: 'Static' })));

      expect(graph.getNode(fragmentId)).toBeUndefined();
      expect(getChildren(root)).toHaveLength(1);
      expect(getChildren(root)[0].type).toBe(UiNodeType.Text);
    });

    it('disposes the old binding when the observable reference changes', () => {
      const { builder } = createBuilder();
      const itemsA$ = new BehaviorSubject([Text({ text: 'A' })]);
      const itemsB$ = new BehaviorSubject([Text({ text: 'B' })]);

      const root = builder.build(Column(itemsA$));
      const fragment = getChildren(root)[0];

      builder.build(Column(itemsB$));
      expect(getChildren(fragment)).toHaveLength(1);
      expect(getChildren(fragment)[0].getProperty('text')).toBe('B');

      itemsA$.next([Text({ text: 'A2' })]);
      expect(getChildren(fragment)[0].getProperty('text')).toBe('B');
    });
  });

  describe('fragment transparency in layout', () => {
    it('measures fragment children as direct children of the parent', () => {
      const { builder } = createBuilder();
      const engine = new LayoutEngine();
      const items$ = new BehaviorSubject([Text({ text: 'A' }), Text({ text: 'B' })]);

      const root = builder.build(Column(items$));
      engine.layout(root, Constraints.unbounded());

      // Fragments are transparent to layout: they have no record.
      const fragment = getChildren(root)[0];
      expect(engine.recordFor(fragment)).toBeUndefined();

      const textChildren = getChildren(fragment);
      expect(textChildren).toHaveLength(2);
      expect(engine.recordFor(textChildren[0])?.y).toBe(0);
      expect(engine.recordFor(textChildren[1])?.y).toBeGreaterThan(0);
    });

    it('lays out mixed static and observable children in a Row', () => {
      const { builder } = createBuilder();
      const engine = new LayoutEngine();
      const items$ = new BehaviorSubject([Text({ text: 'B' }), Text({ text: 'C' })]);

      const root = builder.build(Row(Box({ width: 10, height: 10 }), items$, Box({ width: 10, height: 10 })));
      engine.layout(root, Constraints.unbounded());

      const children = getChildren(root);
      expect(children[0].type).toBe(UiNodeType.Box);
      expect(children[1].type).toBe(UiNodeType.Fragment);
      expect(children[2].type).toBe(UiNodeType.Box);

      const firstBoxRecord = engine.recordFor(children[0])!;
      const lastBoxRecord = engine.recordFor(children[2])!;
      expect(lastBoxRecord.x).toBeGreaterThan(firstBoxRecord.x);
    });
  });
});
