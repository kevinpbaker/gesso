import { describe, expect, it } from 'vitest';

import { DirtyFlags } from './DirtyFlags';
import { UiNode } from './UiNode';
import { UiNodeType } from './UiNodeType';

describe('UiNode', () => {
  describe('construction', () => {
    it('creates a node with the supplied id', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.id).toBe('test-node');
    });

    it('creates a node with the supplied type', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.type).toBe(UiNodeType.Text);
    });

    it('starts without a parent', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.parent).toBeNull();
    });

    it('starts without children', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.firstChild).toBeNull();
      expect(node.lastChild).toBeNull();
    });

    it('starts without siblings', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.previousSibling).toBeNull();
      expect(node.nextSibling).toBeNull();
    });

    it('starts with no dirty flags', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.dirtyFlags).toBe(DirtyFlags.None);
    });

    it('starts without properties', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.properties.size).toBe(0);
    });
  });

  describe('hasChildren', () => {
    it('returns false when the node has no children', () => {
      const node = new UiNode('test-node', UiNodeType.Column);
      expect(node.hasChildren()).toBe(false);
    });

    it('returns true when the node has a child', () => {
      const parent = new UiNode('parent', UiNodeType.Column);
      const child = new UiNode('child', UiNodeType.Text);
      parent.firstChild = child;
      expect(parent.hasChildren()).toBe(true);
    });
  });

  describe('isDirty', () => {
    it('returns false when there are no dirty flags', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      expect(node.isDirty()).toBe(false);
    });

    it('returns true when the node has a dirty flag', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      node.dirtyFlags = DirtyFlags.Paint;
      expect(node.isDirty()).toBe(true);
    });

    it('returns true when multiple dirty flags are set', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      node.dirtyFlags = DirtyFlags.Content | DirtyFlags.Paint;
      expect(node.isDirty()).toBe(true);
    });

    it('returns false when all dirty flags are cleared', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      node.dirtyFlags = DirtyFlags.Paint;
      node.dirtyFlags = DirtyFlags.None;
      expect(node.isDirty()).toBe(false);
    });
  });

  describe('properties', () => {
    it('stores arbitrary properties', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      node.properties.set('text', 'Hello');
      expect(node.properties.get('text')).toBe('Hello');
    });

    it('supports multiple properties', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      node.properties.set('text', 'Hello');
      node.properties.set('opacity', 0.5);
      node.properties.set('visible', true);
      expect(node.properties.get('text')).toBe('Hello');
      expect(node.properties.get('opacity')).toBe(0.5);
      expect(node.properties.get('visible')).toBe(true);
    });

    it('overwrites an existing property', () => {
      const node = new UiNode('test-node', UiNodeType.Text);
      node.properties.set('text', 'Hello');
      node.properties.set('text', 'World');
      expect(node.properties.get('text')).toBe('World');
    });
  });
});
