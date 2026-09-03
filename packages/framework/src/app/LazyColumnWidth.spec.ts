import { describe, expect, it } from 'vitest';

import { Box, LazyColumn, Row, Text, type UiNode } from '@gesso/core';

import { mountRuntime } from './RuntimeTestUtils';

function descendants(node: UiNode): UiNode[] {
  const out: UiNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    out.push(child, ...descendants(child));
  }
  return out;
}

describe('LazyColumn beside something else', () => {
  it("lays its rows out to the list's own width, not the root's", () => {
    const list = LazyColumn({ width: 300, height: 200, count: 3, estimatedExtent: 36 }, index =>
      Row(
        { x: 'stretch', height: 36 },
        Text({
          text: `row ${index} ${'long '.repeat(40)}`,
          flexGrow: 1,
          flexBasis: 0,
          maxLines: 1,
          textOverflow: 'ellipsis'
        })
      )
    );
    const mounted = mountRuntime(Row({ width: 800, height: 600 }, list, Box({ flexGrow: 1 })));
    mounted.frame(16);
    mounted.frame(32);

    const runtime = mounted.runtime;
    const texts = descendants(runtime.debugRoot()).filter(node => node.type === 'text');
    expect(texts.length).toBeGreaterThan(0);
    const rowWidths = texts.map(node => runtime.inspectNode(node.parent!).box.width);
    const textWidths = texts.map(node => runtime.inspectNode(node).box.width);
    expect(rowWidths.every(width => width === 300)).toBe(true);
    expect(textWidths.every(width => width <= 300)).toBe(true);
  });
});
