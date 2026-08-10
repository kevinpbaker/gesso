import { describe, expect, it } from 'vitest';

import { DirtyFlags } from './DirtyFlags';
import { UiGraph } from './UiGraph';
import { UiNodeType } from './UiNodeType';

describe('UiGraph', () => {
  describe('construction', () => {
    it('creates a root node', () => {
      const graph = new UiGraph();
      expect(graph.root).toBeDefined();
      expect(graph.root.id).toBe('root');
      expect(graph.root.type).toBe(UiNodeType.Root);
    });

    it('registers the root node', () => {
      const graph = new UiGraph();
      expect(graph.getNode('root')).toBe(graph.root);
    });

    it('starts with one node', () => {
      const graph = new UiGraph();
      expect(graph.size).toBe(1);
    });
  });

  describe('node creation', () => {
    it('creates a node', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      expect(node.id).toBe('text');
      expect(node.type).toBe(UiNodeType.Text);
    });

    it('registers a created node', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      expect(graph.getNode('text')).toBe(node);
    });

    it('increments the graph size', () => {
      const graph = new UiGraph();
      graph.createNode('text', UiNodeType.Text);
      expect(graph.size).toBe(2);
    });

    it('rejects duplicate node ids', () => {
      const graph = new UiGraph();
      graph.createNode('text', UiNodeType.Text);
      expect(() => graph.createNode('text', UiNodeType.Text)).toThrow("UI node 'text' already exists.");
    });
  });

  describe('node lookup', () => {
    it('returns undefined for an unknown node', () => {
      const graph = new UiGraph();
      expect(graph.getNode('missing')).toBeUndefined();
    });

    it('returns true for an existing node', () => {
      const graph = new UiGraph();
      graph.createNode('text', UiNodeType.Text);
      expect(graph.hasNode('text')).toBe(true);
    });

    it('returns false for a missing node', () => {
      const graph = new UiGraph();
      expect(graph.hasNode('missing')).toBe(false);
    });

    it('returns the exact node instance', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      expect(graph.getNode('text')).toBe(node);
    });

    it('throws when requiring a missing node', () => {
      const graph = new UiGraph();
      expect(() => graph.requireNode('missing')).toThrow("UI node 'missing' does not exist.");
    });

    it('returns the node when requiring an existing node', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      expect(graph.requireNode('text')).toBe(node);
    });
  });

  describe('appendChild', () => {
    it('assigns the parent', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const child = graph.createNode('child', UiNodeType.Text);
      graph.appendChild(parent, child);
      expect(child.parent).toBe(parent);
    });

    it('sets firstChild when adding the first child', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const child = graph.createNode('child', UiNodeType.Text);
      graph.appendChild(parent, child);
      expect(parent.firstChild).toBe(child);
    });

    it('sets lastChild when adding the first child', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const child = graph.createNode('child', UiNodeType.Text);
      graph.appendChild(parent, child);
      expect(parent.lastChild).toBe(child);
    });

    it('sets sibling relationships when adding multiple children', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const childA = graph.createNode('a', UiNodeType.Text);
      const childB = graph.createNode('b', UiNodeType.Text);
      const childC = graph.createNode('c', UiNodeType.Text);
      graph.appendChild(parent, childA);
      graph.appendChild(parent, childB);
      graph.appendChild(parent, childC);
      expect(parent.firstChild).toBe(childA);
      expect(parent.lastChild).toBe(childC);
      expect(childA.previousSibling).toBeNull();
      expect(childA.nextSibling).toBe(childB);
      expect(childB.previousSibling).toBe(childA);
      expect(childB.nextSibling).toBe(childC);
      expect(childC.previousSibling).toBe(childB);
      expect(childC.nextSibling).toBeNull();
    });

    it('rejects a child that already has a parent', () => {
      const graph = new UiGraph();
      const parentA = graph.createNode('parent-a', UiNodeType.Column);
      const parentB = graph.createNode('parent-b', UiNodeType.Column);
      const child = graph.createNode('child', UiNodeType.Text);
      graph.appendChild(parentA, child);
      expect(() => graph.appendChild(parentB, child)).toThrow("Node 'child' already has a parent.");
    });
  });

  describe('detachNode', () => {
    it('removes the parent relationship', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const child = graph.createNode('child', UiNodeType.Text);
      graph.appendChild(parent, child);
      graph.detachNode(child);
      expect(child.parent).toBeNull();
    });

    it('clears sibling relationships', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const a = graph.createNode('a', UiNodeType.Text);
      const b = graph.createNode('b', UiNodeType.Text);
      graph.appendChild(parent, a);
      graph.appendChild(parent, b);
      graph.detachNode(a);
      expect(a.previousSibling).toBeNull();
      expect(a.nextSibling).toBeNull();
      expect(b.previousSibling).toBeNull();
    });

    it('updates firstChild when removing the first child', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const a = graph.createNode('a', UiNodeType.Text);
      const b = graph.createNode('b', UiNodeType.Text);
      graph.appendChild(parent, a);
      graph.appendChild(parent, b);
      graph.detachNode(a);
      expect(parent.firstChild).toBe(b);
      expect(parent.lastChild).toBe(b);
    });

    it('updates lastChild when removing the last child', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const a = graph.createNode('a', UiNodeType.Text);
      const b = graph.createNode('b', UiNodeType.Text);
      graph.appendChild(parent, a);
      graph.appendChild(parent, b);
      graph.detachNode(b);
      expect(parent.firstChild).toBe(a);
      expect(parent.lastChild).toBe(a);
    });

    it('can detach the only child', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const child = graph.createNode('child', UiNodeType.Text);
      graph.appendChild(parent, child);
      graph.detachNode(child);
      expect(parent.firstChild).toBeNull();
      expect(parent.lastChild).toBeNull();
    });
  });

  describe('removeNode', () => {
    it('removes the node from the graph', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.removeNode(node);
      expect(graph.hasNode('text')).toBe(false);
    });

    it('decrements the graph size', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.removeNode(node);
      expect(graph.size).toBe(1);
    });

    it('detaches the node from its parent', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const child = graph.createNode('child', UiNodeType.Text);
      graph.appendChild(parent, child);
      graph.removeNode(child);
      expect(child.parent).toBeNull();
      expect(parent.firstChild).toBeNull();
      expect(parent.lastChild).toBeNull();
    });
  });

  describe('properties', () => {
    it('updates a property', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.updateProperty(node.id, 'text', 'Hello', DirtyFlags.Content);
      expect(node.properties.get('text')).toBe('Hello');
    });

    it('updates an existing property', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.updateProperty(node.id, 'text', 'Hello', DirtyFlags.Content);
      graph.updateProperty(node.id, 'text', 'World', DirtyFlags.Content);
      expect(node.properties.get('text')).toBe('World');
    });

    it('does not dirty a node when the value is unchanged', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.updateProperty(node.id, 'text', 'Hello', DirtyFlags.Content);
      graph.clearDirty(node);
      graph.updateProperty(node.id, 'text', 'Hello', DirtyFlags.Content);
      expect(node.isDirty()).toBe(false);
    });

    it('throws when updating a missing node', () => {
      const graph = new UiGraph();
      expect(() => graph.updateProperty('missing', 'text', 'Hello', DirtyFlags.Content)).toThrow(
        "UI node 'missing' does not exist."
      );
    });
  });

  describe('dirty state', () => {
    it('marks a node dirty', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.markDirty(node, DirtyFlags.Paint);
      expect(node.dirtyFlags).toBe(DirtyFlags.Paint);
    });

    it('combines dirty flags', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.markDirty(node, DirtyFlags.Content);
      graph.markDirty(node, DirtyFlags.Paint);
      expect(node.dirtyFlags).toBe(DirtyFlags.Content | DirtyFlags.Paint);
    });

    it('marks a node dirty by id', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.markDirtyById('text', DirtyFlags.Paint);
      expect(node.dirtyFlags).toBe(DirtyFlags.Paint);
    });

    it('clears dirty state', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      graph.markDirty(node, DirtyFlags.Paint);
      graph.clearDirty(node);
      expect(node.dirtyFlags).toBe(DirtyFlags.None);
    });

    it('processes dirty nodes', () => {
      const graph = new UiGraph();
      const nodeA = graph.createNode('a', UiNodeType.Text);
      const nodeB = graph.createNode('b', UiNodeType.Text);
      graph.markDirty(nodeA, DirtyFlags.Paint);
      graph.markDirty(nodeB, DirtyFlags.Paint);
      const processed: string[] = [];
      graph.processDirty(node => {
        processed.push(node.id);
      });
      expect(processed).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('does not process a clean node', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const processed: string[] = [];
      graph.processDirty(current => {
        processed.push(current.id);
      });
      expect(processed).not.toContain(node.id);
    });
  });

  describe('traversal', () => {
    it('traverses a node', () => {
      const graph = new UiGraph();
      const node = graph.createNode('text', UiNodeType.Text);
      const visited: string[] = [];
      graph.traverse(node, current => {
        visited.push(current.id);
      });
      expect(visited).toEqual(['text']);
    });

    it('traverses the entire subtree', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const a = graph.createNode('a', UiNodeType.Text);
      const b = graph.createNode('b', UiNodeType.Text);
      const c = graph.createNode('c', UiNodeType.Text);
      graph.appendChild(parent, a);
      graph.appendChild(parent, b);
      graph.appendChild(b, c);
      const visited: string[] = [];
      graph.traverse(parent, node => {
        visited.push(node.id);
      });
      expect(visited).toEqual(['parent', 'a', 'b', 'c']);
    });

    it('traverses children without visiting the parent', () => {
      const graph = new UiGraph();
      const parent = graph.createNode('parent', UiNodeType.Column);
      const a = graph.createNode('a', UiNodeType.Text);
      const b = graph.createNode('b', UiNodeType.Text);
      graph.appendChild(parent, a);
      graph.appendChild(parent, b);
      const visited: string[] = [];
      graph.traverseChildren(parent, child => {
        visited.push(child.id);
      });
      expect(visited).toEqual(['a', 'b']);
    });
  });

  it('only stores a dirty node once', () => {
    const graph = new UiGraph();
    const node = graph.createNode('text', UiNodeType.Text);
    graph.markDirty(node, DirtyFlags.Content);
    graph.markDirty(node, DirtyFlags.Paint);
    graph.markDirty(node, DirtyFlags.Layout);
    const processed: UiNode[] = [];
    graph.processDirty(current => {
      processed.push(current);
    });
    expect(processed).toHaveLength(1);
    expect(processed[0]).toBe(node);
  });
});
