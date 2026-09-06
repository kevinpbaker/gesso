import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from './LayoutTestUtils';
import { percent } from './UiLength';
import { Constraints } from './LayoutTypes';

/**
 * The axis properties, and the order they resolve in: a side beats its
 * axis, and an axis beats the shorthand. `decisions/0079` is why
 * `padding` stayed a single number rather than growing a tuple.
 */
describe('paddingX and paddingY', () => {
  it('pad the two axes independently', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Box);
    root.setProperty('paddingX', 16);
    root.setProperty('paddingY', 10);
    const child = harness.createNode('child', UiNodeType.Box);
    child.setProperty('width', 40);
    child.setProperty('height', 20);
    harness.append(root, child);
    harness.layout(root, Constraints.loose(200, 100));
    expect(harness.box(child)).toEqual({ x: 16, y: 10, width: 40, height: 20 });
  });

  it('an axis wins over the shorthand', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Box);
    root.setProperty('padding', 4);
    root.setProperty('paddingX', 20);
    const child = harness.createNode('child', UiNodeType.Box);
    harness.append(root, child);
    harness.layout(root, Constraints.loose(200, 100));
    expect(harness.box(child)).toMatchObject({ x: 20, y: 4 });
  });

  it('a side wins over its axis', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Box);
    root.setProperty('padding', 4);
    root.setProperty('paddingX', 20);
    root.setProperty('paddingLeft', 0);
    const child = harness.createNode('child', UiNodeType.Box);
    harness.append(root, child);
    harness.layout(root, Constraints.loose(200, 100));
    expect(harness.box(child)).toMatchObject({ x: 0, y: 4 });
  });

  it('take space off the content box on both sides', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Box);
    root.setProperty('paddingX', 25);
    const child = harness.createNode('child', UiNodeType.Box);
    child.setProperty('width', percent(100));
    child.setProperty('height', 10);
    harness.append(root, child);
    harness.layout(root, Constraints.tight(200, 100));
    expect(harness.box(child)).toMatchObject({ x: 25, width: 150 });
  });
});

describe('marginX and marginY', () => {
  it('space a child on both sides of an axis', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Row);
    const child = harness.createNode('child', UiNodeType.Box);
    child.setProperty('width', 40);
    child.setProperty('height', 20);
    child.setProperty('marginX', 5);
    child.setProperty('marginY', 3);
    harness.append(root, child);
    harness.layout(root, Constraints.loose(300, 200));
    expect(harness.box(child)).toEqual({ x: 5, y: 3, width: 40, height: 20 });
  });

  it('a side wins over its axis, which wins over the shorthand', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Row);
    const child = harness.createNode('child', UiNodeType.Box);
    child.setProperty('width', 40);
    child.setProperty('height', 20);
    child.setProperty('margin', 2);
    child.setProperty('marginX', 8);
    child.setProperty('marginLeft', 1);
    harness.append(root, child);
    harness.layout(root, Constraints.loose(300, 200));
    expect(harness.box(child)).toMatchObject({ x: 1, y: 2 });
  });
});
