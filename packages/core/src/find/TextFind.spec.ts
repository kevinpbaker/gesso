import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { findMatchesIn } from './TextFind';

const graph = new UiGraph();
let ids = 0;

function textNode(text: string): UiNode {
  const node = graph.createNode(`n${ids++}`, UiNodeType.Text);
  node.setProperty('text', text);
  return node;
}

const textOf = (node: UiNode): string | undefined => node.properties.get('text') as string | undefined;

function found(texts: string[], query: string, matchCase = false): string[] {
  const nodes = texts.map(textNode);
  return findMatchesIn(nodes, textOf, query, { matchCase }).map(
    match => `${nodes.indexOf(match.node)}:${match.start}-${match.end}`
  );
}

describe('findMatchesIn', () => {
  it('finds every occurrence, in document order', () => {
    expect(found(['a cat and a cat', 'no felines', 'one cat'], 'cat')).toEqual(['0:2-5', '0:12-15', '2:4-7']);
  });

  it('ignores case by default and respects it when asked', () => {
    expect(found(['Cat cat CAT'], 'cat')).toEqual(['0:0-3', '0:4-7', '0:8-11']);
    expect(found(['Cat cat CAT'], 'cat', true)).toEqual(['0:4-7']);
  });

  it('does not overlap occurrences, as a find bar does not', () => {
    expect(found(['aaa'], 'aa')).toEqual(['0:0-2']);
  });

  it('has nothing to find for an empty query', () => {
    expect(found(['anything'], '')).toEqual([]);
  });

  it('skips nodes with no text and nodes shorter than the query', () => {
    const nodes = [textNode('hi'), graph.createNode('empty', UiNodeType.Text), textNode('a long line')];
    expect(findMatchesIn(nodes, textOf, 'long')).toHaveLength(1);
  });

  it('matches within a node and never across two', () => {
    expect(found(['hello', 'world'], 'hello world')).toEqual([]);
  });

  /**
   * 'İ' lowercases to two code units, which would shift every offset
   * after it. Rather than highlight the wrong characters, such a string
   * is matched with case.
   */
  it('falls back to a case-sensitive match when folding changes the length', () => {
    expect(found(['İstanbul'], 'stanbul')).toEqual(['0:1-8']);
    expect(found(['İstanbul'], 'STANBUL')).toEqual([]);
  });
});
