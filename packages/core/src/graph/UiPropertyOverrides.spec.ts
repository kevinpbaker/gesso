import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DirtyFlags } from './DirtyFlags';
import { UiGraph } from './UiGraph';
import type { UiNode } from './UiNode';
import { UiNodeType } from './UiNodeType';
import { overrideSources, resetOverrideWarnings, writeOverrideProperty } from './UiPropertyOverrides';

function setup(): { graph: UiGraph; node: UiNode; write: (name: string, order: number, value: unknown) => void } {
  const graph = new UiGraph();
  const node = graph.createNode('box', UiNodeType.Box);
  graph.appendChild(graph.root, node);
  const sources = new Map<string, symbol>();
  const write = (name: string, order: number, value: unknown): void => {
    let source = sources.get(name);
    if (source === undefined) {
      source = Symbol(name);
      sources.set(name, source);
    }
    writeOverrideProperty(graph, node, 'width', { source, name, order, value }, DirtyFlags.Layout);
  };
  return { graph, node, write };
}

describe('override cascade order', () => {
  beforeEach(() => {
    resetOverrideWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('keeps entries of equal order in the order they were first written', () => {
    const { node, write } = setup();
    write('b', 1, 20);
    write('a', 0, 10);
    write('c', 1, 30);
    write('d', 1, 40);
    write('e', 0, 50);

    expect(overrideSources(node, 'width')).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(node.properties.get('width')).toBe(40);
  });

  it('does not reorder when an existing entry is written again at the same order', () => {
    const { node, write } = setup();
    write('a', 1, 10);
    write('b', 1, 20);

    write('a', 1, 11);

    expect(overrideSources(node, 'width')).toEqual(['a', 'b']);
    expect(node.properties.get('width')).toBe(20);
  });

  it('re-sorts when an entry changes order, keeping its place among equals', () => {
    const { node, write } = setup();
    write('a', 0, 10);
    write('b', 1, 20);
    write('c', 2, 30);

    // Moving to the end.
    write('a', 3, 11);
    expect(overrideSources(node, 'width')).toEqual(['b', 'c', 'a']);
    expect(node.properties.get('width')).toBe(11);

    // Moving to an order another entry has: the stable sort keeps the one
    // already earlier in the list first.
    write('a', 1, 12);
    expect(overrideSources(node, 'width')).toEqual(['b', 'a', 'c']);
    write('c', 1, 31);
    expect(overrideSources(node, 'width')).toEqual(['b', 'a', 'c']);
    expect(node.properties.get('width')).toBe(31);
  });
});
