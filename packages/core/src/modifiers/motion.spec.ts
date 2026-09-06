import { describe, expect, it } from 'vitest';

import { AnimationDriver } from '../animation/AnimationDriver';
import { fade, slideUp } from '../animation/UiMotionState';
import { Box } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import { UiGraph } from '../graph/UiGraph';
import { motion } from './motion';

function mount(animations: AnimationDriver) {
  const graph = new UiGraph();
  const builder = new UiGraphBuilder(graph, { animations });
  builder.reconcileChildren(graph.root, [
    Box({ width: 100, height: 20, modifiers: [motion({ initial: [fade, slideUp(10)] })] })
  ]);
  const node = graph.root.firstChild!;
  return { node };
}

describe('an entrance', () => {
  it('starts invisible and is driven to rest', () => {
    const animations = new AnimationDriver();
    const { node } = mount(animations);

    expect(node.properties.get('opacity')).toBe(0);

    animations.advance(0);
    animations.advance(1000);

    // Back at rest, the modifier drops its overrides rather than
    // writing them as identity, so the element is left with exactly
    // what it declared.
    expect(node.properties.get('opacity')).toBeUndefined();
    expect(node.properties.get('transform')).toBeUndefined();
  });

  it('is already at rest when nobody can see it arrive', () => {
    // The runtime advances no animation while the document is hidden,
    // and it goes on painting: a change that genuinely happened still
    // marks a node dirty and still gets a frame, so the canvas holds a
    // correct picture rather than whatever was on it when the tab went
    // away. An entrance frozen at its first value is not a correct
    // picture, it is a hole in the page, and it stays a hole for as
    // long as the tab is in the background. So the entrance lands
    // instead of running, which is what reduced motion already does to
    // it and for the same reason: there is nothing for the movement to
    // say to nobody.
    const animations = new AnimationDriver();
    animations.setHidden(true);
    const { node } = mount(animations);

    expect(node.properties.get('opacity')).toBeUndefined();
    expect(node.properties.get('transform')).toBeUndefined();
    expect(animations.isRunning).toBe(false);
  });
});
