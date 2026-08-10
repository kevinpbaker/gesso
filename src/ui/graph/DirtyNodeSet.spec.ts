import { describe, expect, it } from 'vitest';

import { DirtyNodeSet } from './DirtyNodeSet';
import { UiNode } from './UiNode';
import { UiNodeType } from './UiNodeType';

describe('DirtyNodeSet', () => {
  function createNode(id: string): UiNode {
    return new UiNode(id, UiNodeType.Text);
  }

  describe('mark', () => {
    it('adds a node', () => {
      const set = new DirtyNodeSet();
      const node = createNode('a');
      expect(set.mark(node)).toBe(true);
      expect(set.has(node)).toBe(true);
    });

    it('reports an already present node', () => {
      const set = new DirtyNodeSet();
      const node = createNode('a');
      set.mark(node);
      expect(set.mark(node)).toBe(false);
    });

    it('stores a node only once', () => {
      const set = new DirtyNodeSet();
      const node = createNode('a');
      set.mark(node);
      set.mark(node);
      expect(set.size).toBe(1);
    });
  });

  describe('has', () => {
    it('returns false for an unknown node', () => {
      const set = new DirtyNodeSet();
      expect(set.has(createNode('a'))).toBe(false);
    });
  });

  describe('size', () => {
    it('counts distinct nodes', () => {
      const set = new DirtyNodeSet();
      const a = createNode('a');
      const b = createNode('b');
      set.mark(a);
      set.mark(b);
      set.mark(a);
      expect(set.size).toBe(2);
    });
  });

  describe('isEmpty', () => {
    it('is true when no nodes are marked', () => {
      const set = new DirtyNodeSet();
      expect(set.isEmpty()).toBe(true);
    });

    it('is false when nodes are marked', () => {
      const set = new DirtyNodeSet();
      set.mark(createNode('a'));
      expect(set.isEmpty()).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes a node', () => {
      const set = new DirtyNodeSet();
      const node = createNode('a');
      set.mark(node);
      expect(set.delete(node)).toBe(true);
      expect(set.has(node)).toBe(false);
    });

    it('reports a node that was not present', () => {
      const set = new DirtyNodeSet();
      expect(set.delete(createNode('a'))).toBe(false);
    });
  });

  describe('take', () => {
    it('returns nodes in insertion order', () => {
      const set = new DirtyNodeSet();
      const a = createNode('a');
      const b = createNode('b');
      const c = createNode('c');
      set.mark(a);
      set.mark(b);
      set.mark(a);
      set.mark(c);
      expect(set.take()).toEqual([a, b, c]);
    });

    it('empties the set', () => {
      const set = new DirtyNodeSet();
      set.mark(createNode('a'));
      set.take();
      expect(set.size).toBe(0);
    });

    it('accepts a node again after draining', () => {
      const set = new DirtyNodeSet();
      const node = createNode('a');
      set.mark(node);
      set.take();
      expect(set.mark(node)).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes every node', () => {
      const set = new DirtyNodeSet();
      set.mark(createNode('a'));
      set.mark(createNode('b'));
      set.clear();
      expect(set.isEmpty()).toBe(true);
    });
  });
});
