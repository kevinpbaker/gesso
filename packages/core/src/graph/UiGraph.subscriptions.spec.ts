import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { DirtyFlags } from './DirtyFlags';
import { UiGraph } from './UiGraph';
import { UiNodeType } from './UiNodeType';

/**
 * What a leak looks like from outside, and what a bound prop can say
 * about itself.
 *
 * Both are read by the node report and the devtools panel, and neither
 * was answerable before: the graph knew what it held and nothing asked
 * it, and a binding knew what it had received and kept it to itself.
 */
describe('the subscriptions a graph holds', () => {
  function graph() {
    const built = new UiGraph();
    const node = built.createNode('a', UiNodeType.Box);
    built.appendChild(built.root, node);
    return { graph: built, node };
  }

  it('counts the bound properties of a node, and the whole graph as the sum', () => {
    const { graph: built, node } = graph();
    expect(built.subscriptionsForNode(node)).toBe(0);
    expect(built.subscriptionCount).toBe(0);

    built.bind(node, 'width', new BehaviorSubject(10), DirtyFlags.Layout);
    built.bind(node, 'height', new BehaviorSubject(20), DirtyFlags.Layout);

    expect(built.subscriptionsForNode(node)).toBe(2);
    expect(built.subscriptionCount).toBe(2);
  });

  it('falls back when a node goes, so a count that keeps climbing is a leak and not a rebuild', () => {
    const { graph: built, node } = graph();
    built.bind(node, 'width', new BehaviorSubject(10), DirtyFlags.Layout);

    built.removeNode(node);

    expect(built.subscriptionCount).toBe(0);
  });
});

describe('what a bound property says about its stream', () => {
  it('counts the values it has received and remembers when the last one came', () => {
    const built = new UiGraph();
    const node = built.createNode('a', UiNodeType.Box);
    built.appendChild(built.root, node);
    const width = new Subject<number>();
    const binding = built.bind(node, 'width', width, DirtyFlags.Layout);

    // Nothing yet: a stream that has said nothing is exactly the case
    // a "bound" mark could not tell from one that stopped.
    expect(binding.emissionCount()).toBe(0);
    expect(binding.emittedAt()).toBeNull();

    width.next(40);
    width.next(50);

    expect(binding.emissionCount()).toBe(2);
    expect(binding.emittedAt()).toBeGreaterThan(0);
    expect(binding.value()).toBe(50);
    expect(binding.connected()).toBe(true);
  });
});
