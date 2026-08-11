import { describe, expect, it } from 'vitest';

import { UiGraph } from './UiGraph';
import { UiNodeType } from './UiNodeType';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { lightTheme } from '../environment/UiTheme';
import { defaultTextStyle } from '../properties/UiTextStyle';
import { UiColors } from '../properties/UiColor';
import { DirtyFlags } from './DirtyFlags';

describe('UiGraph environment propagation', () => {
  it('builds a default environment for the root', () => {
    const graph = new UiGraph();
    expect(graph.root.environment).not.toBeNull();
    expect(graph.root.environment!.get(UiEnvironmentKeys.theme)).toBe(lightTheme);
    expect(graph.root.environment!.get(UiEnvironmentKeys.textStyle)).toBe(defaultTextStyle);
    expect(graph.root.environment!.get(UiEnvironmentKeys.contentColor)).toEqual(UiColors.black);
  });

  it('builds a child environment that inherits from the parent', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    parent.setProperty('textStyle', {
      ...defaultTextStyle,
      fontSize: 24
    });
    graph.appendChild(graph.root, parent);
    const child = graph.createNode('child', UiNodeType.Text);
    graph.appendChild(parent, child);

    parent.environment = graph.buildNodeEnvironment(parent);
    child.environment = graph.buildNodeEnvironment(child);

    expect(child.environment!.get(UiEnvironmentKeys.textStyle).fontSize).toBe(24);
  });

  it('detects environment changes', () => {
    const graph = new UiGraph();
    const node = graph.createNode('node', UiNodeType.Box);
    graph.appendChild(graph.root, node);
    const envA = graph.buildNodeEnvironment(node);
    node.environment = envA;
    const envB = envA.set(UiEnvironmentKeys.contentColor, UiColors.red);
    expect(graph.setNodeEnvironment(node, envB)).toBe(true);
    expect(graph.setNodeEnvironment(node, envB)).toBe(false);
  });

  it('propagates environment changes to descendants', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    const child = graph.createNode('child', UiNodeType.Text);
    const grandchild = graph.createNode('grandchild', UiNodeType.Text);
    graph.appendChild(graph.root, parent);
    graph.appendChild(parent, child);
    graph.appendChild(child, grandchild);

    parent.environment = graph.buildNodeEnvironment(parent);
    child.environment = graph.buildNodeEnvironment(child);
    grandchild.environment = graph.buildNodeEnvironment(grandchild);

    parent.setProperty('theme', lightTheme);
    graph.propagateEnvironment(parent);

    expect(parent.isDirty()).toBe(true);
    expect(child.isDirty()).toBe(true);
    expect(grandchild.isDirty()).toBe(true);
  });

  it('processes environment dirty flags without losing other dirty flags', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    const child = graph.createNode('child', UiNodeType.Text);
    graph.appendChild(graph.root, parent);
    graph.appendChild(parent, child);

    parent.environment = graph.buildNodeEnvironment(parent);
    child.environment = graph.buildNodeEnvironment(child);

    graph.markDirty(parent, DirtyFlags.Environment | DirtyFlags.Layout);
    graph.markDirty(child, DirtyFlags.Paint);

    graph.processEnvironmentDirty();

    expect(parent.dirtyFlags & DirtyFlags.Environment).toBe(0);
    expect(parent.dirtyFlags & DirtyFlags.Layout).toBe(DirtyFlags.Layout);
    expect(child.dirtyFlags & DirtyFlags.Paint).toBe(DirtyFlags.Paint);
  });

  it('does not mark descendants dirty when the environment is unchanged', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    const child = graph.createNode('child', UiNodeType.Text);
    graph.appendChild(graph.root, parent);
    graph.appendChild(parent, child);

    parent.environment = graph.buildNodeEnvironment(parent);
    child.environment = graph.buildNodeEnvironment(child);
    graph.clearDirty(parent);
    graph.clearDirty(child);

    graph.propagateEnvironment(parent);

    expect(parent.isDirty()).toBe(false);
    expect(child.isDirty()).toBe(false);
  });
});
