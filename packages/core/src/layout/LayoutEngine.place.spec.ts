import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

describe('LayoutEngine placement', () => {
  it('fills the layout root when constraints are bounded', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Box);
    harness.layout(root, Constraints.loose(300, 200));
    expect(harness.box(root)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  it('lays out a stack with padding', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Box);
    root.setProperty('padding', 10);
    const child = harness.createNode('child', UiNodeType.Box);
    child.setProperty('width', 40);
    child.setProperty('height', 20);
    harness.append(root, child);
    harness.layout(root, Constraints.loose(200, 100));
    expect(harness.box(child)).toEqual({ x: 10, y: 10, width: 40, height: 20 });
  });

  it('centres a button\'s content by default, as a box starts it at the top left', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Column);
    const content = (id: string) => {
      const node = harness.createNode(id, UiNodeType.Box);
      node.setProperty('width', 40);
      node.setProperty('height', 16);
      return node;
    };
    const button = harness.createNode('button', UiNodeType.Button);
    button.setProperty('width', 100);
    button.setProperty('height', 30);
    const label = content('label');
    harness.append(button, label);
    const box = harness.createNode('box', UiNodeType.Box);
    box.setProperty('width', 100);
    box.setProperty('height', 30);
    const boxed = content('boxed');
    harness.append(box, boxed);
    harness.append(root, button);
    harness.append(root, box);
    harness.layout(root, Constraints.loose(300, 200));
    expect(harness.box(label)).toEqual({ x: 30, y: 7, width: 40, height: 16 });
    expect(harness.box(boxed)).toEqual({ x: 0, y: 30, width: 40, height: 16 });

    // Saying so still wins: a stretched row spans the button.
    button.setProperty('x', 'stretch');
    harness.layout(root, Constraints.loose(300, 200));
    expect(harness.box(label)).toEqual({ x: 0, y: 7, width: 40, height: 16 });
  });

  it('applies margins around a child', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Row);
    const child = harness.createNode('child', UiNodeType.Box);
    child.setProperty('width', 40);
    child.setProperty('height', 20);
    child.setProperty('marginLeft', 5);
    child.setProperty('marginTop', 3);
    harness.append(root, child);
    harness.layout(root, Constraints.loose(300, 200));
    expect(harness.box(child)).toEqual({ x: 5, y: 3, width: 40, height: 20 });
  });

  it('positions children at padding offsets in a stack', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('app', UiNodeType.Box);
    root.setProperty('paddingTop', 15);
    root.setProperty('paddingLeft', 20);
    const a = harness.createNode('a', UiNodeType.Box);
    const b = harness.createNode('b', UiNodeType.Box);
    harness.append(root, a, b);
    harness.layout(root, Constraints.loose(300, 200));
    expect(harness.box(a)).toEqual({ x: 20, y: 15, width: 0, height: 0 });
    expect(harness.box(b)).toEqual({ x: 20, y: 15, width: 0, height: 0 });
  });
});
