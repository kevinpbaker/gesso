import { describe, expect, it } from 'vitest';

import { UiGraph } from './UiGraph';
import { UiNodeType } from './UiNodeType';

describe('UiGraph.moveWithin', () => {
  function list() {
    const graph = new UiGraph();
    const parent = graph.createNode('list', UiNodeType.Column);
    const [a, b, c] = ['a', 'b', 'c'].map(id => graph.createNode(id, UiNodeType.Box));
    for (const child of [a!, b!, c!]) graph.appendChild(parent, child);
    const order = () => {
      const ids: string[] = [];
      for (let child = parent.firstChild; child !== null; child = child.nextSibling) ids.push(child.id);
      return ids;
    };
    const backwards = () => {
      const ids: string[] = [];
      for (let child = parent.lastChild; child !== null; child = child.previousSibling) ids.push(child.id);
      return ids;
    };
    return { graph, parent, a: a!, b: b!, c: c!, order, backwards };
  }

  it('moves the first child to the end, and keeps the chain whole both ways', () => {
    const { graph, a, order, backwards } = list();
    graph.moveWithin(a, null);
    expect(order()).toEqual(['b', 'c', 'a']);
    expect(backwards()).toEqual(['a', 'c', 'b']);
  });

  it('moves the last child to the front', () => {
    const { graph, a, c, order, backwards, parent } = list();
    graph.moveWithin(c, a);
    expect(order()).toEqual(['c', 'a', 'b']);
    expect(backwards()).toEqual(['b', 'a', 'c']);
    expect(c.parent).toBe(parent);
  });

  it('keeps what the child inherits rather than working it out again', () => {
    const { graph, a, c } = list();
    const environment = a.environment;
    graph.moveWithin(a, null);
    expect(a.environment).toBe(environment);
    graph.moveWithin(c, a);
    expect(a.parent).not.toBeNull();
  });

  it('refuses a reference that is not a sibling', () => {
    const { graph, a } = list();
    const stranger = graph.createNode('stranger', UiNodeType.Box);
    expect(() => graph.moveWithin(a, stranger)).toThrow();
  });
});
