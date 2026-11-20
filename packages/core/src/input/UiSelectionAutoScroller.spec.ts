import { describe, expect, it } from 'vitest';

import { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import type { LayoutBox } from '../layout/LayoutTypes';
import { UiSelectionAutoScroller } from './UiSelectionAutoScroller';
import type { ScrollContainerState, ScrollSink } from './UiWheelController';

/** Scroll views, each with a box on screen and an offset the sink moves. */
function scene() {
  const outer = new UiNode('outer', UiNodeType.ScrollView);
  const inner = new UiNode('inner', UiNodeType.ScrollView);
  const text = new UiNode('text', UiNodeType.Text);
  inner.parent = outer;
  text.parent = inner;
  const boxes = new Map<UiNode, LayoutBox>([
    [outer, { x: 0, y: 0, width: 400, height: 400 }],
    [inner, { x: 0, y: 100, width: 400, height: 200 }]
  ]);
  const states = new Map<UiNode, ScrollContainerState>([
    [outer, { scrollX: 0, scrollY: 0, maxScrollX: 0, maxScrollY: 1000, horizontal: false }],
    [inner, { scrollX: 0, scrollY: 0, maxScrollX: 0, maxScrollY: 500, horizontal: false }]
  ]);
  const scrolled: [string, number, number][] = [];
  const sink: ScrollSink = {
    containerState: node => states.get(node),
    scrollBy: (node, dx, dy) => {
      scrolled.push([node.id, dx, dy]);
      const state = states.get(node)!;
      states.set(node, { ...state, scrollY: Math.min(Math.max(state.scrollY + dy, 0), state.maxScrollY) });
    }
  };
  const scroller = new UiSelectionAutoScroller(sink, node => boxes.get(node)!);
  return { scroller, text, inner, states, scrolled };
}

describe('UiSelectionAutoScroller', () => {
  it('scrolls nothing while the pointer is well inside the container', () => {
    const { scroller, text, scrolled } = scene();
    expect(scroller.advance({ node: text, x: 200, y: 200 }, 0)).toBe(false);
    expect(scrolled).toEqual([]);
  });

  it('scrolls down past the bottom edge, faster the further past, by the time between frames', () => {
    const { scroller, text, scrolled } = scene();
    scroller.advance({ node: text, x: 200, y: 310 }, 0);
    scroller.advance({ node: text, x: 200, y: 310 }, 16);
    scroller.advance({ node: text, x: 200, y: 340 }, 32);
    const [first, second, third] = scrolled.map(([, , dy]) => dy);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeCloseTo(first!);
    expect(third).toBeGreaterThan(second!);
    expect(scrolled.every(([id]) => id === 'inner')).toBe(true);
  });

  it('hands the scroll to the container around once the inner one is at its end', () => {
    const { scroller, text, inner, states, scrolled } = scene();
    states.set(inner, { ...states.get(inner)!, scrollY: 500 });
    scroller.advance({ node: text, x: 200, y: 395 }, 0);
    expect(scrolled.map(([id]) => id)).toEqual(['outer']);
  });

  it('scrolls up near the top edge, and stops when the drag ends', () => {
    const { scroller, text, inner, states, scrolled } = scene();
    states.set(inner, { ...states.get(inner)!, scrollY: 200 });
    expect(scroller.advance({ node: text, x: 200, y: 105 }, 0)).toBe(true);
    expect(scrolled[0]![2]).toBeLessThan(0);
    expect(scroller.advance(null, 16)).toBe(false);
  });
});
