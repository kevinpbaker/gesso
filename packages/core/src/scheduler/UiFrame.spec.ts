import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../graph/DirtyFlags';
import { UiFrame } from './UiFrame';
import { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';

describe('UiFrame', () => {
  function createNode(id: string): UiNode {
    return new UiNode(id, UiNodeType.Text);
  }

  it('stores its id and time', () => {
    const frame = new UiFrame(3, 42, new Map());
    expect(frame.id).toBe(3);
    expect(frame.time).toBe(42);
  });

  it('exposes its dirty nodes', () => {
    const a = createNode('a');
    const b = createNode('b');
    const frame = new UiFrame(
      0,
      0,
      new Map([
        [a, DirtyFlags.Paint],
        [b, DirtyFlags.Content]
      ])
    );
    expect(frame.nodes).toEqual([a, b]);
    expect(frame.size).toBe(2);
  });

  it('reports whether it is empty', () => {
    const empty = new UiFrame(0, 0, new Map());
    expect(empty.isEmpty()).toBe(true);
    const filled = new UiFrame(0, 0, new Map([[createNode('a'), DirtyFlags.Paint]]));
    expect(filled.isEmpty()).toBe(false);
  });

  it('returns the flags for a node', () => {
    const a = createNode('a');
    const frame = new UiFrame(0, 0, new Map([[a, DirtyFlags.Content | DirtyFlags.Paint]]));
    expect(frame.dirtyFlagsFor(a)).toBe(DirtyFlags.Content | DirtyFlags.Paint);
  });

  it('returns None for a node outside the frame', () => {
    const frame = new UiFrame(0, 0, new Map());
    expect(frame.dirtyFlagsFor(createNode('a'))).toBe(DirtyFlags.None);
  });

  it('walks its nodes with their flags', () => {
    const a = createNode('a');
    const b = createNode('b');
    const frame = new UiFrame(
      0,
      0,
      new Map([
        [a, DirtyFlags.Paint],
        [b, DirtyFlags.Layout]
      ])
    );
    expect([...frame.entries()]).toEqual([
      [a, DirtyFlags.Paint],
      [b, DirtyFlags.Layout]
    ]);
  });

  describe('anyFlags', () => {
    const a = createNode('a');
    const b = createNode('b');
    const frame = new UiFrame(
      0,
      0,
      new Map([
        [a, DirtyFlags.Paint],
        [b, DirtyFlags.Layout | DirtyFlags.Semantics]
      ])
    );

    it('is true when one node carries a flag in the mask', () => {
      expect(frame.anyFlags(DirtyFlags.Layout)).toBe(true);
      expect(frame.anyFlags(DirtyFlags.Paint)).toBe(true);
    });

    it('is true when a node carries any one of several', () => {
      expect(frame.anyFlags(DirtyFlags.Semantics | DirtyFlags.Children)).toBe(true);
    });

    it('is false when no node carries any of them', () => {
      expect(frame.anyFlags(DirtyFlags.Children | DirtyFlags.Transform)).toBe(false);
    });

    it('is false on an empty frame', () => {
      expect(new UiFrame(0, 0, new Map()).anyFlags(DirtyFlags.Layout)).toBe(false);
    });
  });
});
