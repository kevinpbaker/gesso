import { BehaviorSubject, combineLatestWith, map, Subject } from 'rxjs';

import { describe, expect, it } from 'vitest';

import { DirtyFlags } from './DirtyFlags';
import { UiGraph } from './UiGraph';
import { UiNodeType } from './UiNodeType';

describe('UiGraph bindings', () => {
  describe('bind', () => {
    it('creates a binding', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      const binding = graph.bind(node, 'text', subject, DirtyFlags.Content | DirtyFlags.Paint);
      expect(binding).toBeDefined();
      expect(binding.nodeId).toBe(node.id);
      expect(binding.property).toBe('text');
    });

    it('connects the binding automatically', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      const binding = graph.bind(node, 'text', subject, DirtyFlags.Content);
      expect(binding.connected()).toBe(true);
    });

    it('updates the node when the observable emits', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      subject.next('Hello');
      expect(node.properties.get('text')).toBe('Hello');
    });

    it('marks the node dirty when the observable emits', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content | DirtyFlags.Paint);
      subject.next('Hello');
      expect(node.dirtyFlags).toBe(DirtyFlags.Content | DirtyFlags.Paint);
    });

    it('does not dirty the node for an identical value', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      subject.next('Hello');
      graph.clearDirty(node);
      subject.next('Hello');
      expect(node.isDirty()).toBe(false);
    });

    it('supports a BehaviorSubject initial value', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new BehaviorSubject('Hello');
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      expect(node.properties.get('text')).toBe('Hello');
    });
  });

  describe('multiple bindings', () => {
    it('allows multiple bindings on one node', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const text$ = new BehaviorSubject('Hello');
      const opacity$ = new BehaviorSubject(0.5);
      graph.bind(node, 'text', text$, DirtyFlags.Content);
      graph.bind(node, 'opacity', opacity$, DirtyFlags.Paint);
      expect(node.properties.get('text')).toBe('Hello');
      expect(node.properties.get('opacity')).toBe(0.5);
    });

    it('allows bindings on different nodes', () => {
      const graph = new UiGraph();
      const textA = graph.createNode('a', UiNodeType.Text);
      const textB = graph.createNode('b', UiNodeType.Text);
      const subjectA = new Subject<string>();
      const subjectB = new Subject<string>();
      graph.bind(textA, 'text', subjectA, DirtyFlags.Content);
      graph.bind(textB, 'text', subjectB, DirtyFlags.Content);
      subjectA.next('A');
      expect(textA.properties.get('text')).toBe('A');
      expect(textB.properties.has('text')).toBe(false);
    });

    it('does not affect unrelated nodes', () => {
      const graph = new UiGraph();
      const nodeA = graph.createNode('a', UiNodeType.Text);
      const nodeB = graph.createNode('b', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(nodeA, 'text', subject, DirtyFlags.Content);
      subject.next('Hello');
      expect(nodeA.isDirty()).toBe(true);
      expect(nodeB.isDirty()).toBe(false);
    });
  });

  describe('unbind', () => {
    it('disconnects the binding', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      const binding = graph.bind(node, 'text', subject, DirtyFlags.Content);
      graph.unbind(binding);
      expect(binding.connected()).toBe(false);
    });

    it('stops future observable updates', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      const binding = graph.bind(node, 'text', subject, DirtyFlags.Content);
      graph.unbind(binding);
      subject.next('Hello');
      expect(node.properties.has('text')).toBe(false);
    });

    it('is safe to unbind twice', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      const binding = graph.bind(node, 'text', subject, DirtyFlags.Content);
      graph.unbind(binding);
      expect(() => graph.unbind(binding)).not.toThrow();
    });
  });

  describe('unbindNode', () => {
    it('disconnects all bindings belonging to a node', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const text$ = new Subject<string>();
      const opacity$ = new Subject<number>();
      const textBinding = graph.bind(node, 'text', text$, DirtyFlags.Content);
      const opacityBinding = graph.bind(node, 'opacity', opacity$, DirtyFlags.Paint);
      graph.unbindNode(node);
      expect(textBinding.connected()).toBe(false);
      expect(opacityBinding.connected()).toBe(false);
    });

    it('does not disconnect bindings belonging to another node', () => {
      const graph = new UiGraph();
      const nodeA = graph.createNode('a', UiNodeType.Text);
      const nodeB = graph.createNode('b', UiNodeType.Text);
      const subjectA = new Subject<string>();
      const subjectB = new Subject<string>();
      graph.bind(nodeA, 'text', subjectA, DirtyFlags.Content);
      const bindingB = graph.bind(nodeB, 'text', subjectB, DirtyFlags.Content);
      graph.unbindNode(nodeA);
      expect(bindingB.connected()).toBe(true);
    });
  });

  describe('node removal and bindings', () => {
    it('removes bindings when a node is removed', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      const binding = graph.bind(node, 'text', subject, DirtyFlags.Content);
      graph.removeNode(node);
      expect(binding.connected()).toBe(false);
    });

    it('prevents removed nodes from receiving future values', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content);
      graph.removeNode(node);
      subject.next('Hello');
      expect(node.properties.has('text')).toBe(false);
    });
  });

  describe('reactive pipelines', () => {
    it('supports derived RxJS values', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const firstName$ = new BehaviorSubject('Kevin');
      const lastName$ = new BehaviorSubject('Baker');
      const fullName$ = firstName$.pipe(
        combineLatestWith(lastName$),
        map(([first, last]) => `${first} ${last}`)
      );
      graph.bind(node, 'text', fullName$, DirtyFlags.Content);
      expect(node.properties.get('text')).toBe('Kevin Baker');
      firstName$.next('John');
      expect(node.properties.get('text')).toBe('John Baker');
    });
  });

  describe('rendering boundary', () => {
    it('does not render when a binding emits', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const subject = new Subject<string>();
      graph.bind(node, 'text', subject, DirtyFlags.Content | DirtyFlags.Paint);
      subject.next('Hello');
      // The node is dirty.
      expect(node.isDirty()).toBe(true);
      // But there is intentionally no renderer
      // involved at this stage.
      //
      // Rendering will be handled later by
      // the frame scheduler.
    });
  });
});
