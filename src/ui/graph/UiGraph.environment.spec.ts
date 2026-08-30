import { describe, expect, it } from 'vitest';

import { UiGraph } from './UiGraph';
import { UiNodeType } from './UiNodeType';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { darkTheme, lightTheme } from '../environment/UiTheme';
import { defaultTextStyle } from '../properties/UiTextStyle';
import { UiBasicColors } from '../properties/UiColor';
import { DirtyFlags } from './DirtyFlags';

describe('UiGraph environment propagation', () => {
  it('builds a default environment for the root', () => {
    const graph = new UiGraph();
    expect(graph.root.environment).not.toBeNull();
    expect(graph.root.environment!.get(UiEnvironmentKeys.theme)).toBe(lightTheme);
    expect(graph.root.environment!.get(UiEnvironmentKeys.textStyle)).toBe(defaultTextStyle);
    expect(graph.root.environment!.get(UiEnvironmentKeys.contentColor)).toEqual(UiBasicColors.black);
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
    const envB = envA.set(UiEnvironmentKeys.contentColor, UiBasicColors.red);
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

  it('keeps the same environment instance when nothing changed', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    const child = graph.createNode('child', UiNodeType.Text);
    graph.appendChild(graph.root, parent);
    graph.appendChild(parent, child);
    parent.setProperty('theme', lightTheme);
    graph.propagateEnvironment(parent);

    const parentEnvironment = parent.environment;
    const childEnvironment = child.environment;

    graph.propagateEnvironment(parent);

    // Identity has to survive a propagation that changed nothing:
    // environments are immutable snapshots, and consumers are entitled
    // to treat a stable instance as a stable value.
    expect(parent.environment).toBe(parentEnvironment);
    expect(child.environment).toBe(childEnvironment);
  });

  it('replaces the environment instance when a provider value changes', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    graph.appendChild(graph.root, parent);
    parent.setProperty('theme', lightTheme);
    graph.propagateEnvironment(parent);
    const before = parent.environment;

    parent.setProperty('theme', {
      ...lightTheme,
      colors: { ...lightTheme.colors, background: { r: 0, g: 0, b: 0, a: 1 } }
    });
    graph.propagateEnvironment(parent);

    expect(parent.environment).not.toBe(before);
    expect(parent.isDirty()).toBe(true);
  });

  it('does not arm another frame while processing environment dirt', () => {
    const graph = new UiGraph();
    const parent = graph.createNode('parent', UiNodeType.Box);
    const child = graph.createNode('child', UiNodeType.Text);
    graph.appendChild(graph.root, parent);
    graph.appendChild(parent, child);
    graph.propagateEnvironment(graph.root);
    graph.clearDirty(parent);
    graph.clearDirty(child);

    parent.setProperty('theme', lightTheme);
    graph.markDirty(parent, DirtyFlags.Environment);

    // The phase runs from inside the frame that is about to collect,
    // so the nodes it dirties belong to that frame already.
    let notifications = 0;
    graph.setDirtyListener(() => {
      notifications++;
    });
    graph.processEnvironmentDirty();

    expect(notifications).toBe(0);
    expect(child.isDirty()).toBe(true);
  });

  it('gives a subtree attached later the environment of the tree it joins', () => {
    const graph = new UiGraph();
    const provider = graph.createNode('provider', UiNodeType.Box);
    provider.setProperty('theme', darkTheme);
    graph.appendChild(graph.root, provider);
    graph.propagateEnvironment(graph.root);

    // A row a lazy list mounts as it scrolls, a keyed list's new item:
    // built and attached long after the root's environment was built.
    // Without inheriting at attach it kept `environment === null` and
    // resolved its palette names against the *default* theme, so a
    // chosen row in a dark table came out in the light theme's blue.
    const row = graph.createNode('row', UiNodeType.Box);
    const cell = graph.createNode('cell', UiNodeType.Text);
    graph.appendChild(row, cell);
    graph.appendChild(provider, row);

    expect(row.environment!.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    expect(cell.environment!.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
  });

  it('re-resolves a node moved under a different provider', () => {
    const graph = new UiGraph();
    const light = graph.createNode('light', UiNodeType.Box);
    const dark = graph.createNode('dark', UiNodeType.Box);
    dark.setProperty('theme', darkTheme);
    graph.appendChild(graph.root, light);
    graph.appendChild(graph.root, dark);
    const node = graph.createNode('node', UiNodeType.Box);
    graph.appendChild(light, node);
    graph.propagateEnvironment(graph.root);
    graph.clearDirty(node);

    graph.detachNode(node);
    graph.appendChild(dark, node);

    expect(node.environment!.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    // It already existed and now paints differently, so it is dirty.
    expect(node.isDirty()).toBe(true);
  });
});
