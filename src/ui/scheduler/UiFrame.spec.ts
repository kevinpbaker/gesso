import { describe, expect, it } from 'vitest';

import { DirtyFlags } from '../DirtyFlags';
import { UiFrame } from './UiFrame';
import { UiNode } from '../UiNode';
import { UiNodeType } from '../UiNodeType';

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
});
