import { describe, expect, it } from 'vitest';

import { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { resolveCursor } from './UiInteraction';

function node(type: UiNodeType, props: Record<string, unknown> = {}, parent?: UiNode): UiNode {
  const created = new UiNode(`n${Math.random()}`, type);
  for (const [key, value] of Object.entries(props)) {
    created.setProperty(key, value);
  }
  if (parent !== undefined) {
    created.parent = parent;
  }
  return created;
}

describe('resolveCursor over text', () => {
  it('shows the I-beam over text that can be selected', () => {
    expect(resolveCursor(node(UiNodeType.Text, { text: 'words' }))).toBe('text');
  });

  it('shows nothing of its own over text that cannot be, or that is empty', () => {
    expect(resolveCursor(node(UiNodeType.Text, { text: 'label', selectable: false }))).toBeNull();
    expect(resolveCursor(node(UiNodeType.Text, { text: '' }))).toBeNull();
  });

  it('keeps a cursor an ancestor set, as a card that presses keeps its pointer over its words', () => {
    const card = node(UiNodeType.Box, { cursor: 'pointer' });
    expect(resolveCursor(node(UiNodeType.Text, { text: 'title' }, card))).toBe('pointer');
  });
});
